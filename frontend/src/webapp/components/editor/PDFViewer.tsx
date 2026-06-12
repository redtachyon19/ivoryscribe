// PDFViewer — read-only viewer for standalone .pdf documents, rendered
// via pdf.js into our own canvases so we control every pixel (no
// Chromium PDFium chrome, no hardcoded grey surround). Pages stack
// vertically inside a normal scroll container with the app palette.
//
// Why pdf.js and not the bundled Chromium viewer? Chromium's PDFium
// renderer paints a fixed grey "surround" between pages that no URL
// hash or CSS can reach. The user wanted the page gaps to match the
// app's dark theme; the only way is to render the pages ourselves.

import { useCallback, useEffect, useRef, useState } from "react"
import { AlertCircle, FileText } from "lucide-react"
import * as pdfjs from "pdfjs-dist"
import { TextLayer } from "pdfjs-dist"
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist"
// Vite's `?url` resolves this to a bundled-asset URL. pdf.js needs the
// worker file at this URL to spin up its parsing thread.
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url"
import { registerPdfText, unregisterPdfText, type PdfPageText } from "../../../core/pdf/pdfTextRegistry"
import {
  APP_COLOR_PALETTE_CHANGE_EVENT,
  APP_PROJECT_SEARCH_FOCUS_EVENT,
  APP_PROJECT_SEARCH_CLEAR_EVENT,
  EDITOR_COMMAND_EVENT,
  type EditorCommand,
  type ProjectSearchFocusDetail,
} from "../../../core/events/editorEvents"
import "./PDFViewer.css"

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

type PDFViewerProps = {
  /** Current workspace root from settings. Joined with `relativePath`
   *  at render time to get an absolute path — we never cache the
   *  result, so the path always tracks whatever the user has chosen as
   *  their workspace right now. Null disables loading (cloud mode). */
  workspaceRoot: string | null
  /** Path of the PDF relative to the workspace root, e.g.
   *  `"Subfolder/Document.pdf"`. Stored on the project at hydrate. */
  relativePath: string
  /** Project id for the open PDF. Used to register the extracted text with
   *  `pdfTextRegistry` (keyed by project id) so find/replace can search this
   *  document. */
  projectId: string
  /** The open PDF's *document* (tab) id. This — NOT the project id — is what
   *  the Find modal stamps on its "go to this match" focus events
   *  (result.documentId === the pdf tab id), so the viewer matches against it.
   *  A PDF project's `id` and its tab id are different (see pdfFileToProject). */
  documentId: string | null
  /** Settings toggle. When true, pdf.js rasterises each page with the
   *  app's palette background and text colour instead of the PDF's
   *  own. Implemented via pdf.js's `pageColors` render option — text
   *  becomes the palette foreground, page surface becomes the palette
   *  background, images stay intact. */
  matchPalette?: boolean
}

// Zoom limits — match what feels natural with trackpad pinch on a Mac.
const MIN_ZOOM = 0.25
const MAX_ZOOM = 8

/** Walk an element's text nodes and return a Range for EVERY case-insensitive
 *  occurrence of `needle` across the full text concatenation, in document
 *  order. Used to paint search highlights over the text layer.
 *
 *  Why "across the full concatenation": pdf.js's text layer often splits a
 *  single visual word into adjacent spans (per glyph run), so a match can span
 *  multiple text nodes. We build a virtual string out of all text nodes plus a
 *  parallel index mapping global offsets back to (node, offset) pairs. */
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
        // Skip ranges whose mapped offsets are momentarily invalid.
      }
    }
    fromIndex = idx + Math.max(1, needleLower.length)
  }
  return ranges
}

// We rasterize each page at this multiple of the fit-to-width size. The
// extra pixels are headroom for CSS-zooming up: at user-zoom ≤ this
// oversample factor the pages stay crisp because we're downscaling raw
// pixels rather than stretching them. Beyond the oversample factor things
// get progressively softer but still readable. 2× hits the sweet spot
// between memory footprint and "stays sharp at common zoom levels".
const OVERSAMPLE = 2

