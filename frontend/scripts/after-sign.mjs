import { execFileSync, execSync } from "node:child_process"
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs"
import { fileURLToPath } from "node:url"
import path from "node:path"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const REPO_ROOT = path.resolve(__dirname, "..", "..")
const QUICKLOOK_DIR = path.join(REPO_ROOT, "quicklook")
const HELPER_BUILD_SCRIPT = path.join(QUICKLOOK_DIR, "build.sh")

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

  console.log("[after-sign] building Ivoryscribe Mac Helper extensions …")
  execFileSync("bash", [HELPER_BUILD_SCRIPT], { stdio: "inherit" })
  for (const a of APPEXES) {
    if (!existsSync(a.src)) {
      throw new Error(`[after-sign] build.sh did not produce ${a.src}`)
    }
  }

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

  console.log("[after-sign] re-signing outer app to refresh content hashes …")
  execFileSync("codesign", [
    "--force",
    "--sign", "-",
    "--timestamp=none",
    "--preserve-metadata=identifier,entitlements,flags,requirements,runtime",
    appPath,
  ], { stdio: "inherit" })

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
