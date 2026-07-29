import sharp from "sharp"
import { readFile, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const frontendRoot = resolve(__dirname, "..")
const publicDir = join(frontendRoot, "public")
const sourceSvg = join(publicDir, "logo.svg")

const CORNER_RADIUS = 162 / 833
const TILE_COLOR = "#18181a"
const ART_COLOR = "#ffffff"

const RENDER_SIZE = 2000

const outputs = [
  { file: "icon.png", size: 1024, inset: 96 / 1024, art: 0.86 },
  { file: "icon-256.png", size: 256, inset: 96 / 1024, art: 0.86 },
  { file: "favicon.png", size: 256, inset: 0.03, art: 0.68 },
]

function normalizeSvg(raw) {
  const sized = raw
    .replace(/(<svg\b[^>]*?)\swidth="[^"]*"/, "$1")
    .replace(/(<svg\b[^>]*?)\sheight="[^"]*"/, "$1")
    .replace(/(<svg\b[^>]*?)\sfill="[^"]*"/, "$1")
    .replace(/(<svg\b[^>]*?)\sstroke="[^"]*"/, "$1")
  return sized.replace(
    /<svg\b/,
    `<svg width="${RENDER_SIZE}" height="${RENDER_SIZE}" fill="${ART_COLOR}" stroke="${ART_COLOR}"`,
  )
}

function tileSvg(size, radius) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">`
    + `<rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="${TILE_COLOR}"/>`
    + `</svg>`
}

async function main() {
  let raw
  try {
    raw = await readFile(sourceSvg, "utf8")
  } catch {
    console.error(`[icons] source logo missing: ${sourceSvg}`)
    process.exit(1)
  }

  const rendered = await sharp(Buffer.from(normalizeSvg(raw))).png().toBuffer()

  const art = await sharp(rendered).trim({ threshold: 1 }).png().toBuffer()

  for (const { file, size, inset, art: artScale } of outputs) {
    const tile = Math.round(size * (1 - 2 * inset))
    const radius = Math.round(tile * CORNER_RADIUS)
    const artBox = Math.round(tile * artScale)

    const artLayer = await sharp(art)
      .resize(artBox, artBox, { fit: "inside", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .toBuffer()

    const tileLayer = await sharp(Buffer.from(tileSvg(tile, radius)))
      .composite([{ input: artLayer, gravity: "centre" }])
      .png()
      .toBuffer()

    const out = await sharp({
      create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite([{ input: tileLayer, gravity: "centre" }])
      .png()
      .toBuffer()

    await writeFile(join(publicDir, file), out)
    console.log(`[icons] ${file} — ${size}x${size} (tile ${tile}px, radius ${radius}px)`)
  }
}

main().catch((err) => {
  console.error("[icons] failed:", err)
  process.exit(1)
})