/**
 * Apply a zoom level to one rendered page wrapper by writing explicit
 * pixel dimensions on the wrapper + canvas, and a `transform: scale`
 * on the selectable text layer (so its absolutely-positioned spans
 * visually track the canvas).
 *
 * `baseW` / `baseH` are the fit-to-width display dimensions captured
 * when the page was rasterised (the unzoomed size at zoom = 1). The
 * canvas's underlying pixel buffer was rasterised at `OVERSAMPLE×`
 * the base size, so the canvas stays crisp through zoom ≤ OVERSAMPLE
 * and only softens slightly past that — same behaviour as the CSS
 * `zoom` approach this replaces.
 *
 * The text layer is sized to the UNZOOMED base box and then visually
 * scaled with `transform`; that's what lets pdf.js position its
 * spans once (in unzoomed CSS pixels, during render) and stay
 * aligned with the canvas at every subsequent zoom.
 */
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

  const textLayer = wrapper.querySelector<HTMLDivElement>(".pdf-viewer__text-layer")
  if (textLayer) {
    // Layer box stays at the base (unzoomed) dimensions; transform
    // does the visual scaling. transform-origin: 0 0 keeps the
    // top-left anchored so a span at (left:X, top:Y) lands at
    // (X*zoom, Y*zoom) physical pixels — exactly where the canvas's
    // rasterised glyph sits.
    textLayer.style.width = `${baseW}px`
    textLayer.style.height = `${baseH}px`
    textLayer.style.transform = `scale(${zoom})`
    textLayer.style.transformOrigin = "0 0"
  }
}

