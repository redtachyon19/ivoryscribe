import { useCallback, useEffect, useRef, useState } from "react"
import { AlertCircle, FileText } from "lucide-react"
import * as pdfjs from "pdfjs-dist"
import { TextLayer } from "pdfjs-dist"
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist"
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url"
import { registerPdfText, unregisterPdfText, type PdfPageText } from "../../../core/pdf/pdfTextRegistry"
import { createPdfBinaryDataFactory, resolvePdfAssetUrls } from "../../../core/pdf/pdfAssets"
import {
  initPdfBookmarks,
  clearPdfBookmarks,
  reportCurrentPage,
  createBookmarkId,
  type PdfBookmark,
} from "../../../core/pdf/pdfBookmarkStore"
import {
  APP_COLOR_PALETTE_CHANGE_EVENT,
  APP_PROJECT_SEARCH_FOCUS_EVENT,
  APP_PROJECT_SEARCH_CLEAR_EVENT,
  APP_PDF_BOOKMARK_NAVIGATE_EVENT,
  EDITOR_COMMAND_EVENT,
  type EditorCommand,
  type ProjectSearchFocusDetail,
  type PdfBookmarkNavigateDetail,
} from "../../../core/events/editorEvents"
import "./PDFViewer.css"

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

type PDFViewerProps = {
  workspaceRoot: string | null
  relativePath: string
  projectId: string
  documentId: string | null
  matchPalette?: boolean
}

const MIN_ZOOM = 0.25
const MAX_ZOOM = 8

// Whether a page is painted on dark stock, which decides the direction the link
// hover blend has to run. Handles the forms the palette tokens actually use.
function isDarkColor(color: string): boolean {
  const value = color.trim()
  let r: number, g: number, b: number
  if (/^#[0-9a-f]{3}$/i.test(value)) {
    r = parseInt(value[1] + value[1], 16)
    g = parseInt(value[2] + value[2], 16)
    b = parseInt(value[3] + value[3], 16)
  } else if (/^#[0-9a-f]{6}$/i.test(value)) {
    r = parseInt(value.slice(1, 3), 16)
    g = parseInt(value.slice(3, 5), 16)
    b = parseInt(value.slice(5, 7), 16)
  } else {
    const parts = value.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i)
    if (!parts) return false
    r = Number(parts[1])
    g = Number(parts[2])
    b = Number(parts[3])
  }
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.5
}

function collectMatchRanges(container: HTMLElement, needle: string): Range[] {
  const ranges: Range[] = []
  if (!needle) return ranges
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
  type Slot = { node: Text; start: number; len: number }
  const slots: Slot[] = []
  let total = 0
  let current = walker.nextNode() as Text | null
  while (current) {
    const len = current.nodeValue?.length ?? 0
    if (len > 0) {
      slots.push({ node: current, start: total, len })
      total += len
    }
    current = walker.nextNode() as Text | null
  }
  if (slots.length === 0) return ranges

  const haystack = slots.map((s) => s.node.nodeValue ?? "").join("").toLowerCase()
  const needleLower = needle.toLowerCase()

  let fromIndex = 0
  while (fromIndex <= haystack.length - needleLower.length) {
    const idx = haystack.indexOf(needleLower, fromIndex)
    if (idx === -1) break
    const endOffset = idx + needleLower.length
    const startSlot = slots.find((s) => idx >= s.start && idx <= s.start + s.len)
    const endSlot = slots.find((s) => endOffset >= s.start && endOffset <= s.start + s.len)
    if (startSlot && endSlot) {
      try {
        const range = document.createRange()
        range.setStart(startSlot.node, idx - startSlot.start)
        range.setEnd(endSlot.node, endOffset - endSlot.start)
        ranges.push(range)
      } catch {
      }
    }
    fromIndex = idx + Math.max(1, needleLower.length)
  }
  return ranges
}

// Pages are rasterised at exactly the pixel size they are displayed at, so glyphs
// land on the device pixel grid instead of being resampled from an oversized bitmap.
// Zooming re-rasterises once the gesture settles; until then the existing bitmap is
// stretched by CSS so the gesture stays responsive.
const MAX_CANVAS_PIXELS = 2 ** 25
const ZOOM_RERENDER_DELAY_MS = 180

type PdfDestination = string | unknown[] | null

// A destination is either a named string that has to be looked up, or an explicit
// array whose first entry is a page reference. Shared by the outline and by link
// annotations, which use the same encoding.
async function resolveDestinationPage(doc: PDFDocumentProxy, dest: PdfDestination): Promise<number | null> {
  try {
    const explicit = typeof dest === "string" ? await doc.getDestination(dest) : dest
    if (!Array.isArray(explicit) || explicit.length === 0) return null
    const ref = explicit[0]
    if (!ref || typeof ref !== "object") return null
    const pageIndex = await doc.getPageIndex(ref as Parameters<PDFDocumentProxy["getPageIndex"]>[0])
    return pageIndex + 1
  } catch {
    return null
  }
}

// pdf.js only populates `url` for protocols it considers safe, but this is the last
// gate before a link can reach shell.openExternal, so re-check it here.
const SAFE_LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"])

function isSafeExternalLink(url: string): boolean {
  try {
    return SAFE_LINK_PROTOCOLS.has(new URL(url).protocol)
  } catch {
    return false
  }
}

