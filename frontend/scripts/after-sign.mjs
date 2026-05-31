// after-sign.mjs — electron-builder afterSign hook.
//
// Runs after electron-builder has signed Ivoryscribe.app and before the DMG
// is built. Our job: take the prebuilt IvoryscribeMacHelper.appex from
// ../quicklook/build/, embed it inside the app at Contents/PlugIns/, and
// re-sign things in the right order so:
//
//   1. The .appex carries our sandbox entitlement (REQUIRED — PlugInKit
//      refuses to load non-sandboxed extensions).
//   2. The outer Ivoryscribe.app's signature is still valid (its content
//      changed when we added PlugIns/, so its old signature is stale).
//   3. electron-builder's existing entitlements/identifier/flags on the
//      outer .app are preserved (via --preserve-metadata).
//
// Why afterSign and not afterPack? electron-builder's outer signing pass
// re-signs every nested binary it walks, which would clobber our sandbox
// entitlements. Adding the .appex AFTER the outer sign keeps us in control
// of the inner signature.
//
// Skips on non-darwin builds.

import { execFileSync, execSync } from "node:child_process"
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs"
import { fileURLToPath } from "node:url"
import path from "node:path"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
// frontend/scripts/after-sign.mjs → repo root is two levels up.
const REPO_ROOT = path.resolve(__dirname, "..", "..")
const QUICKLOOK_DIR = path.join(REPO_ROOT, "quicklook")
const HELPER_BUILD_SCRIPT = path.join(QUICKLOOK_DIR, "build.sh")

// Both QuickLook extensions to embed: the HTML preview (Spacebar panel) and
// the Core-Graphics thumbnail (Finder file icon). Each is a separate .appex
// because one bundle declares exactly one NSExtension point.
const APPEXES = [
  {
    name: "IvoryscribeMacHelper.appex",
    src: path.join(QUICKLOOK_DIR, "build", "IvoryscribeMacHelper.appex"),
    entitlements: path.join(QUICKLOOK_DIR, "Sources", "Extension", "Extension.entitlements"),
  },
  {
    name: "IvoryscribeThumbnail.appex",
    src: path.join(QUICKLOOK_DIR, "build", "IvoryscribeThumbnail.appex"),
    entitlements: path.join(QUICKLOOK_DIR, "Sources", "Thumbnail", "Thumbnail.entitlements"),
  },
]

export default async function afterSign(context) {
  if (context.electronPlatformName !== "darwin") {
    console.log("[after-sign] non-darwin build — skipping helper embed")
    return
  }

  const appName = context.packager.appInfo.productFilename
  const appPath = path.join(context.appOutDir, `${appName}.app`)
  const pluginsDir = path.join(appPath, "Contents", "PlugIns")

  if (!existsSync(appPath)) {
    throw new Error(`[after-sign] expected app at ${appPath} but it doesn't exist`)
  }

  // 1. Build the helper .appex bundles fresh (preview + thumbnail). The Swift
  //    build is fast (~5s) and ensures we never embed stale binaries.
  console.log("[after-sign] building Ivoryscribe Mac Helper extensions …")
  execFileSync("bash", [HELPER_BUILD_SCRIPT], { stdio: "inherit" })
  for (const a of APPEXES) {
    if (!existsSync(a.src)) {
      throw new Error(`[after-sign] build.sh did not produce ${a.src}`)
    }
  }

  // 2-3. Embed each .appex into Contents/PlugIns/ and re-sign it in place
  //      with the sandbox entitlement (PlugInKit rejects non-sandboxed
  //      extensions). cp -R preserves the signature but Apple's docs say
  //      re-sign after any move so path-bound assertions hold.
  mkdirSync(pluginsDir, { recursive: true })
  for (const a of APPEXES) {
    const dest = path.join(pluginsDir, a.name)
    console.log(`[after-sign] embedding ${a.name} → ${path.relative(REPO_ROOT, dest)}`)
    if (existsSync(dest)) rmSync(dest, { recursive: true, force: true })
    cpSync(a.src, dest, { recursive: true })
    execFileSync("codesign", [
      "--force",
      "--sign", "-",
      "--timestamp=none",
      "--entitlements", a.entitlements,
      dest,
    ], { stdio: "inherit" })
  }

  // 4. Re-sign the outer .app. Its content hashes changed when we wrote
  //    PlugIns/, so its existing signature is stale. Preserve every metadata
  //    field electron-builder set (identifier, entitlements, flags,
  //    requirements, runtime).
  console.log("[after-sign] re-signing outer app to refresh content hashes …")
  execFileSync("codesign", [
    "--force",
    "--sign", "-",
    "--timestamp=none",
    "--preserve-metadata=identifier,entitlements,flags,requirements,runtime",
    appPath,
  ], { stdio: "inherit" })

  // 5. Verify each embedded extension is sandboxed end-to-end.
  for (const a of APPEXES) {
    const dest = path.join(pluginsDir, a.name)
    const ents = execSync(`codesign -d --entitlements - "${dest}" 2>&1`, { encoding: "utf8" })
    if (!ents.includes("com.apple.security.app-sandbox")) {
      throw new Error(
        `[after-sign] embedded ${a.name} is missing the app-sandbox entitlement — ` +
        "PlugInKit will silently reject it."
      )
    }
  }

  console.log("[after-sign] ✅ Ivoryscribe Mac Helper (preview + thumbnail) embedded + sandboxed")
}
