import { jsPDF } from "jspdf"
import { DEFAULT_DOCUMENT_CONTENT, collectTabSequence, type Project } from "./projects"

// We export plain text to keep output predictable and avoid rich-text rendering quirks.
function htmlToPlainText(html: string): string {
  const parser = new DOMParser()
  const document = parser.parseFromString(html, "text/html")
  return (document.body.textContent ?? "").replace(/\n{3,}/g, "\n\n").trim()
}

function collectTabSequenceWithDepth(
  tabs: Project["tabs"],
  depth = 0,
): Array<{ id: string; title: string; depth: number }> {
  return tabs.flatMap((tab) => [{ id: tab.id, title: tab.title, depth }, ...collectTabSequenceWithDepth(tab.children, depth + 1)])
}

function truncateTextToWidth(pdf: jsPDF, value: string, maxWidth: number): string {
  if (pdf.getTextWidth(value) <= maxWidth) {
    return value
  }

  const ellipsis = "…"
  const chars = Array.from(value)
  let low = 0
  let high = chars.length

  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    const candidate = `${chars.slice(0, middle).join("")}${ellipsis}`
    if (pdf.getTextWidth(candidate) <= maxWidth) {
      low = middle
    } else {
      high = middle - 1
    }
  }

  return `${chars.slice(0, low).join("")}${ellipsis}`
}

export function exportProjectAsPdf(project: Project) {
  // Export documents in the same depth-first order shown in the tab tree.
  const sequence = collectTabSequence(project.tabs)
  const tocSequence = collectTabSequenceWithDepth(project.tabs)
  const pdf = new jsPDF({ unit: "pt", format: "letter" })
  const marginX = 48
  const headerY = 28
  const headerRuleY = 38
  const contentTop = 66
  const tocHeadingY = contentTop
  const tocEntriesTop = contentTop + 28
  const footerYGap = 32
  const lineHeight = 16
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const contentWidth = pageWidth - marginX * 2
  const contentBottom = pageHeight - footerYGap
  const pageHeaderByNumber: string[] = []
  const maxDocumentLinesPerPage = Math.floor((contentBottom - contentTop) / lineHeight)

  const documentEntries = sequence.map((tab) => {
    const plainText = htmlToPlainText(project.contentById[tab.id] ?? DEFAULT_DOCUMENT_CONTENT)
    const safeText = plainText || "(Empty document)"
    const lines = pdf.splitTextToSize(safeText, contentWidth) as string[]
    const pagesNeeded = Math.max(1, Math.ceil(lines.length / maxDocumentLinesPerPage))
    return {
      ...tab,
      lines,
      pagesNeeded,
    }
  })

  const tocEntriesPerPage = Math.max(1, Math.floor((contentBottom - tocEntriesTop) / lineHeight))
  const tocPages = Math.max(1, Math.ceil(Math.max(1, tocSequence.length) / tocEntriesPerPage))
  const startPageById: Record<string, number> = {}
  let nextStartPage = tocPages + 1

  for (const entry of documentEntries) {
    startPageById[entry.id] = nextStartPage
    nextStartPage += entry.pagesNeeded
  }

  let currentPage = 1

  // Render TOC first so page 1 always contains tab overview info.
  for (let tocPage = 1; tocPage <= tocPages; tocPage += 1) {
    if (tocPage > 1) {
      pdf.addPage()
      currentPage += 1
      pdf.setPage(currentPage)
    } else {
      pdf.setPage(1)
      currentPage = 1
    }

    pageHeaderByNumber[currentPage] = "Table of Contents"

    pdf.setFont("times", "bold")
    pdf.setFontSize(16)
    pdf.text("Table of Contents", marginX, tocHeadingY)

    const startIndex = (tocPage - 1) * tocEntriesPerPage
    const entries = tocSequence.slice(startIndex, startIndex + tocEntriesPerPage)
    let y = tocEntriesTop

    pdf.setFont("times", "normal")
    pdf.setFontSize(12)

    for (const entry of entries) {
      const indent = entry.depth * 18
      const titleX = marginX + indent
      const pageNumberText = String(startPageById[entry.id] ?? tocPages + 1)
      const pageNumberX = pageWidth - marginX
      const availableTitleWidth = Math.max(48, pageNumberX - 20 - titleX)
      const title = truncateTextToWidth(pdf, entry.title, availableTitleWidth)

      pdf.text(title, titleX, y)
      pdf.text(pageNumberText, pageNumberX, y, { align: "right" })
      y += lineHeight
    }
  }

  if (sequence.length === 0) {
    pdf.addPage()
    currentPage += 1
    pdf.setPage(currentPage)
    pageHeaderByNumber[currentPage] = "Documents"

    pdf.setFont("times", "normal")
    pdf.setFontSize(12)
    pdf.text("No documents to export.", marginX, contentTop)
  }

  // Render each tab's text into the document, spanning pages as needed.
  for (const tab of documentEntries) {
    let lineIndex = 0
    pdf.addPage()
    currentPage += 1
    pdf.setPage(currentPage)
    pageHeaderByNumber[currentPage] = tab.title
    let y = contentTop

    while (lineIndex < tab.lines.length) {
      if (y + lineHeight > contentBottom) {
        pdf.addPage()
        currentPage += 1
        pdf.setPage(currentPage)
        pageHeaderByNumber[currentPage] = tab.title
        y = contentTop
      }

      pdf.setFont("times", "normal")
      pdf.setFontSize(12)
      pdf.text(tab.lines[lineIndex], marginX, y)
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
