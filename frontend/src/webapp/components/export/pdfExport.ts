import JSZip from "jszip"
import { DEFAULT_DOCUMENT_CONTENT, DEFAULT_MARGINS, collectTabSequence, getProjectMarkdownIds, getTabMargins, type DocumentTab, type Project } from "../../../core/utils/projects"
import { renderMarkdownToHtml } from "../../../core/utils/markdown"
import { buildCombinedExportHtml, buildSingleExportHtml, type ExportDoc } from "./typewriterPdfHtml"
import { resolveExportPlan, type ExportMode } from "./exportSelection"
import { downloadBlob, sanitizeZipEntryName, slugifyFileName } from "./exportUtils"
import type { PdfBookmark } from "../../../core/pdf/pdfBookmarkStore"

export type PdfExportMode = ExportMode

type ExportProjectAsPdfOptions = {
  mode?: PdfExportMode
  selectedTabIds?: string[]
}

type ExportTab = { id: string; title: string }

function toExportDoc(project: Project, tab: ExportTab, markdownIds: Set<string>): ExportDoc {
  const raw = project.contentById[tab.id] ?? DEFAULT_DOCUMENT_CONTENT

  // Markdown tabs store raw markdown text — render it the same way the preview
  // pane does so the PDF shows the formatted preview, not the literal source.
  if (markdownIds.has(tab.id)) {
    return {
      title: tab.title,
      html: renderMarkdownToHtml(raw),
      margins: getTabMargins(project, tab.id),
      kind: "markdown",
    }
  }

  return {
    title: tab.title,
    html: raw,
    margins: getTabMargins(project, tab.id),
    kind: "prose",
  }
}

function pdfFileName(project: Project): string {
  const stamp = new Date().toISOString().slice(0, 10)
  return `ivoryscribe-${slugifyFileName(project.name)}-${stamp}.pdf`
}

// Render a self-contained export HTML document to PDF bytes. In Electron the
// hidden BrowserWindow + printToPDF returns the bytes. On the web there is no
// programmatic PDF API, so we fall back to the browser's native print dialog
// (vector + selectable, same layout) and return null — callers that need the
// bytes (the ZIP path) degrade to a combined print on web.
async function htmlToPdfBytes(
  html: string,
): Promise<{ bytes: Uint8Array; chapterStartPages: number[] } | null> {
  const toPdf = window.electronAPI?.print?.toPdf
  if (toPdf) {
    const { pdf, chapterStartPages } = await toPdf(html)
    return { bytes: pdf, chapterStartPages }
  }
  await printHtmlViaIframe(html)
  return null
}

// Mirror the chapter hierarchy as a nested PDF outline. Walks the project's tab
// tree; each tab that was actually exported (i.e. has a recorded start page)
// becomes a bookmark carrying its own exported children. A tab that wasn't
// exported but has exported descendants is skipped and its descendants promoted
// up, so a partial-selection export still produces a coherent tree.
function buildBookmarkTree(tabs: DocumentTab[], pageByTabId: Map<string, number>): PdfBookmark[] {
  const nodes: PdfBookmark[] = []
  for (const tab of tabs) {
    const children = buildBookmarkTree(tab.children, pageByTabId)
    const page = pageByTabId.get(tab.id)
    if (page != null) {
      nodes.push({ id: tab.id, title: tab.title?.trim() || "Untitled", pageNumber: page, children })
    } else if (children.length > 0) {
      nodes.push(...children)
    }
  }
  return nodes
}

// Attach a nested PDF outline (one bookmark per exported chapter, mirroring the
// chapter tree) pointing at the page each chapter starts on. `exportTabs` is the
// flat, in-order list that was paginated, aligned 1:1 with `chapterStartPages`.
// Best-effort: if the outline can't be written, return the original bytes so the
// export still succeeds without bookmarks.
async function withChapterBookmarks(
  bytes: Uint8Array,
  project: Project,
  exportTabs: ExportTab[],
  chapterStartPages: number[],
): Promise<Uint8Array> {
  if (!chapterStartPages || chapterStartPages.length === 0 || exportTabs.length === 0) {
    return bytes
  }
  const pageByTabId = new Map<string, number>()
  exportTabs.forEach((tab, index) => {
    const page = chapterStartPages[index]
    if (page != null) pageByTabId.set(tab.id, page)
  })
  const bookmarks = buildBookmarkTree(project.tabs, pageByTabId)
  if (bookmarks.length === 0) {
    return bytes
  }
  try {
    const { buildPdfWithOutline } = await import("../../../core/pdf/pdfOutlineWriter")
    return await buildPdfWithOutline(bytes, bookmarks)
  } catch (err) {
    console.error("[pdfExport] Could not add chapter bookmarks; exporting without them.", err)
    return bytes
  }
}

