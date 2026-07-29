export type PdfPageText = {
  pageNumber: number
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
