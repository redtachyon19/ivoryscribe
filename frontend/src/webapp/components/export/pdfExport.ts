import { jsPDF } from "jspdf"
import JSZip from "jszip"
import { DEFAULT_DOCUMENT_CONTENT, collectTabSequence, type Project } from "../../../core/projects"
import { resolveExportPlan, type ExportMode } from "./exportSelection"

export type PdfExportMode = ExportMode

type ExportProjectAsPdfOptions = {
  mode?: PdfExportMode
  selectedTabIds?: string[]
}

const PARAGRAPH_TAGS = new Set(["p", "li", "blockquote", "h1", "h2", "h3", "h4", "h5", "h6", "pre"])

function appendTextChunk(buffer: string[], value: string) {
  const normalized = value.replace(/\s+/g, " ")
  if (!normalized) {
    return
  }

  const previous = buffer[buffer.length - 1] ?? ""
  const shouldInsertSpace = Boolean(previous) && !/[\n\s]$/.test(previous) && !/^\s/.test(normalized)
  if (shouldInsertSpace) {
    buffer.push(" ")
  }

  buffer.push(normalized)
}

function extractInlineText(node: Node, buffer: string[]) {
  if (node.nodeType === Node.TEXT_NODE) {
    appendTextChunk(buffer, node.textContent ?? "")
    return
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return
  }

  const element = node as HTMLElement
  const tag = element.tagName.toLowerCase()

  if (tag === "br") {
    const previous = buffer[buffer.length - 1] ?? ""
    if (!previous.endsWith("\n")) {
      buffer.push("\n")
    }
    return
  }

  for (const child of Array.from(element.childNodes)) {
    extractInlineText(child, buffer)
  }
}

function flushInlineBuffer(fragments: Array<string | null>, inlineBuffer: string[]) {
  const text = inlineBuffer.join("").trim()
  if (text) {
    fragments.push(text)
  }
  inlineBuffer.length = 0
}

function extractParagraphFragments(node: Node, fragments: Array<string | null>, inlineBuffer: string[]) {
  if (node.nodeType === Node.TEXT_NODE) {
    appendTextChunk(inlineBuffer, node.textContent ?? "")
    return
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return
  }

  const element = node as HTMLElement
  const tag = element.tagName.toLowerCase()

  if (tag === "br") {
    const previous = inlineBuffer[inlineBuffer.length - 1] ?? ""
    if (!previous.endsWith("\n")) {
      inlineBuffer.push("\n")
    }
    return
  }

  if (PARAGRAPH_TAGS.has(tag)) {
    flushInlineBuffer(fragments, inlineBuffer)
    const paragraphBuffer: string[] = []
    for (const child of Array.from(element.childNodes)) {
      extractInlineText(child, paragraphBuffer)
    }
    const paragraphText = paragraphBuffer.join("").trim()
    if (paragraphText) {
      fragments.push(paragraphText)
    } else {
      // Empty block node acts as an explicit paragraph separator.
      fragments.push(null)
    }
    return
  }

  for (const child of Array.from(element.childNodes)) {
    extractParagraphFragments(child, fragments, inlineBuffer)
  }
}

// We export plain text to keep output predictable and avoid rich-text rendering quirks.
function htmlToPlainText(html: string): string {
  const parser = new DOMParser()
  const document = parser.parseFromString(html, "text/html")
  const fragments: Array<string | null> = []
  const inlineBuffer: string[] = []

  for (const child of Array.from(document.body.childNodes)) {
    extractParagraphFragments(child, fragments, inlineBuffer)
  }

  flushInlineBuffer(fragments, inlineBuffer)

  // Preserve explicit editor paragraph boundaries so export layout matches writing flow.
  const paragraphs: string[] = []

  for (const fragment of fragments) {
    if (fragment === null) {
      paragraphs.push("")
      continue
    }

    paragraphs.push(fragment)
  }

  return paragraphs.join("\n")
}

