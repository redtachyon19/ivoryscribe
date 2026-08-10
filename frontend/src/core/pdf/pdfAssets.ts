// pdf.js loads a chunk of its rendering data at runtime rather than bundling it:
// CMaps for CID-keyed fonts, the Foxit/Liberation substitutes for the standard 14
// fonts, the WebAssembly decoders for JPEG 2000 / JBIG2 images, and the CMYK ICC
// profile. All of it is copied into public/pdfjs by scripts/copy-pdfjs-assets.mjs.
//
// Miss any of these and pdf.js degrades quietly: unembedded fonts fall back to
// whatever the system offers, and JPX images are dropped entirely (a render that
// depends on one never resolves at all).

export type PdfAssetUrls = {
  cMapUrl: string
  standardFontDataUrl: string
  wasmUrl: string
  iccUrl: string
}

type BinaryDataKind = keyof Omit<PdfAssetUrls, "iccUrl">

export function resolvePdfAssetUrls(): PdfAssetUrls {
  const baseUrl = window.location.href
  return {
    cMapUrl: new URL("pdfjs/cmaps/", baseUrl).toString(),
    standardFontDataUrl: new URL("pdfjs/standard_fonts/", baseUrl).toString(),
    wasmUrl: new URL("pdfjs/wasm/", baseUrl).toString(),
    iccUrl: new URL("pdfjs/iccs/", baseUrl).toString(),
  }
}

/**
 * In a packaged build the renderer is loaded over `file://`, and Chromium blocks
 * both `fetch` and `XMLHttpRequest` between file URLs — so pdf.js's own loader
 * cannot reach the assets sitting next to index.html. Route those reads through
 * the main process instead, which has no such restriction.
 *
 * Returns undefined when the default loader works (dev server, browser build),
 * so pdf.js can keep fetching them directly from the worker.
 */
export function createPdfBinaryDataFactory(): (new (urls: Partial<PdfAssetUrls>) => {
  fetch(request: { kind: BinaryDataKind; filename: string }): Promise<Uint8Array>
}) | undefined {
  if (window.location.protocol !== "file:") return undefined
  const readFileBinary = window.electronAPI?.fs?.readFileBinary
  if (typeof readFileBinary !== "function") return undefined

  return class FileUrlBinaryDataFactory {
    private readonly urls: Partial<PdfAssetUrls>

    constructor(urls: Partial<PdfAssetUrls>) {
      this.urls = urls
    }

    async fetch({ kind, filename }: { kind: BinaryDataKind; filename: string }): Promise<Uint8Array> {
      const baseUrl = this.urls[kind]
      if (!baseUrl) throw new Error(`Ensure that the \`${kind}\` API parameter is provided.`)
      const url = `${baseUrl}${filename}`
      try {
        const bytes = await readFileBinary(decodeURIComponent(new URL(url).pathname))
        return bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
      } catch {
        throw new Error(`Unable to load ${kind} data at: ${url}`)
      }
    }
  }
}
