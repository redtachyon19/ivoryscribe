import { jsPDF } from "jspdf"
import { DEFAULT_DOCUMENT_CONTENT, collectTabSequence, type Project } from "./projects"

// We export plain text to keep output predictable and avoid rich-text rendering quirks.
function htmlToPlainText(html: string): string {
  const parser = new DOMParser()
  const document = parser.parseFromString(html, "text/html")
  return (document.body.textContent ?? "").replace(/\n{3,}/g, "\n\n").trim()
}

export function exportProjectAsPdf(project: Project) {
  // Export documents in the same depth-first order shown in the tab tree.
  const sequence = collectTabSequence(project.tabs)
  const pdf = new jsPDF({ unit: "pt", format: "letter" })
  const marginX = 48
  const headerY = 28
  const headerRuleY = 38
  const contentTop = 66
  const footerYGap = 32
  const lineHeight = 16
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const contentWidth = pageWidth - marginX * 2
  const contentBottom = pageHeight - footerYGap
  const pageHeaderByNumber: string[] = []
  let currentPage = 1
  let firstPageUsed = false

  // Adds a page when needed and stores which tab title should appear in that page header.
  const writeNewPage = (headerTitle: string) => {
    if (!firstPageUsed) {
      firstPageUsed = true
      pdf.setPage(1)
    } else {
      pdf.addPage()
      currentPage += 1
      pdf.setPage(currentPage)
    }

    pageHeaderByNumber[currentPage] = headerTitle
    return contentTop
  }

  if (sequence.length === 0) {
    const y = writeNewPage("Documents")
    pdf.setFont("times", "normal")
    pdf.setFontSize(12)
    pdf.text("No documents to export.", marginX, y)
  }

  // Render each tab's text into the document, spanning pages as needed.
  for (const tab of sequence) {
    const plainText = htmlToPlainText(project.contentById[tab.id] ?? DEFAULT_DOCUMENT_CONTENT)
    const safeText = plainText || "(Empty document)"
    const lines = pdf.splitTextToSize(safeText, contentWidth) as string[]
    let lineIndex = 0
    let y = writeNewPage(tab.title)

    while (lineIndex < lines.length) {
      if (y + lineHeight > contentBottom) {
        y = writeNewPage(tab.title)
      }

      pdf.setFont("times", "normal")
      pdf.setFontSize(12)
      pdf.text(lines[lineIndex], marginX, y)
      y += lineHeight
      lineIndex += 1
    }
  }

  const totalPages = pdf.getNumberOfPages()

  // Second pass: draw consistent header and global page numbers for all pages.
  for (let page = 1; page <= totalPages; page += 1) {
    pdf.setPage(page)
    pdf.setFont("times", "bold")
    pdf.setFontSize(12)
    const documentHeader = pageHeaderByNumber[page] ?? "Document"
    pdf.text(`${project.name} · ${documentHeader}`, marginX, headerY)

    pdf.setFont("times", "italic")
    pdf.setFontSize(12)
    pdf.text(`Page ${page} of ${totalPages}`, pageWidth - marginX, headerY, { align: "right" })
    pdf.setDrawColor(170)
    pdf.line(marginX, headerRuleY, pageWidth - marginX, headerRuleY)
  }

  const stamp = new Date().toISOString().slice(0, 10)
  const slug = project.name.toLowerCase().replace(/\s+/g, "-")
  // Download file with project name + date for easier sorting.
  pdf.save(`ivoryscribe-${slug}-${stamp}.pdf`)
}
