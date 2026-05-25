// Copies the `cmaps/` and `standard_fonts/` directories from the
// installed pdfjs-dist package into `public/pdfjs/` so Vite serves them
// at predictable URLs. PDFViewer points pdf.js at these via
// `cMapUrl` and `standardFontDataUrl` so PDF documents that depend on
// the standard 14 PDF fonts (Helvetica, Times, Courier variants) or
// non-Latin character maps render with the right glyphs instead of
// falling back to generic boxes.
//
// Runs automatically via the `predev` / `prebuild` npm hooks so a fresh
// `npm install` followed by `npm run dev` always has the assets in
// place. The output dir is gitignored — it's a build artefact, not
// source.

import { access, cp, mkdir, rm } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const frontendRoot = resolve(__dirname, "..")
const pdfjsRoot = join(frontendRoot, "node_modules", "pdfjs-dist")
const publicTarget = join(frontendRoot, "public", "pdfjs")

const pairs = [
  { src: join(pdfjsRoot, "cmaps"), dest: join(publicTarget, "cmaps") },
  { src: join(pdfjsRoot, "standard_fonts"), dest: join(publicTarget, "standard_fonts") },
]

async function exists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function main() {
  if (!(await exists(pdfjsRoot))) {
    console.error(`[copy-pdfjs] pdfjs-dist is not installed at ${pdfjsRoot} — run "npm install" first.`)
    process.exit(1)
  }

  await mkdir(publicTarget, { recursive: true })

  for (const { src, dest } of pairs) {
    if (!(await exists(src))) {
      console.warn(`[copy-pdfjs] source missing: ${src} (skipping)`)
      continue
    }
    // Wipe the previous copy so removed files from a newer
    // pdfjs-dist release don't linger.
    await rm(dest, { recursive: true, force: true })
    await cp(src, dest, { recursive: true })
    console.log(`[copy-pdfjs] ${src} → ${dest}`)
  }
}

main().catch((err) => {
  console.error("[copy-pdfjs] failed:", err)
  process.exit(1)
})