export default function PDFViewer({ workspaceRoot, relativePath, projectId, documentId, matchPalette = false }: PDFViewerProps) {
  // Resolve to an absolute path at render time, using whatever the user
  // has chosen as their workspace right now. Changing the workspace in
  // settings re-renders this component and reroots automatically. We
  // never cache the absolute path — every load goes through this.
  const filePath = (() => {
    if (!workspaceRoot) return null
    const api = window.electronAPI?.path
    if (!api) return null
    return api.join(workspaceRoot, relativePath)
  })()
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Scroll container — drives the page-width fit math.
  const scrollRef = useRef<HTMLDivElement | null>(null)
  // Inner column holding the canvases.
  const pagesRef = useRef<HTMLDivElement | null>(null)
  // Nonce that ticks whenever the user changes the colour palette
  // *while* matchPalette is on, so the render effect re-rasterises
  // pages with the new background/foreground. Inert when matchPalette
  // is off (we don't subscribe to the event in that case).
  const [paletteNonce, setPaletteNonce] = useState(0)
  useEffect(() => {
    if (!matchPalette) return
    const onPaletteChange = () => setPaletteNonce((n) => n + 1)
    window.addEventListener(APP_COLOR_PALETTE_CHANGE_EVENT, onPaletteChange)
    return () => window.removeEventListener(APP_COLOR_PALETTE_CHANGE_EVENT, onPaletteChange)
  }, [matchPalette])

  // ── Zoom state (refs only — no React state) ─────────────────────────
  //
  // Zoom is applied by writing EXPLICIT pixel width/height onto each
  // page wrapper + canvas, and `transform: scale(zoom)` onto each
  // text layer so its selectable spans visually track the rasterised
  // canvas. We deliberately do NOT use CSS `zoom` on the pages column
  // anymore — see ImageViewer.tsx for the long write-up, but the
  // short version is that CSS `zoom` + percentage-sized descendants
  // breaks at viewport edges in Chromium and the explicit-pixel
  // approach is cheaper to reason about anyway.
  //
  // The pending zoom value lives in a ref so a sequence of wheel
  // events all read the latest value without going through React
  // state. The DOM writes persist across re-renders; the render
  // effect re-applies the current pending zoom to every new wrapper
  // as it's created so freshly-rasterised pages (e.g. after a
  // palette change) come in at the right size.
  const pendingZoomRef = useRef(1)
  // Timestamp of the last pinch (ctrl-wheel) event. macOS trackpad
  // gestures emit both pinch and pan wheel events; if we only block the
  // pinch ones, the panning slips through and scrolls the page mid-zoom.
  // We use this to suppress *any* wheel event within a short tail
  // window after a pinch.
  const lastPinchTimeRef = useRef(0)
  // Sliding post-clamp cooldown — same mechanism as ImageViewer.tsx.
  // When the user pinches past MIN_ZOOM or MAX_ZOOM, the macOS
  // gesture-momentum tail can keep firing wheel events for hundreds
  // of milliseconds, some with the OPPOSITE deltaY sign. Without a
  // cooldown those tail events would zoom the wrong way the moment
  // the user hits a limit. Every wheel event arriving inside the
  // window resets the timer, so suppression only ends once events
  // stop arriving — i.e. the user has lifted their fingers.
  const clampHitTimeRef = useRef(0)

  // Apply a zoom level to every rendered page wrapper. Each wrapper
  // stores its fit-to-width base dimensions on `dataset.baseWidth /
  // baseHeight` at render time (so this function can iterate the
  // pages container without re-querying pdf.js for page sizes), and
  // `applyZoomToPdfWrapper` writes the resulting display pixel
  // dimensions onto the wrapper + canvas + text layer.
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

  // ── Find-in-PDF highlights ──────────────────────────────────────────
  // The Find modal dispatches APP_PROJECT_SEARCH_FOCUS_EVENT (the query + the
  // active match's page and per-page occurrence) on every navigation, and
  // APP_PROJECT_SEARCH_CLEAR_EVENT when the query clears / the modal closes.
  // We paint EVERY match across the rendered text layers with the CSS Custom
  // Highlight API: the active match in `pdf-find-active` (accent), all the
  // others in `pdf-find` (translucent grey). Because the viewer is virtualized,
  // the highlights are also rebuilt whenever a text layer renders/unrenders.
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
    // `pdf-find-active` is registered last so it paints on top where they meet.
    CSS.highlights.set("pdf-find", allHl)
    CSS.highlights.set("pdf-find-active", activeHl)
    return activeRange
  }, [])

  // ── Load the PDF document ─────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    setError(null)
    setDoc(null)
    // Fresh document → reset zoom back to fit-to-width. No React
    // state for zoom anymore — the render effect re-creates every
    // wrapper from scratch and applies `pendingZoomRef.current` to
    // each, so resetting the ref here is enough.
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
        // pdf.js mutates the input buffer; pass a fresh copy so a re-load
        // of the same path doesn't end up with a detached/empty buffer.
        //
        // `cMapUrl` / `standardFontDataUrl` point pdf.js at the
        // character-map files and the standard 14 PDF fonts (Helvetica,
        // Times, Courier and bold/italic variants). Without these, PDFs
        // that reference those fonts — which is most of them — render
        // with generic fallback glyphs. The directories are copied from
        // `node_modules/pdfjs-dist/` into `public/pdfjs/` by the
        // `predev` / `prebuild` script. Building the URLs from
        // `window.location.href` keeps them right in both Vite dev
        // (http://localhost/…) and packaged Electron (file:///…).
        const baseUrl = window.location.href
        const cMapUrl = new URL("pdfjs/cmaps/", baseUrl).toString()
        const standardFontDataUrl = new URL("pdfjs/standard_fonts/", baseUrl).toString()
        const loadingTask = pdfjs.getDocument({
          data: bytes.slice(),
          cMapUrl,
          // pdfjs-dist ships its cmaps in the binary-packed `.bcmap`
          // format — flag must be on or pdf.js looks for plain `.cmap`
          // files and 404s every one.
          cMapPacked: true,
          standardFontDataUrl,
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

  // Destroy the doc when it's replaced or the component unmounts.
  // Captured by closure so each cleanup tears down the right document.
  useEffect(() => {
    if (!doc) return
    return () => { void doc.destroy() }
  }, [doc])

  // Remove this PDF's text from the global registry when we unmount
  // or when the project id changes. Without this, find/replace could
  // keep returning hits from a PDF the user has since closed.
  useEffect(() => {
    return () => { unregisterPdfText(projectId) }
  }, [projectId])

  // Listen for find/replace "go to result" events. The event carries a
  // page number (1-indexed) and a 0-indexed per-page occurrence; we
  // scroll the matching page into view, then walk that page's
  // text-layer spans to find the Nth occurrence of the query and
  // apply a native browser Selection range to it. Selection styling
  // is themed via .pdf-viewer__text-layer ::selection in the CSS.
  useEffect(() => {
    const pagesEl = pagesRef.current
    const scrollEl = scrollRef.current
    if (!pagesEl || !scrollEl) return

    // Text layers render/unrender rapidly while scrolling, so coalesce highlight
    // rebuilds to one per frame. renderPage/unrenderPage call this via the ref.
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

      // Only scroll the page into view when it isn't already rendered — i.e.
      // when jumping to a new page. For the next/prev match on a page that's
      // already on screen we skip straight to centring the match, so rapid
      // navigation doesn't snap the page to the top.
      //
      // Scroll ONLY the PDF's own container, never `wrapper.scrollIntoView()`:
      // that walks every scroll-ancestor and aligns the page to the document
      // top, which scrolls the whole editor up and clips the top bar.
      if (!wrapper.querySelector(".pdf-viewer__text-layer")) {
        const wr = wrapper.getBoundingClientRect()
        const sr = scrollEl.getBoundingClientRect()
        scrollEl.scrollTop += wr.top - sr.top
      }

      // The target page may still be a bare placeholder — retry across frames
      // until its text layer renders, then paint the highlights and bring the
      // active match to the centre of the viewport.
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
        if (++attempts > 180) return // ~3s of frames
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
      // Drop any lingering highlights when the doc changes / the viewer unmounts.
      searchQueryRef.current = ""
      activeMatchRef.current = null
      rebuildSearchHighlights()
    }
  }, [doc, projectId, documentId, rebuildSearchHighlights])

  // Cmd/Ctrl+A inside the PDF viewer selects every text-layer span
  // across every page. The browser's default Cmd+A behaviour selects
  // the editor center (which can include the surrounding chrome);
  // scoping the selection to the pages column gives the expected
  // "select all text in the PDF" outcome.
  //
  // Two entry points, one helper:
  //   • Web build → no Electron menu accelerator, so the renderer's
  //     keydown listener catches Cmd+A directly.
  //   • Electron build → the native menu accelerator consumes the
  //     keystroke before any keydown listener can see it, then
  //     dispatches `EDITOR_COMMAND_EVENT` over the command bus. We
  //     listen for that too and run the same helper.
  useEffect(() => {
    const scrollEl = scrollRef.current
    if (!scrollEl) return

    /** True iff the PDF viewer currently owns focus — `document.body` counts
     *  (initial load / blank click inside the viewer). Anything focused
     *  outside the viewer (find input, sidebar) yields the keystroke. */
    const viewerOwnsFocus = () => {
      const active = document.activeElement
      if (!active || active === document.body) return true
      return scrollEl.contains(active)
    }

    /** Select every text-layer span across every page. Returns true when a
     *  selection was actually made so callers can preventDefault. */
    const selectAllPdfText = (): boolean => {
      const pagesEl = pagesRef.current
      if (!pagesEl) return false
      const textLayers = pagesEl.querySelectorAll(".pdf-viewer__text-layer")
      if (textLayers.length === 0) return false
      const range = document.createRange()
      // Span from the first text layer to the last. Canvases between
      // page wrappers aren't selectable text and don't inflate the
      // visible selection geometry.
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
    // Also handle the case where focus is on document.body (initial
    // load, after clicking on empty area inside the viewer).
    window.addEventListener("keydown", onKeyDown)
    window.addEventListener(EDITOR_COMMAND_EVENT, onEditorCommand)
    return () => {
      scrollEl.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener(EDITOR_COMMAND_EVENT, onEditorCommand)
    }
  }, [])

  // ── Trackpad pinch / ctrl+scroll → zoom ──────────────────────────────
  //
  // On macOS, a trackpad pinch is delivered to the renderer as `wheel`
  // events with `ctrlKey === true` (Chromium synthesises this). On
  // Windows/Linux, holding ctrl while scrolling sends the same flag.
  //
  // Zoom is applied via CSS `zoom` on the pages column — a paint-time
  // GPU-accelerated operation that costs essentially nothing. We do
  // NOT re-rasterize the canvases per wheel event; the OVERSAMPLE
  // headroom keeps them sharp through the common range. To keep the
  // gesture maximally smooth we mutate the DOM style *directly* (no
  // React reconciliation in the hot path).
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    // Pinch "tail" window: any wheel events arriving within this many
    // milliseconds after a pinch event are treated as part of the
    // same gesture and have their default (scroll) suppressed. macOS
    // trackpad emits pan + pinch interleaved, so without this the
    // page would scroll while the user is trying to zoom.
    const PINCH_TAIL_MS = 200
    // Sliding post-clamp cooldown — see comment on clampHitTimeRef
    // above. Mirrors the value used in ImageViewer.tsx.
    const CLAMP_COOLDOWN_MS = 250

    const onWheel = (event: WheelEvent) => {
      const now = performance.now()

      // Non-pinch wheel events: pan during a pinch is suppressed; pan
      // outside a pinch scrolls normally.
      if (!event.ctrlKey) {
        if (now - lastPinchTimeRef.current < PINCH_TAIL_MS) {
          event.preventDefault()
        }
        return
      }

      // Pinch / ctrl+scroll: zoom and pin to the cursor.
      event.preventDefault()
      lastPinchTimeRef.current = now

      // Sliding post-clamp cooldown — every wheel event arriving while
      // we're already cooling down extends the timer, so the whole
      // macOS momentum tail gets suppressed (including decayed
      // deltaY≈0 events and the opposite-sign tail) until the user
      // has actually lifted their fingers.
      if (now - clampHitTimeRef.current < CLAMP_COOLDOWN_MS) {
        clampHitTimeRef.current = now
        return
      }

      const oldZoom = pendingZoomRef.current
      // Direction: deltaY > 0 means pinch-in (zoom out), < 0 means
      // pinch-out (zoom in). Magnitude is small and proportional, so we
      // exponentiate to convert raw delta into a multiplicative factor.
      const factor = Math.exp(-event.deltaY * 0.01)
      const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, oldZoom * factor))
      if (newZoom === oldZoom) {
        // At the clamp — start / extend the sliding cooldown so the
        // momentum tail can't slip through and reverse the zoom.
        clampHitTimeRef.current = now
        return
      }
      pendingZoomRef.current = newZoom

      const pagesEl = pagesRef.current
      if (!pagesEl) return

      // ── Zoom toward the cursor ──
      //
      // The content does NOT scale uniformly about the scroll origin — the
      // inter-page gaps and the page padding are fixed, and the pages are
      // centered — so a `newScroll = offset*(r-1) + oldScroll*r` formula drifts
      // (worse deeper in the document) and can't anchor horizontally. Instead,
      // anchor to the actual page wrapper under the cursor: record the cursor's
      // fractional position within it, apply the zoom, then re-scroll so that
      // same fractional point lands back under the cursor. Measuring real
      // positions makes it exact regardless of gaps/padding/centering.
      const cx = event.clientX
      const cy = event.clientY

      // The wrapper under the cursor, or the nearest rendered page when the
      // cursor sits in a gap/gutter.
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

      // Cursor's fractional position within the anchor wrapper, BEFORE zoom.
      let fx = 0.5
      let fy = 0.5
      if (anchorEl) {
        const wr = anchorEl.getBoundingClientRect()
        if (wr.width > 0 && wr.height > 0) {
          fx = (cx - wr.left) / wr.width
          fy = (cy - wr.top) / wr.height
        }
      }

      // Resize every page to the new zoom (the read below forces a synchronous
      // reflow, so the new wrapper rect is up to date).
      applyZoom(newZoom)

      // Re-scroll so the recorded fractional point sits back under the cursor.
      if (anchorEl) {
        const wr = anchorEl.getBoundingClientRect()
        el.scrollLeft += wr.left + fx * wr.width - cx
        el.scrollTop += wr.top + fy * wr.height - cy
      }
    }

    // passive:false so preventDefault() actually blocks the browser's
    // default scroll/zoom handling on the pinch gesture.
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => {
      el.removeEventListener("wheel", onWheel)
    }
  }, [applyZoom])

  // ── Virtualized page rendering ───────────────────────────────────────
  //
  // We build a correctly-sized placeholder wrapper for EVERY page up front
  // (cheap — only page dimensions), but rasterise a <canvas> + build the
  // selectable text layer only for pages near the viewport, releasing both
  // again once a page scrolls far off-screen. Without this, a long PDF (e.g.
  // a ~450-page novel) rasterises every page into a ~40 MB canvas at once —
  // gigabytes of canvas memory that exhaust the renderer and freeze the app.
  // With it, only a handful of pages hold canvases at any moment, so memory
  // stays flat no matter how long the document is.
  //
  // A separate background pass extracts each page's text (data only — no
  // canvas, no DOM) for the find/replace registry, so search still covers the
  // whole document. A monotonically-increasing `generation` token guards
  // against overlapping rebuilds during fast resizes.
  useEffect(() => {
    if (!doc) return
    const pagesContainer = pagesRef.current
    const scrollContainer = scrollRef.current
    if (!pagesContainer || !scrollContainer) return

    let cancelled = false
    let generation = 0
    const activeRenderTasks = new Set<RenderTask>()
    // page number → its render task (key present means rasterised / rasterising;
    // absent means placeholder only). The value is null between claiming the
    // slot and the task actually starting.
    const renderedTasks = new Map<number, RenderTask | null>()
    const dpr = window.devicePixelRatio || 1

    const wrapperFor = (pageNumber: number) =>
      pagesContainer.querySelector<HTMLDivElement>(
        `.pdf-viewer__page-wrapper[data-page-number="${pageNumber}"]`,
      )

    // Resolve palette colours from the live document CSS (vars are scoped to
    // `.app`, not `:root`, so walk up to the `.app` host). Recomputed per page
    // so a palette change mid-scroll picks up the new colours.
    const resolvePageColors = (): { background: string; foreground: string } | undefined => {
      if (!matchPalette) return undefined
      const paletteHost = scrollContainer.closest(".app") ?? document.body
      const cs = getComputedStyle(paletteHost)
      const background = cs.getPropertyValue("--app-bg").trim() || "#111111"
      const foreground = cs.getPropertyValue("--editor-text").trim() || "#f5f5f5"
      return { background, foreground }
    }

    // Rasterise one page's canvas + text layer into its placeholder wrapper.
    const renderPage = async (pageNumber: number, myGen: number) => {
      if (cancelled || myGen !== generation) return
      if (renderedTasks.has(pageNumber)) return // already rendered / rendering
      const wrapper = wrapperFor(pageNumber)
      if (!wrapper) return
      renderedTasks.set(pageNumber, null) // claim the slot to avoid double-render

      let page: PDFPageProxy
      try {
        page = await doc.getPage(pageNumber)
      } catch {
        renderedTasks.delete(pageNumber)
        return
      }
      // Bail if a rebuild happened, or the page was scrolled out of the render
      // window (unrenderPage deletes our claimed slot) during the await.
      if (cancelled || myGen !== generation || !renderedTasks.has(pageNumber)) {
        renderedTasks.delete(pageNumber)
        return
      }

      const containerWidth = pagesContainer.clientWidth
      if (containerWidth === 0) {
        renderedTasks.delete(pageNumber)
        return
      }

      // Fit to container width, then ×OVERSAMPLE so the canvas stays crisp
      // through CSS zoom-in. Rasterise once; live zoom is a paint-time op.
      const baseViewport = page.getViewport({ scale: 1 })
      const fitScale = containerWidth / baseViewport.width
      const viewport = page.getViewport({ scale: fitScale * OVERSAMPLE })
      const displayViewport = page.getViewport({ scale: fitScale })
      const baseW = Math.floor(displayViewport.width)
      const baseH = Math.floor(displayViewport.height)
      // Correct the placeholder's stored base dims (it may have used page 1's
      // size) and re-apply the current zoom.
      wrapper.dataset.baseWidth = String(baseW)
      wrapper.dataset.baseHeight = String(baseH)
      applyZoomToPdfWrapper(wrapper, baseW, baseH, pendingZoomRef.current)

      const canvas = document.createElement("canvas")
      canvas.className = "pdf-viewer__page"
      canvas.width = Math.floor(viewport.width * dpr)
      canvas.height = Math.floor(viewport.height * dpr)
      canvas.style.width = `${baseW}px`

      const ctx = canvas.getContext("2d")
      if (!ctx) {
        renderedTasks.delete(pageNumber)
        return
      }

      const renderTask = page.render({
        canvas,
        canvasContext: ctx,
        viewport,
        transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
        pageColors: resolvePageColors(),
      })
      renderedTasks.set(pageNumber, renderTask)
      activeRenderTasks.add(renderTask)
      try {
        await renderTask.promise
      } catch {
        // Cancelled (scrolled away / resize) or render error.
        activeRenderTasks.delete(renderTask)
        renderedTasks.delete(pageNumber)
        return
      }
      activeRenderTasks.delete(renderTask)
      if (cancelled || myGen !== generation) return

      // Canvas goes first; the text layer overlays it.
      wrapper.insertBefore(canvas, wrapper.firstChild)

      // ── Text layer for selection / copy ──
      try {
        const textContent = await page.getTextContent()
        if (cancelled || myGen !== generation) return
        const textLayerDiv = document.createElement("div")
        textLayerDiv.className = "pdf-viewer__text-layer"
        textLayerDiv.style.width = `${baseW}px`
        textLayerDiv.style.height = `${baseH}px`
        // pdf.js v5 sizes its text spans via `calc(--total-scale-factor * …)`;
        // it sets the per-span vars but NOT this one, so we set it to the page's
        // display scale (the spans are laid out at that scale; the wrapper's
        // transform handles user zoom on top). Without it the selectable spans
        // collapse to a default font-size and the selection misaligns.
        textLayerDiv.style.setProperty("--total-scale-factor", String(displayViewport.scale))
        wrapper.appendChild(textLayerDiv)

        const textLayer = new TextLayer({
          textContentSource: textContent,
          container: textLayerDiv,
          viewport: displayViewport,
        })
        await textLayer.render()
        if (cancelled || myGen !== generation) return
        // Re-apply zoom now the text layer exists so it scales with the canvas.
        applyZoomToPdfWrapper(wrapper, baseW, baseH, pendingZoomRef.current)
      } catch {
        // No text layer (image-only page). Canvas alone is fine.
      }
      // A freshly-built text layer means new search matches to paint.
      scheduleHighlightRefreshRef.current?.()
    }

    // Release a page's canvas + text layer (keeping the sized placeholder) and
    // free the canvas backing store immediately so memory drops right away.
    const unrenderPage = (pageNumber: number) => {
      const task = renderedTasks.get(pageNumber)
      if (task === undefined) return
      if (task) {
        try { task.cancel() } catch { /* ignore */ }
        activeRenderTasks.delete(task)
      }
      renderedTasks.delete(pageNumber)
      const wrapper = wrapperFor(pageNumber)
      if (!wrapper) return
      const canvas = wrapper.querySelector<HTMLCanvasElement>(".pdf-viewer__page")
      if (canvas) {
        // Zeroing the dimensions drops the GPU/CPU backing store now rather
        // than waiting for GC.
        canvas.width = 0
        canvas.height = 0
        canvas.remove()
      }
      wrapper.querySelector(".pdf-viewer__text-layer")?.remove()
      // Its match ranges are gone now — rebuild without them.
      scheduleHighlightRefreshRef.current?.()
    }

    // Rasterise pages within ~1.5 viewports of the visible area; free the rest.
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const pageNumber = Number((entry.target as HTMLElement).dataset.pageNumber)
          if (!pageNumber) continue
          if (entry.isIntersecting) void renderPage(pageNumber, generation)
          else unrenderPage(pageNumber)
        }
      },
      { root: scrollContainer, rootMargin: "150% 0px" },
    )

    // Build a sized placeholder for every page, then let the IntersectionObserver
    // rasterise the visible window. Rebuilt on width changes (re-fit).
    const build = async () => {
      const myGen = ++generation
      for (const t of activeRenderTasks) {
        try { t.cancel() } catch { /* ignore */ }
      }
      activeRenderTasks.clear()
      renderedTasks.clear()
      io.disconnect()

      const containerWidth = pagesContainer.clientWidth
      if (containerWidth === 0) return

      // Size placeholders from page 1; each page's real size is applied when it
      // rasterises. Uniform documents — most books — never shift.
      let assumedW = Math.floor(containerWidth)
      let assumedH = Math.floor(containerWidth * 1.2941) // US-letter fallback ratio
      try {
        const first = await doc.getPage(1)
        const bv = first.getViewport({ scale: 1 })
        const dv = first.getViewport({ scale: containerWidth / bv.width })
        assumedW = Math.floor(dv.width)
        assumedH = Math.floor(dv.height)
      } catch { /* keep the letter-ratio guess */ }
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
    }

    // Background pass: extract every page's text for the find/replace registry
    // (data only — no canvas, no DOM), so search covers the whole document
    // without holding a canvas for every page. One page at a time, so it never
    // floods the worker ahead of the visible-page renders.
    const extractAllText = async () => {
      const extractedPageText: PdfPageText[] = []
      // Publish in batches so a long PDF (e.g. a ~450-page novel) is searchable
      // for its early pages within a second or two, rather than only after the
      // whole document has been extracted. Each keystroke in Find re-queries the
      // registry, so newly-published pages are picked up as the user types.
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
          // No text (image-only page).
        }
        if (!cancelled && extractedPageText.length > 0 && pageNumber % PUBLISH_EVERY === 0) {
          registerPdfText(projectId, [...extractedPageText])
        }
      }
      if (!cancelled && extractedPageText.length > 0) {
        registerPdfText(projectId, extractedPageText)
      }
    }

    // Rebuild only when the container WIDTH changes — that's the only thing that
    // changes the fit-to-width scale. Do NOT rebuild on height-only changes:
    // zooming in widens the content, which toggles the horizontal scrollbar and
    // changes the container's content-box HEIGHT; rebuilding there would
    // replaceChildren and reset the scroll position mid-zoom (the "zoom also
    // scrolls" bug). The vertical scrollbar is always present on a multi-page
    // doc, so width stays stable across zoom. `lastWidth = -1` so the observer's
    // initial fire (real width !== -1) performs the first build.
    let lastWidth = -1
    const ro = new ResizeObserver(() => {
      const width = scrollContainer.clientWidth
      if (width === lastWidth) return
      lastWidth = width
      void build()
    })
    ro.observe(scrollContainer)
    void extractAllText()

    return () => {
      cancelled = true
      generation = -1
      for (const t of activeRenderTasks) {
        try { t.cancel() } catch { /* ignore */ }
      }
      activeRenderTasks.clear()
      io.disconnect()
      ro.disconnect()
    }
    // `zoom` is intentionally NOT a dep — zoom is a paint-time CSS op. Toggling
    // `matchPalette` or switching the palette underneath needs a fresh rasterise,
    // so both are deps.
  }, [doc, matchPalette, paletteNonce, projectId])

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
          // `data-match-palette` is read by the CSS that swaps the
          // page-wrapper background between white and `--app-bg`
          // depending on whether the user has enabled "Match PDF to
          // Color Palette" in settings.
          data-match-palette={matchPalette ? "on" : "off"}
          // No `style={{ zoom }}` — zoom now lives on each page
          // wrapper as explicit pixel dimensions, applied by
          // `applyZoomToPdfWrapper` at render time and by the wheel
          // handler's `applyZoom` during gestures.
        />
      )}
    </div>
  )
}