function wrapTextPreservingBreaks(pdf: jsPDF, value: string, maxWidth: number): string[] {
  const normalized = value.replace(/\r\n?/g, "\n")
  const paragraphs = normalized.split("\n")
  const lines: string[] = []

  for (let index = 0; index < paragraphs.length; index += 1) {
    const paragraph = paragraphs[index]
    if (!paragraph.trim()) {
      lines.push("")
      continue
    }

    const wrapped = pdf.splitTextToSize(paragraph, maxWidth) as string[]
    lines.push(...wrapped)

    if (index < paragraphs.length - 1) {
      lines.push("")
    }
  }

  return lines.length > 0 ? lines : [""]
}

function countPagesForDocumentLines(
  lines: string[],
  contentTop: number,
  contentBottom: number,
  normalLineHeight: number,
  paragraphBreakHeight: number,
) {
  let pages = 1
  let y = contentTop

  for (const line of lines) {
    const lineHeight = line.trim() ? normalLineHeight : paragraphBreakHeight
    if (y + lineHeight > contentBottom) {
      pages += 1
      y = contentTop
    }

    y += lineHeight
  }

  return pages
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

function slugifyFileName(value: string) {
  const trimmed = value.trim().toLowerCase()
  const slug = trimmed
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")

  return slug || "project"
}

function sanitizeZipEntryName(value: string) {
  const trimmed = value.trim()
  const sanitized = trimmed.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim()
  return sanitized || "project"
}

function downloadBlob(blob: Blob, fileName: string) {
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = objectUrl
  link.download = fileName

  document.body.appendChild(link)
  link.click()
  link.remove()

  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl)
  }, 0)
}

function buildSingleDocumentPdf(projectName: string, tabTitle: string, html: string) {
  const pdf = new jsPDF({ unit: "pt", format: "letter" })
  const marginX = 72
  const marginY = 72
  const headerY = marginY
  const headerRuleY = headerY + 10
  const contentTop = headerRuleY + 24
  const lineHeight = 16
  const paragraphBreakHeight = 24
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const contentWidth = pageWidth - marginX * 2
  const contentBottom = pageHeight - marginY

  const bodyFontFamily = "times"
  const bodyFontStyle = "normal"
  const bodyFontSize = 12

  pdf.setFont(bodyFontFamily, bodyFontStyle)
  pdf.setFontSize(bodyFontSize)

  const plainText = htmlToPlainText(html)
  const safeText = plainText || "(Empty document)"
  const lines = wrapTextPreservingBreaks(pdf, safeText, contentWidth)

  let page = 1
  let y = contentTop

  for (const line of lines) {
    const currentLineHeight = line.trim() ? lineHeight : paragraphBreakHeight

    if (y + currentLineHeight > contentBottom) {
      pdf.addPage()
      page += 1
      y = contentTop
    }

    if (line.trim()) {
      pdf.setFont(bodyFontFamily, bodyFontStyle)
      pdf.setFontSize(bodyFontSize)
      pdf.text(line, marginX, y)
    }

    y += currentLineHeight
  }

  const totalPages = pdf.getNumberOfPages()
  for (let currentPage = 1; currentPage <= totalPages; currentPage += 1) {
    pdf.setPage(currentPage)
    pdf.setFont("times", "bold")
    pdf.setFontSize(12)
    pdf.text(`${projectName} · ${tabTitle}`, marginX, headerY)

    pdf.setFont("times", "italic")
    pdf.setFontSize(12)
    pdf.text(`Page ${currentPage} of ${totalPages}`, pageWidth - marginX, headerY, { align: "right" })
    pdf.setDrawColor(170)
    pdf.line(marginX, headerRuleY, pageWidth - marginX, headerRuleY)
  }

  return pdf
}