// Web fallback: print the export HTML via a hidden iframe. The embedded runtime
// builds the paginated layout and sets window.__pdfxReady; we wait for that
// before invoking print so every page is laid out first.
function printHtmlViaIframe(html: string): Promise<void> {
  return new Promise((resolve) => {
    const iframe = document.createElement("iframe")
    // Real size (off-screen) so the document lays out for measurement.
    iframe.style.cssText = "position:fixed;left:-100000px;top:0;width:816px;height:1056px;border:0;opacity:0;"
    document.body.appendChild(iframe)

    const finish = () => {
      window.setTimeout(() => iframe.remove(), 1000)
      resolve()
    }

    iframe.onload = async () => {
      const win = iframe.contentWindow as (Window & { __pdfxReady?: boolean }) | null
      if (!win) {
        finish()
        return
      }
      const start = Date.now()
      while (!win.__pdfxReady && Date.now() - start < 8000) {
        await new Promise((r) => window.setTimeout(r, 50))
      }
      try {
        win.focus()
        win.print()
      } catch {
        /* user may dismiss; nothing to do */
      }
      finish()
    }

    iframe.srcdoc = html
  })
}

async function exportCombinedPdf(project: Project, tabs: ExportTab[]) {
  const markdownIds = new Set(getProjectMarkdownIds(project))
  const docs = tabs.map((tab) => toExportDoc(project, tab, markdownIds))
  if (docs.length === 0) {
    docs.push({ title: project.name, html: "<p></p>", margins: DEFAULT_MARGINS, kind: "prose" })
  }
  const html = buildCombinedExportHtml(docs)
  const result = await htmlToPdfBytes(html)
  if (result) {
    const bytes = await withChapterBookmarks(result.bytes, project, tabs, result.chapterStartPages)
    downloadBlob(new Blob([bytes.slice()], { type: "application/pdf" }), pdfFileName(project))
  }
}

async function exportSeparatePdfZip(project: Project, sequence: ExportTab[]) {
  const folderName = sanitizeZipEntryName(project.name)
  const toPdf = window.electronAPI?.print?.toPdf

  // The native print dialog can only produce one file, so a true per-tab ZIP is
  // desktop-only. On the web, degrade to a single combined print.
  if (!toPdf) {
    if (sequence.length > 0) {
      console.warn("[pdfExport] Per-file PDF/ZIP export needs the desktop app; printing a single combined PDF instead.")
      await exportCombinedPdf(project, sequence)
      return
    }
  }

  const zip = new JSZip()
  const markdownIds = new Set(getProjectMarkdownIds(project))

  if (!sequence.length) {
    zip.file(`${folderName}/README.txt`, "No documents to export.")
  } else if (toPdf) {
    for (let index = 0; index < sequence.length; index += 1) {
      const tab = sequence[index]
      const html = buildSingleExportHtml(toExportDoc(project, tab, markdownIds))
      const { pdf } = await toPdf(html)
      const fileName = `${String(index + 1).padStart(2, "0")}-${slugifyFileName(tab.title)}.pdf`
      zip.file(`${folderName}/${fileName}`, pdf.slice())
    }
  }

  const zipBlob = await zip.generateAsync({ type: "blob" })
  downloadBlob(zipBlob, `${slugifyFileName(project.name)}-chapters.zip`)
}

// Render the whole project (every tab, in order) to a 1:1 PDF and return it as
// base64 — the same output as the combined PDF export. Used to embed a faithful
// QuickLook preview inside the .tusk file. Electron-only: without the hidden
// BrowserWindow + printToPDF there's no way to get bytes (the web path only
// drives the print dialog), so this returns null on the web.
export async function renderProjectPdfBase64(project: Project): Promise<string | null> {
  const toPdf = window.electronAPI?.print?.toPdf
  if (!toPdf) return null

  const sequence = collectTabSequence(project.tabs)
  const markdownIds = new Set(getProjectMarkdownIds(project))
  const docs = sequence.map((tab) => toExportDoc(project, tab, markdownIds))
  if (docs.length === 0) {
    docs.push({ title: project.name, html: "<p></p>", margins: DEFAULT_MARGINS, kind: "prose" })
  }

  const html = buildCombinedExportHtml(docs)
  const { pdf } = await toPdf(html)
  if (!pdf || pdf.length === 0) return null
  return uint8ToBase64(pdf)
}

// Chunked base64 of a byte array — avoids "Maximum call stack size exceeded"
// from String.fromCharCode(...hugeArray) on large (image-heavy) PDFs.
function uint8ToBase64(bytes: Uint8Array): string {
  let binary = ""
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
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
    await exportSeparatePdfZip(project, sequence)
    return
  }

  const selectedSet = new Set(plan.selectedTabIds)
  const selectedSequence = sequence.filter((tab) => selectedSet.has(tab.id))
  await exportCombinedPdf(project, selectedSequence)
}