// clientWidth includes the horizontal padding the pages are inset by, so fitting a
// page to it overflows the column and forces a horizontal scrollbar.
function measureContentWidth(el: HTMLElement): number {
  const cs = getComputedStyle(el)
  return el.clientWidth - parseFloat(cs.paddingLeft || "0") - parseFloat(cs.paddingRight || "0")
}

function applyZoomToPdfWrapper(
  wrapper: HTMLDivElement,
  baseW: number,
  baseH: number,
  zoom: number,
): void {
  const displayW = baseW * zoom
  const displayH = baseH * zoom

  wrapper.style.width = `${displayW}px`
  wrapper.style.height = `${displayH}px`

  const canvas = wrapper.querySelector<HTMLCanvasElement>(".pdf-viewer__page")
  if (canvas) {
    canvas.style.width = `${displayW}px`
    canvas.style.height = `${displayH}px`
  }

  // The text and link layers are both laid out at fit-width size and scaled into
  // place, so their geometry never has to be recomputed on zoom.
  for (const selector of [".pdf-viewer__text-layer", ".pdf-viewer__link-layer"]) {
    const layer = wrapper.querySelector<HTMLDivElement>(selector)
    if (!layer) continue
    layer.style.width = `${baseW}px`
    layer.style.height = `${baseH}px`
    layer.style.transform = `scale(${zoom})`
    layer.style.transformOrigin = "0 0"
  }

  // The hover tints cannot ride that transform: a transform would make their layer a
  // stacking context, and a blend never reaches past one to the canvas it has to read.
  // They are re-laid out in display pixels from the fit-width geometry instead.
  for (const tint of wrapper.querySelectorAll<HTMLDivElement>(".pdf-viewer__link-tint")) {
    tint.style.left = `${Number(tint.dataset.baseLeft) * zoom}px`
    tint.style.top = `${Number(tint.dataset.baseTop) * zoom}px`
    tint.style.width = `${Number(tint.dataset.baseWidth) * zoom}px`
    tint.style.height = `${Number(tint.dataset.baseHeight) * zoom}px`
  }
}