async function exportProjectAsPdfZip(project: Project, sequence: Array<{ id: string; title: string }>) {
  const folderName = sanitizeZipEntryName(project.name)
  const zip = new JSZip()

  if (!sequence.length) {
    zip.file(`${folderName}/README.txt`, "No documents to export.")
  } else {
    sequence.forEach((tab, index) => {
      const html = project.contentById[tab.id] ?? DEFAULT_DOCUMENT_CONTENT
      const pdf = buildSingleDocumentPdf(project.name, tab.title, html)
      const fileName = `${String(index + 1).padStart(2, "0")}-${slugifyFileName(tab.title)}.pdf`
      zip.file(`${folderName}/${fileName}`, pdf.output("arraybuffer"))
    })
  }

  const zipBlob = await zip.generateAsync({ type: "blob" })
  downloadBlob(zipBlob, `${slugifyFileName(project.name)}-chapters.zip`)
}

function exportProjectAsSinglePdf(
  project: Project,
  sequence: Array<{ id: string; title: string }>,
  tocSequence: Array<{ id: string; title: string; depth: number }>,
) {
  const pdf = new jsPDF({ unit: "pt", format: "letter" })
  // Letter page with true 1-inch margins.
  const marginX = 72
  const marginY = 72
  const headerY = marginY
  const headerRuleY = headerY + 10
  const contentTop = headerRuleY + 24
  const tocHeadingY = contentTop
  const tocEntriesTop = contentTop + 32
  const lineHeight = 16
  const paragraphBreakHeight = 24
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const contentWidth = pageWidth - marginX * 2
  const contentBottom = pageHeight - marginY
  const pageHeaderByNumber: string[] = []

  const bodyFontFamily = "times"
  const bodyFontStyle = "normal"
  const bodyFontSize = 12

  // Keep measurement and rendering in sync so line wrapping is accurate.
  pdf.setFont(bodyFontFamily, bodyFontStyle)
  pdf.setFontSize(bodyFontSize)

  const documentEntries = sequence.map((tab) => {
    const plainText = htmlToPlainText(project.contentById[tab.id] ?? DEFAULT_DOCUMENT_CONTENT)
    const safeText = plainText || "(Empty document)"
    const lines = wrapTextPreservingBreaks(pdf, safeText, contentWidth)
    const pagesNeeded = countPagesForDocumentLines(lines, contentTop, contentBottom, lineHeight, paragraphBreakHeight)
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

    pdf.setFont(bodyFontFamily, bodyFontStyle)
    pdf.setFontSize(bodyFontSize)

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
      const line = tab.lines[lineIndex]
      const currentLineHeight = line.trim() ? lineHeight : paragraphBreakHeight

      if (y + currentLineHeight > contentBottom) {
        pdf.addPage()
        currentPage += 1
        pdf.setPage(currentPage)
        pageHeaderByNumber[currentPage] = tab.title
        y = contentTop
      }

      pdf.setFont(bodyFontFamily, bodyFontStyle)
      pdf.setFontSize(bodyFontSize)
      if (line.trim()) {
        pdf.text(line, marginX, y)
      }
      y += currentLineHeight
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

export async function exportProjectAsPdf(project: Project, options: ExportProjectAsPdfOptions = {}) {
  const sequence = collectTabSequence(project.tabs)
  const plan = resolveExportPlan({
    formatLabel: "PDF",
    tabs: sequence,
    preferredMode: options.mode,
    preferredSelectedTabIds: options.selectedTabIds,
  })

  if (!plan) {
    return
  }

  if (plan.mode === "separate-files") {
    await exportProjectAsPdfZip(project, sequence)
    return
  }

  const selectedSet = new Set(plan.selectedTabIds)
  const selectedSequence = sequence.filter((tab) => selectedSet.has(tab.id))
  const selectedTocSequence = collectTabSequenceWithDepth(project.tabs).filter((tab) => selectedSet.has(tab.id))
  exportProjectAsSinglePdf(project, selectedSequence, selectedTocSequence)
}
