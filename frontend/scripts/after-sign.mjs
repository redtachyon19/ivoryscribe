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
const HELPER_APPEX_SRC = path.join(QUICKLOOK_DIR, "build", "IvoryscribeMacHelper.appex")
const HELPER_ENTITLEMENTS = path.join(
  QUICKLOOK_DIR, "Sources", "Extension", "Extension.entitlements"
)

export default async function afterSign(context) {
  if (context.electronPlatformName !== "darwin") {
    console.log("[after-sign] non-darwin build — skipping helper embed")
    return
  }

  const appName = context.packager.appInfo.productFilename
  const appPath = path.join(context.appOutDir, `${appName}.app`)
  const pluginsDir = path.join(appPath, "Contents", "PlugIns")
  const appexDest = path.join(pluginsDir, "IvoryscribeMacHelper.appex")

  if (!existsSync(appPath)) {
    throw new Error(`[after-sign] expected app at ${appPath} but it doesn't exist`)
  }

  // 1. Build the helper .appex fresh. The Swift build is fast (~3s) and
  //    ensures we never embed a stale binary that doesn't match the
  //    current sources.
  console.log("[after-sign] building Ivoryscribe Mac Helper …")
  execFileSync("bash", [HELPER_BUILD_SCRIPT], { stdio: "inherit" })
  if (!existsSync(HELPER_APPEX_SRC)) {
    throw new Error(`[after-sign] build.sh did not produce ${HELPER_APPEX_SRC}`)
  }

  // 2. Copy into Contents/PlugIns/, replacing any prior copy.
  console.log(`[after-sign] embedding into ${path.relative(REPO_ROOT, appexDest)}`)
  mkdirSync(pluginsDir, { recursive: true })
  if (existsSync(appexDest)) rmSync(appexDest, { recursive: true, force: true })
  cpSync(HELPER_APPEX_SRC, appexDest, { recursive: true })

  // 3. Re-sign the .appex in its new location. `cp -R` preserves the
  //    in-place signature but Apple's docs are clear: re-sign after any
  //    move to ensure the signature's path-bound assertions hold. We
  //    re-apply the sandbox entitlement explicitly.
  console.log("[after-sign] signing embedded .appex (sandboxed, ad-hoc) …")
  execFileSync("codesign", [
    "--force",
    "--sign", "-",
    "--timestamp=none",
    "--entitlements", HELPER_ENTITLEMENTS,
    appexDest,
  ], { stdio: "inherit" })

  // 4. Re-sign the outer .app. Its content hashes changed when we wrote
  //    PlugIns/, so its existing signature is invalid. Preserve every
  //    metadata field electron-builder set (identifier, entitlements,
  //    flags, requirements, runtime) so we don't strip anything important
  //    like hardened-runtime flags.
  console.log("[after-sign] re-signing outer app to refresh content hashes …")
  execFileSync("codesign", [
    "--force",
    "--sign", "-",
    "--timestamp=none",
    "--preserve-metadata=identifier,entitlements,flags,requirements,runtime",
    appPath,
  ], { stdio: "inherit" })

  // 5. Verify the embedded extension is sandboxed end-to-end. If this
  //    fails CI we want to know immediately, not after a user reports
  //    "preview is blank in Finder".
  const ents = execSync(
    `codesign -d --entitlements - "${appexDest}" 2>&1`,
    { encoding: "utf8" }
  )
  if (!ents.includes("com.apple.security.app-sandbox")) {
    throw new Error(
      "[after-sign] embedded .appex is missing the app-sandbox entitlement — " +
      "PlugInKit will silently reject it. Investigate the codesign command above."
    )
  }

  console.log("[after-sign] ✅ Ivoryscribe Mac Helper embedded + sandboxed")
}
