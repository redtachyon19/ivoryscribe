// Module-level registry that lets non-viewer code (e.g. find/replace)
// reach into the text content of an open PDF document.
//
// Why a global registry and not props/context? Find/replace lives in
// the orchestration layer and runs *outside* the editor tree. The
// PDFViewer is mounted inside the editor tree. A registry keyed by
// projectId is the simplest, lowest-coupling bridge — the viewer
// writes its extracted text on doc load, find/replace reads it when
// the user types a query.
//
// Each entry is the full per-page text of one PDF project. PDFs that
// aren't currently rendered have no entry.

export type PdfPageText = {
  /** 1-indexed PDF page number, matching pdf.js's getPage(n). */
  pageNumber: number
  /** Plain text of the page, with item strings space-separated (good
   *  enough for substring matching; not whitespace-perfect). */
  text: string
}

const registry = new Map<string, PdfPageText[]>()

export function registerPdfText(projectId: string, pages: PdfPageText[]): void {
  registry.set(projectId, pages)
}

export function unregisterPdfText(projectId: string): void {
  registry.delete(projectId)
}

export function getPdfText(projectId: string): PdfPageText[] | undefined {
  return registry.get(projectId)
}