export default function PDFViewer({ workspaceRoot, relativePath, projectId, documentId, matchPalette = false }: PDFViewerProps) {
  const filePath = (() => {
    if (!workspaceRoot) return null
    const api = window.electronAPI?.path
    if (!api) return null
    return api.join(workspaceRoot, relativePath)
  })()
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const pagesRef = useRef<HTMLDivElement | null>(null)
  const [paletteNonce, setPaletteNonce] = useState(0)
  useEffect(() => {
    if (!matchPalette) return
    const onPaletteChange = () => setPaletteNonce((n) => n + 1)
    window.addEventListener(APP_COLOR_PALETTE_CHANGE_EVENT, onPaletteChange)
    return () => window.removeEventListener(APP_COLOR_PALETTE_CHANGE_EVENT, onPaletteChange)
  }, [matchPalette])

  const pendingZoomRef = useRef(1)
  const lastPinchTimeRef = useRef(0)
  const clampHitTimeRef = useRef(0)
  const scheduleZoomRerenderRef = useRef<(() => void) | null>(null)

  const applyZoom = useCallback((zoom: number) => {
    const pagesEl = pagesRef.current
    if (!pagesEl) return
    const wrappers = pagesEl.querySelectorAll<HTMLDivElement>(".pdf-viewer__page-wrapper")
    for (const wrapper of wrappers) {
      const baseW = parseFloat(wrapper.dataset.baseWidth || "0")
      const baseH = parseFloat(wrapper.dataset.baseHeight || "0")
      if (baseW > 0 && baseH > 0) {
        applyZoomToPdfWrapper(wrapper, baseW, baseH, zoom)
      }
    }
  }, [])

  const getTopVisiblePage = useCallback((): number => {
    const pagesEl = pagesRef.current
    const scrollEl = scrollRef.current
    if (!pagesEl || !scrollEl) return 1
    const sr = scrollEl.getBoundingClientRect()
    for (const wrapper of pagesEl.querySelectorAll<HTMLElement>(".pdf-viewer__page-wrapper")) {
      const wr = wrapper.getBoundingClientRect()
      if (wr.bottom > sr.top + 1) return Number(wrapper.dataset.pageNumber) || 1
    }
    return 1
  }, [])

  const scrollToPage = useCallback((pageNumber: number) => {
    const pagesEl = pagesRef.current
    const scrollEl = scrollRef.current
    if (!pagesEl || !scrollEl) return
    const wrapper = pagesEl.querySelector<HTMLDivElement>(
      `.pdf-viewer__page-wrapper[data-page-number="${pageNumber}"]`,
    )
    if (!wrapper) return
    const wr = wrapper.getBoundingClientRect()
    const sr = scrollEl.getBoundingClientRect()
    scrollEl.scrollTo({ top: scrollEl.scrollTop + (wr.top - sr.top), behavior: "smooth" })
  }, [])

  const searchQueryRef = useRef("")
  const activeMatchRef = useRef<{ pageNumber: number; occurrenceInPage: number } | null>(null)
  const scheduleHighlightRefreshRef = useRef<(() => void) | null>(null)

  const rebuildSearchHighlights = useCallback((): Range | null => {
    if (typeof CSS === "undefined" || !CSS.highlights || typeof Highlight === "undefined") return null
    const pagesEl = pagesRef.current
    const query = searchQueryRef.current
    if (!pagesEl || !query) {
      CSS.highlights.delete("pdf-find")
      CSS.highlights.delete("pdf-find-active")
      return null
    }
    const active = activeMatchRef.current
    const allHl = new Highlight()
    const activeHl = new Highlight()
    let activeRange: Range | null = null
    for (const textLayer of pagesEl.querySelectorAll<HTMLElement>(".pdf-viewer__text-layer")) {
      const wrapper = textLayer.closest<HTMLElement>(".pdf-viewer__page-wrapper")
      const pageNumber = wrapper ? Number(wrapper.dataset.pageNumber) : NaN
      collectMatchRanges(textLayer, query).forEach((range, i) => {
        if (active && pageNumber === active.pageNumber && i === active.occurrenceInPage) {
          activeHl.add(range)
          activeRange = range
        } else {
          allHl.add(range)
        }
      })
    }
    CSS.highlights.set("pdf-find", allHl)
    CSS.highlights.set("pdf-find-active", activeHl)
    return activeRange
  }, [])

  useEffect(() => {
    let cancelled = false
    setError(null)
    setDoc(null)
    pendingZoomRef.current = 1

    if (!filePath) {
      setError("No workspace folder selected — open Settings to choose one.")
      return
    }

    const api = window.electronAPI?.fs
    if (!api || typeof api.readFileBinary !== "function") {
      setError("PDF viewing requires the desktop app.")
      return
    }

    void (async () => {
      try {
        const bytes = await api.readFileBinary(filePath)
        if (cancelled) return
        const loadingTask = pdfjs.getDocument({
          data: bytes.slice(),
          cMapPacked: true,
          ...resolvePdfAssetUrls(),
          BinaryDataFactory: createPdfBinaryDataFactory(),
        })
        const loadedDoc = await loadingTask.promise
        if (cancelled) {
          void loadedDoc.destroy()
          return
        }
        setDoc(loadedDoc)
      } catch (e) {
        if (cancelled) return
        setError(e instanceof Error ? e.message : "Failed to load PDF")
      }
    })()

    return () => { cancelled = true }
  }, [filePath])

  useEffect(() => {
    if (!doc) return
    return () => { void doc.destroy() }
  }, [doc])

  useEffect(() => {
    return () => { unregisterPdfText(projectId) }
  }, [projectId])

  useEffect(() => {
    if (!doc || !documentId) return
    let cancelled = false

    type RawOutlineItem = { title: string; dest: PdfDestination; items?: RawOutlineItem[] }

    const buildTree = async (items: RawOutlineItem[]): Promise<PdfBookmark[]> => {
      const out: PdfBookmark[] = []
      for (const item of items) {
        if (cancelled) break
        const pageNumber = await resolveDestinationPage(doc, item.dest)
        const children = item.items && item.items.length > 0 ? await buildTree(item.items) : []
        out.push({
          id: createBookmarkId(),
          title: item.title?.trim() || "Untitled bookmark",
          pageNumber: pageNumber ?? 1,
          children,
        })
      }
      return out
    }

    void (async () => {
      let tree: PdfBookmark[] = []
      try {
        const outline = (await doc.getOutline()) as RawOutlineItem[] | null
        if (cancelled) return
        if (outline && outline.length > 0) tree = await buildTree(outline)
      } catch {
      }
      if (cancelled) return
      initPdfBookmarks(documentId, filePath, tree)
    })()

    return () => {
      cancelled = true
      clearPdfBookmarks(documentId)
    }
  }, [doc, documentId, filePath])

  useEffect(() => {
    if (!doc || !documentId) return
    const scrollEl = scrollRef.current
    const pagesEl = pagesRef.current
    if (!scrollEl || !pagesEl) return

    let rafId: number | null = null
    const compute = () => {
      rafId = null
      reportCurrentPage(documentId, getTopVisiblePage())
    }
    const onScroll = () => {
      if (rafId == null) rafId = requestAnimationFrame(compute)
    }
    compute()
    scrollEl.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      scrollEl.removeEventListener("scroll", onScroll)
      if (rafId != null) cancelAnimationFrame(rafId)
    }
  }, [doc, documentId, getTopVisiblePage])

  useEffect(() => {
    if (!documentId) return
    const onNavigate = (event: Event) => {
      const detail = (event as CustomEvent<PdfBookmarkNavigateDetail>).detail
      if (!detail || detail.documentId !== documentId) return
      scrollToPage(detail.pageNumber)
    }
    window.addEventListener(APP_PDF_BOOKMARK_NAVIGATE_EVENT, onNavigate as EventListener)
    return () => window.removeEventListener(APP_PDF_BOOKMARK_NAVIGATE_EVENT, onNavigate as EventListener)
  }, [documentId, scrollToPage])

  useEffect(() => {
    const pagesEl = pagesRef.current
    const scrollEl = scrollRef.current
    if (!pagesEl || !scrollEl) return

    let rafId: number | null = null
    const scheduleRefresh = () => {
      if (rafId != null) return
      rafId = requestAnimationFrame(() => {
        rafId = null
        rebuildSearchHighlights()
      })
    }
    scheduleHighlightRefreshRef.current = scheduleRefresh

    const onFocus = (event: Event) => {
      const detail = (event as CustomEvent<ProjectSearchFocusDetail>).detail
      if (!detail || detail.documentType !== "pdf" || detail.documentId !== documentId) return

      searchQueryRef.current = detail.query
      activeMatchRef.current = { pageNumber: detail.start, occurrenceInPage: detail.end }

      const wrapper = pagesEl.querySelector<HTMLDivElement>(
        `.pdf-viewer__page-wrapper[data-page-number="${detail.start}"]`,
      )
      if (!wrapper) return

      if (!wrapper.querySelector(".pdf-viewer__text-layer")) {
        const wr = wrapper.getBoundingClientRect()
        const sr = scrollEl.getBoundingClientRect()
        scrollEl.scrollTop += wr.top - sr.top
      }

      let attempts = 0
      const apply = () => {
        const activeRange = rebuildSearchHighlights()
        if (activeRange) {
          const rr = activeRange.getBoundingClientRect()
          if (rr.height > 0 || rr.width > 0) {
            const sr = scrollEl.getBoundingClientRect()
            scrollEl.scrollBy({ top: rr.top + rr.height / 2 - (sr.top + sr.height / 2), behavior: "smooth" })
          }
          return
        }
        if (++attempts > 180) return
        requestAnimationFrame(apply)
      }
      apply()
    }

    const onClear = () => {
      searchQueryRef.current = ""
      activeMatchRef.current = null
      rebuildSearchHighlights()
    }

    window.addEventListener(APP_PROJECT_SEARCH_FOCUS_EVENT, onFocus as EventListener)
    window.addEventListener(APP_PROJECT_SEARCH_CLEAR_EVENT, onClear)
    return () => {
      window.removeEventListener(APP_PROJECT_SEARCH_FOCUS_EVENT, onFocus as EventListener)
      window.removeEventListener(APP_PROJECT_SEARCH_CLEAR_EVENT, onClear)
      scheduleHighlightRefreshRef.current = null
      if (rafId != null) cancelAnimationFrame(rafId)
      searchQueryRef.current = ""
      activeMatchRef.current = null
      rebuildSearchHighlights()
    }
  }, [doc, projectId, documentId, rebuildSearchHighlights])

  useEffect(() => {
    const scrollEl = scrollRef.current
    if (!scrollEl) return

    const viewerOwnsFocus = () => {
      const active = document.activeElement
      if (!active || active === document.body) return true
      return scrollEl.contains(active)
    }

    const selectAllPdfText = (): boolean => {
      const pagesEl = pagesRef.current
      if (!pagesEl) return false
      const textLayers = pagesEl.querySelectorAll(".pdf-viewer__text-layer")
      if (textLayers.length === 0) return false
      const range = document.createRange()
      range.setStartBefore(textLayers[0])
      range.setEndAfter(textLayers[textLayers.length - 1])
      const selection = window.getSelection()
      if (!selection) return false
      selection.removeAllRanges()
      selection.addRange(range)
      return true
    }

    const onKeyDown = (event: KeyboardEvent) => {
      const isPrimary = event.metaKey || event.ctrlKey
      if (!isPrimary || event.shiftKey || event.altKey) return
      if (event.key.toLowerCase() !== "a") return
      if (!viewerOwnsFocus()) return
      if (selectAllPdfText()) event.preventDefault()
    }

    const onEditorCommand = (event: Event) => {
      const command = (event as CustomEvent<{ command: EditorCommand }>).detail?.command
      if (command !== "select-all") return
      if (!viewerOwnsFocus()) return
      selectAllPdfText()
    }

    scrollEl.addEventListener("keydown", onKeyDown)
    window.addEventListener("keydown", onKeyDown)
    window.addEventListener(EDITOR_COMMAND_EVENT, onEditorCommand)
    return () => {
      scrollEl.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener(EDITOR_COMMAND_EVENT, onEditorCommand)
    }
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const PINCH_TAIL_MS = 200
    const CLAMP_COOLDOWN_MS = 250

    const onWheel = (event: WheelEvent) => {
      const now = performance.now()

      if (!event.ctrlKey) {
        if (now - lastPinchTimeRef.current < PINCH_TAIL_MS) {
          event.preventDefault()
        }
        return
      }

      event.preventDefault()
      lastPinchTimeRef.current = now

      if (now - clampHitTimeRef.current < CLAMP_COOLDOWN_MS) {
        clampHitTimeRef.current = now
        return
      }

      const oldZoom = pendingZoomRef.current
      const factor = Math.exp(-event.deltaY * 0.01)
      const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, oldZoom * factor))
      if (newZoom === oldZoom) {
        clampHitTimeRef.current = now
        return
      }
      pendingZoomRef.current = newZoom

      const pagesEl = pagesRef.current
      if (!pagesEl) return

      const cx = event.clientX
      const cy = event.clientY

      let anchorEl =
        (document.elementFromPoint(cx, cy) as HTMLElement | null)?.closest<HTMLElement>(".pdf-viewer__page-wrapper") ?? null
      if (!anchorEl) {
        let bestDy = Infinity
        for (const w of pagesEl.querySelectorAll<HTMLElement>(".pdf-viewer__page-wrapper:has(.pdf-viewer__page)")) {
          const wr = w.getBoundingClientRect()
          const dy = cy < wr.top ? wr.top - cy : cy > wr.bottom ? cy - wr.bottom : 0
          if (dy < bestDy) {
            bestDy = dy
            anchorEl = w
          }
        }
      }

      let fx = 0.5
      let fy = 0.5
      if (anchorEl) {
        const wr = anchorEl.getBoundingClientRect()
        if (wr.width > 0 && wr.height > 0) {
          fx = (cx - wr.left) / wr.width
          fy = (cy - wr.top) / wr.height
        }
      }

      applyZoom(newZoom)
      scheduleZoomRerenderRef.current?.()

      if (anchorEl) {
        const wr = anchorEl.getBoundingClientRect()
        el.scrollLeft += wr.left + fx * wr.width - cx
        el.scrollTop += wr.top + fy * wr.height - cy
      }
    }

    el.addEventListener("wheel", onWheel, { passive: false })
    return () => {
      el.removeEventListener("wheel", onWheel)
    }
  }, [applyZoom])

  useEffect(() => {
    if (!doc) return
    const pagesContainer = pagesRef.current
    const scrollContainer = scrollRef.current
    if (!pagesContainer || !scrollContainer) return

    let cancelled = false
    let generation = 0
    const activeRenderTasks = new Set<RenderTask>()
    // Per page: the task currently rasterising, plus the zoom the on-screen bitmap
    // was rasterised at (null while nothing has landed yet).
    type PageRecord = { task: RenderTask | null; renderedZoom: number | null; pendingZoom: number | null }
    const records = new Map<number, PageRecord>()
    const visiblePages = new Set<number>()
    const dpr = window.devicePixelRatio || 1

    const wrapperFor = (pageNumber: number) =>
      pagesContainer.querySelector<HTMLDivElement>(
        `.pdf-viewer__page-wrapper[data-page-number="${pageNumber}"]`,
      )

    const resolvePageColors = (): { background: string; foreground: string } | undefined => {
      if (!matchPalette) return undefined
      const paletteHost = scrollContainer.closest(".app") ?? document.body
      const cs = getComputedStyle(paletteHost)
      const background = cs.getPropertyValue("--app-bg").trim() || "#111111"
      const foreground = cs.getPropertyValue("--editor-text").trim() || "#f5f5f5"
      return { background, foreground }
    }

    const applyPageTone = () => {
      const paletteHost = scrollContainer.closest(".app") ?? document.body
      const background = matchPalette
        ? getComputedStyle(paletteHost).getPropertyValue("--app-bg").trim() || "#111111"
        : "#ffffff"
      pagesContainer.dataset.pageTone = isDarkColor(background) ? "dark" : "light"
    }
    applyPageTone()

    // Hovering a link tints the canvas glyphs through the overlay's blend mode, and
    // haloes them by tagging the text layer's transparent copy of the same words.
    // Which spans a link covers only changes when the text layer is rebuilt, so the
    // lookup is cached against the layer it was measured in.
    const LINK_GLOW_CLASS = "pdf-viewer__link-glow"
    const glowTargets = new WeakMap<HTMLElement, { layer: Element; spans: HTMLElement[] }>()
    const linkTints = new WeakMap<HTMLElement, HTMLElement>()

    const glowSpansFor = (link: HTMLElement): HTMLElement[] => {
      const layer = link
        .closest(".pdf-viewer__page-wrapper")
        ?.querySelector(".pdf-viewer__text-layer")
      if (!layer) return []
      const cached = glowTargets.get(link)
      if (cached && cached.layer === layer) return cached.spans

      // Both layers are laid out at fit-width size under the same zoom transform, so
      // client rects compare directly without undoing either.
      const box = link.getBoundingClientRect()
      const spans: HTMLElement[] = []
      for (const span of layer.querySelectorAll<HTMLElement>("span")) {
        const rect = span.getBoundingClientRect()
        if (rect.width <= 0 || rect.height <= 0) continue
        const overlapW = Math.min(rect.right, box.right) - Math.max(rect.left, box.left)
        const overlapH = Math.min(rect.bottom, box.bottom) - Math.max(rect.top, box.top)
        if (overlapW <= 0 || overlapH <= 0) continue
        // Most of the span has to sit inside the annotation rect, so a neighbouring
        // word that merely grazes its edge stays dark.
        if ((overlapW * overlapH) / (rect.width * rect.height) < 0.5) continue
        spans.push(span)
      }
      glowTargets.set(link, { layer, spans })
      return spans
    }

    const setLinkGlow = (link: HTMLElement, on: boolean) => {
      linkTints.get(link)?.classList.toggle("pdf-viewer__link-tint--lit", on)
      for (const span of glowSpansFor(link)) span.classList.toggle(LINK_GLOW_CLASS, on)
    }

    type LinkAnnotation = {
      subtype?: string
      rect?: number[]
      url?: string
      dest?: PdfDestination
      action?: string
      newWindow?: boolean
    }

    const goToNamedAction = (action: string) => {
      switch (action) {
        case "FirstPage": scrollToPage(1); break
        case "LastPage": scrollToPage(doc.numPages); break
        case "NextPage": scrollToPage(Math.min(doc.numPages, getTopVisiblePage() + 1)); break
        case "PrevPage": scrollToPage(Math.max(1, getTopVisiblePage() - 1)); break
        default: break
      }
    }

    // Link annotations only — the surrounding viewer has no form/widget support, and
    // pdf.js already paints every annotation's appearance onto the canvas, so these
    // layers exist to make the painted links hittable and to light them on hover.
    const buildLinkLayers = (
      annotations: LinkAnnotation[],
      fitViewport: ReturnType<PDFPageProxy["getViewport"]>,
      baseW: number,
      baseH: number,
    ): { links: HTMLDivElement; tints: HTMLDivElement } | null => {
      const layer = document.createElement("div")
      layer.className = "pdf-viewer__link-layer"
      layer.style.width = `${baseW}px`
      layer.style.height = `${baseH}px`

      const tintLayer = document.createElement("div")
      tintLayer.className = "pdf-viewer__link-tint-layer"

      let count = 0
      for (const annotation of annotations) {
        if (annotation.subtype !== "Link") continue
        if (!Array.isArray(annotation.rect) || annotation.rect.length < 4) continue

        const link = document.createElement("a")
        link.className = "pdf-viewer__link"

        if (annotation.url && isSafeExternalLink(annotation.url)) {
          link.href = annotation.url
          link.title = annotation.url
          // Electron's window-open handler sends external URLs to the system browser.
          link.target = "_blank"
          link.rel = "noopener noreferrer"
        } else if (annotation.dest) {
          const dest = annotation.dest
          link.href = "#"
          link.addEventListener("click", (event) => {
            event.preventDefault()
            void (async () => {
              const target = await resolveDestinationPage(doc, dest)
              if (target) scrollToPage(target)
            })()
          })
        } else if (annotation.action) {
          const action = annotation.action
          link.href = "#"
          link.addEventListener("click", (event) => {
            event.preventDefault()
            goToNamedAction(action)
          })
        } else {
          continue
        }

        const [x1, y1, x2, y2] = fitViewport.convertToViewportRectangle(annotation.rect)
        const left = Math.min(x1, x2)
        const top = Math.min(y1, y2)
        const width = Math.abs(x2 - x1)
        const height = Math.abs(y2 - y1)
        if (width <= 0 || height <= 0) continue
        link.style.left = `${left}px`
        link.style.top = `${top}px`
        link.style.width = `${width}px`
        link.style.height = `${height}px`

        const tint = document.createElement("div")
        tint.className = "pdf-viewer__link-tint"
        tint.dataset.baseLeft = String(left)
        tint.dataset.baseTop = String(top)
        tint.dataset.baseWidth = String(width)
        tint.dataset.baseHeight = String(height)
        tintLayer.appendChild(tint)
        linkTints.set(link, tint)

        link.addEventListener("pointerenter", () => setLinkGlow(link, true))
        link.addEventListener("pointerleave", () => setLinkGlow(link, false))
        // Mirrors the :focus-visible ring, so keyboard traversal lights the words too.
        link.addEventListener("focus", () => {
          if (link.matches(":focus-visible")) setLinkGlow(link, true)
        })
        link.addEventListener("blur", () => setLinkGlow(link, false))

        layer.appendChild(link)
        count++
      }

      return count > 0 ? { links: layer, tints: tintLayer } : null
    }

    const renderPage = async (pageNumber: number, myGen: number, zoom: number) => {
      if (cancelled || myGen !== generation) return
      const wrapper = wrapperFor(pageNumber)
      if (!wrapper) return

      const record = records.get(pageNumber) ?? { task: null, renderedZoom: null, pendingZoom: null }
      records.set(pageNumber, record)
      // Already showing this zoom, or already on its way there.
      if (record.renderedZoom === zoom && record.task === null) return
      if (record.pendingZoom === zoom) return
      // A render for a stale zoom is in flight — drop it and rasterise the current one.
      if (record.task) {
        try { record.task.cancel() } catch {  }
        activeRenderTasks.delete(record.task)
        record.task = null
      }
      record.pendingZoom = zoom

      // Superseded by a newer zoom, or the page was scrolled out and unrendered
      // (which drops the record) while we were waiting on an await.
      const isStale = () =>
        cancelled ||
        myGen !== generation ||
        records.get(pageNumber) !== record ||
        record.pendingZoom !== zoom

      const abandon = () => {
        if (records.get(pageNumber) === record && record.pendingZoom === zoom) {
          record.pendingZoom = null
          if (record.renderedZoom === null) records.delete(pageNumber)
        }
      }

      let page: PDFPageProxy
      try {
        page = await doc.getPage(pageNumber)
      } catch {
        abandon()
        return
      }
      if (isStale()) {
        abandon()
        return
      }

      const contentWidth = measureContentWidth(pagesContainer)
      if (contentWidth <= 0) {
        abandon()
        return
      }

      const baseViewport = page.getViewport({ scale: 1 })
      const fitScale = contentWidth / baseViewport.width
      const fitViewport = page.getViewport({ scale: fitScale })
      const baseW = Math.floor(fitViewport.width)
      const baseH = Math.floor(fitViewport.height)
      wrapper.dataset.baseWidth = String(baseW)
      wrapper.dataset.baseHeight = String(baseH)
      applyZoomToPdfWrapper(wrapper, baseW, baseH, zoom)

      // Derive the scale from the rounded CSS width so the bitmap matches the box
      // it is painted into exactly, with no sub-pixel resampling.
      const displayViewport = page.getViewport({ scale: (baseW * zoom) / baseViewport.width })
      const pixelBudget = Math.sqrt(MAX_CANVAS_PIXELS / (displayViewport.width * displayViewport.height))
      const outputScale = Math.min(dpr, pixelBudget)

      const canvas = document.createElement("canvas")
      canvas.className = "pdf-viewer__page"
      canvas.width = Math.max(1, Math.floor(displayViewport.width * outputScale))
      canvas.height = Math.max(1, Math.floor(displayViewport.height * outputScale))
      canvas.style.width = `${displayViewport.width}px`
      canvas.style.height = `${displayViewport.height}px`

      const ctx = canvas.getContext("2d")
      if (!ctx) {
        abandon()
        return
      }

      const renderTask = page.render({
        canvas,
        canvasContext: ctx,
        viewport: displayViewport,
        transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined,
        pageColors: resolvePageColors(),
      })
      record.task = renderTask
      activeRenderTasks.add(renderTask)
      try {
        await renderTask.promise
      } catch {
        activeRenderTasks.delete(renderTask)
        if (record.task === renderTask) record.task = null
        abandon()
        return
      }
      activeRenderTasks.delete(renderTask)
      if (record.task === renderTask) record.task = null
      if (isStale()) {
        abandon()
        return
      }

      // Swap in only once the new bitmap is complete, so a zoom re-render never
      // blanks the page mid-gesture.
      wrapper.querySelector(".pdf-viewer__page")?.remove()
      wrapper.insertBefore(canvas, wrapper.firstChild)
      record.renderedZoom = zoom
      if (record.pendingZoom === zoom) record.pendingZoom = null
      applyZoomToPdfWrapper(wrapper, baseW, baseH, pendingZoomRef.current)

      // The text layer is zoom-independent — it is laid out at fit-width size and
      // scaled by CSS — so it only ever needs building once per page.
      if (!wrapper.querySelector(".pdf-viewer__text-layer")) {
        try {
          const textContent = await page.getTextContent()
          if (cancelled || myGen !== generation) return
          if (records.get(pageNumber) !== record) return
          if (wrapper.querySelector(".pdf-viewer__text-layer")) return
          const textLayerDiv = document.createElement("div")
          textLayerDiv.className = "pdf-viewer__text-layer"
          textLayerDiv.style.width = `${baseW}px`
          textLayerDiv.style.height = `${baseH}px`
          textLayerDiv.style.setProperty("--total-scale-factor", String(fitViewport.scale))
          wrapper.appendChild(textLayerDiv)

          const textLayer = new TextLayer({
            textContentSource: textContent,
            container: textLayerDiv,
            viewport: fitViewport,
          })
          await textLayer.render()
          if (cancelled || myGen !== generation) return
          applyZoomToPdfWrapper(wrapper, baseW, baseH, pendingZoomRef.current)
        } catch {
        }
      }

      if (!wrapper.querySelector(".pdf-viewer__link-layer")) {
        try {
          const annotations = await page.getAnnotations({ intent: "display" })
          if (cancelled || myGen !== generation) return
          if (records.get(pageNumber) !== record) return
          if (wrapper.querySelector(".pdf-viewer__link-layer")) return
          const built = buildLinkLayers(annotations, fitViewport, baseW, baseH)
          if (built) {
            wrapper.appendChild(built.tints)
            wrapper.appendChild(built.links)
            applyZoomToPdfWrapper(wrapper, baseW, baseH, pendingZoomRef.current)
          }
        } catch {
        }
      }
      scheduleHighlightRefreshRef.current?.()
    }

    const unrenderPage = (pageNumber: number) => {
      const record = records.get(pageNumber)
      if (!record) return
      if (record.task) {
        try { record.task.cancel() } catch {  }
        activeRenderTasks.delete(record.task)
      }
      records.delete(pageNumber)
      const wrapper = wrapperFor(pageNumber)
      if (!wrapper) return
      const canvas = wrapper.querySelector<HTMLCanvasElement>(".pdf-viewer__page")
      if (canvas) {
        canvas.width = 0
        canvas.height = 0
        canvas.remove()
      }
      wrapper.querySelector(".pdf-viewer__text-layer")?.remove()
      scheduleHighlightRefreshRef.current?.()
    }

    let zoomRerenderTimer: number | null = null
    scheduleZoomRerenderRef.current = () => {
      if (zoomRerenderTimer != null) window.clearTimeout(zoomRerenderTimer)
      zoomRerenderTimer = window.setTimeout(() => {
        zoomRerenderTimer = null
        const zoom = pendingZoomRef.current
        for (const pageNumber of visiblePages) void renderPage(pageNumber, generation, zoom)
      }, ZOOM_RERENDER_DELAY_MS)
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const pageNumber = Number((entry.target as HTMLElement).dataset.pageNumber)
          if (!pageNumber) continue
          if (entry.isIntersecting) {
            visiblePages.add(pageNumber)
            void renderPage(pageNumber, generation, pendingZoomRef.current)
          } else {
            visiblePages.delete(pageNumber)
            unrenderPage(pageNumber)
          }
        }
      },
      { root: scrollContainer, rootMargin: "150% 0px" },
    )

    type ScrollAnchor = { page: number; fraction: number }
    const captureScrollAnchor = (): ScrollAnchor => {
      const top = scrollContainer.getBoundingClientRect().top
      for (const w of pagesContainer.querySelectorAll<HTMLElement>(".pdf-viewer__page-wrapper")) {
        const wr = w.getBoundingClientRect()
        if (wr.bottom > top + 1) {
          return {
            page: Number(w.dataset.pageNumber) || 0,
            fraction: wr.height > 0 ? Math.min(Math.max((top - wr.top) / wr.height, 0), 1) : 0,
          }
        }
      }
      return { page: 0, fraction: 0 }
    }
    const restoreScrollAnchor = (anchor: ScrollAnchor) => {
      if (anchor.page <= 0) return
      const el = pagesContainer.querySelector<HTMLDivElement>(
        `.pdf-viewer__page-wrapper[data-page-number="${anchor.page}"]`,
      )
      if (!el) return
      const ar = el.getBoundingClientRect()
      const sr = scrollContainer.getBoundingClientRect()
      scrollContainer.scrollTop += (ar.top - sr.top) + anchor.fraction * ar.height
    }

    const build = async () => {
      const anchor = captureScrollAnchor()

      const myGen = ++generation
      for (const t of activeRenderTasks) {
        try { t.cancel() } catch {  }
      }
      activeRenderTasks.clear()
      records.clear()
      visiblePages.clear()
      io.disconnect()

      const contentWidth = measureContentWidth(pagesContainer)
      if (contentWidth <= 0) return

      let assumedW = Math.floor(contentWidth)
      let assumedH = Math.floor(contentWidth * 1.2941)
      try {
        const first = await doc.getPage(1)
        const bv = first.getViewport({ scale: 1 })
        const dv = first.getViewport({ scale: contentWidth / bv.width })
        assumedW = Math.floor(dv.width)
        assumedH = Math.floor(dv.height)
      } catch {  }
      if (cancelled || myGen !== generation) return

      pagesContainer.replaceChildren()
      for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
        const wrapper = document.createElement("div")
        wrapper.className = "pdf-viewer__page-wrapper"
        wrapper.dataset.pageNumber = String(pageNumber)
        wrapper.dataset.baseWidth = String(assumedW)
        wrapper.dataset.baseHeight = String(assumedH)
        applyZoomToPdfWrapper(wrapper, assumedW, assumedH, pendingZoomRef.current)
        pagesContainer.appendChild(wrapper)
        io.observe(wrapper)
      }

      restoreScrollAnchor(anchor)
    }

    const extractAllText = async () => {
      const extractedPageText: PdfPageText[] = []
      const PUBLISH_EVERY = 8
      for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
        if (cancelled) return
        let page: PDFPageProxy
        try {
          page = await doc.getPage(pageNumber)
        } catch {
          continue
        }
        if (cancelled) return
        try {
          const textContent = await page.getTextContent()
          const pageText = textContent.items
            .map((item) => (("str" in item) ? item.str : ""))
            .join(" ")
          extractedPageText.push({ pageNumber, text: pageText })
        } catch {
        }
        if (!cancelled && extractedPageText.length > 0 && pageNumber % PUBLISH_EVERY === 0) {
          registerPdfText(projectId, [...extractedPageText])
        }
      }
      if (!cancelled && extractedPageText.length > 0) {
        registerPdfText(projectId, extractedPageText)
      }
    }

    let lastWidth = -1
    const ro = new ResizeObserver(() => {
      const width = scrollContainer.clientWidth
      if (width === lastWidth || width === 0) return
      lastWidth = width
      void build()
    })
    ro.observe(scrollContainer)
    void extractAllText()

    return () => {
      cancelled = true
      generation = -1
      if (zoomRerenderTimer != null) window.clearTimeout(zoomRerenderTimer)
      scheduleZoomRerenderRef.current = null
      for (const t of activeRenderTasks) {
        try { t.cancel() } catch {  }
      }
      activeRenderTasks.clear()
      records.clear()
      visiblePages.clear()
      io.disconnect()
      ro.disconnect()
    }
  }, [doc, matchPalette, paletteNonce, projectId, getTopVisiblePage, scrollToPage])

  if (error) {
    return (
      <div className="pdf-viewer pdf-viewer--error" role="alert">
        <AlertCircle size={28} aria-hidden="true" />
        <p>{error}</p>
        <p className="pdf-viewer__path">{filePath ?? relativePath}</p>
      </div>
    )
  }

  return (
    <div ref={scrollRef} className="pdf-viewer" role="region" aria-label="PDF document viewer">
      {!doc ? (
        <div className="pdf-viewer__loading" role="status" aria-live="polite">
          <FileText size={28} aria-hidden="true" />
          <p>Loading PDF…</p>
        </div>
      ) : (
        <div
          ref={pagesRef}
          className="pdf-viewer__pages"
          data-match-palette={matchPalette ? "on" : "off"}
        />
      )}
    </div>
  )
}
