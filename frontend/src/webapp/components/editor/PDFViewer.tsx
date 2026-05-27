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
  /** Project id for the open PDF. Used to register the extracted text
   *  with `pdfTextRegistry` so find/replace can search this document,
   *  and to match incoming "go to this page" focus events. */
  projectId: string
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

/** Walk an element's text nodes, find the Nth case-insensitive
 *  occurrence of `needle` across the full concatenation, and apply
 *  it as a browser Selection range. Returns true if a selection
 *  was made.
 *
 *  Why "across the full concatenation": pdf.js's text layer often
 *  splits a single visual word into adjacent spans (per glyph run),
 *  so the match might span multiple text nodes. We build a virtual
 *  string out of all text nodes and a parallel index that maps
 *  global offsets back to (node, offset) pairs. */
function selectNthOccurrenceInElement(
  container: HTMLElement,
  needle: string,
  occurrenceIndex: number,
): boolean {
  if (!needle) return false
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
  if (slots.length === 0) return false

  const haystack = slots.map((s) => s.node.nodeValue ?? "").join("").toLowerCase()
  const needleLower = needle.toLowerCase()

  let fromIndex = 0
  let occurrence = 0
  while (fromIndex < haystack.length) {
    const idx = haystack.indexOf(needleLower, fromIndex)
    if (idx === -1) return false
    if (occurrence === occurrenceIndex) {
      const startSlot = slots.find((s) => idx >= s.start && idx <= s.start + s.len)
      const endOffset = idx + needle.length
      const endSlot = slots.find((s) => endOffset >= s.start && endOffset <= s.start + s.len)
      if (!startSlot || !endSlot) return false
      try {
        const range = document.createRange()
        range.setStart(startSlot.node, idx - startSlot.start)
        range.setEnd(endSlot.node, endOffset - endSlot.start)
        const selection = window.getSelection()
        if (!selection) return false
        selection.removeAllRanges()
        selection.addRange(range)
        return true
      } catch {
        return false
      }
    }
    occurrence += 1
    fromIndex = idx + Math.max(1, needle.length)
  }
  return false
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

export default function PDFViewer({ workspaceRoot, relativePath, projectId, matchPalette = false }: PDFViewerProps) {
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
    const onFocus = (event: Event) => {
      const customEvent = event as CustomEvent<ProjectSearchFocusDetail>
      const detail = customEvent.detail
      if (!detail || detail.documentType !== "pdf" || detail.documentId !== projectId) return

      const pageNumber = detail.start
      const occurrenceInPage = detail.end
      const pagesEl = pagesRef.current
      const scrollEl = scrollRef.current
      if (!pagesEl || !scrollEl) return

      const wrapper = pagesEl.querySelector<HTMLDivElement>(
        `.pdf-viewer__page-wrapper[data-page-number="${pageNumber}"]`,
      )
      if (!wrapper) return
      wrapper.scrollIntoView({ behavior: "smooth", block: "start" })

      // Brief outline pulse on the page wrapper as a wayfinding cue
      // — independent of the text-level selection below.
      wrapper.classList.remove("pdf-viewer__page-wrapper--flash")
      void wrapper.offsetWidth
      wrapper.classList.add("pdf-viewer__page-wrapper--flash")

      // ── Per-match Selection highlight ──
      // Build a virtual concatenation of the page's text-layer text
      // (walking all text nodes inside .pdf-viewer__text-layer), find
      // the Nth occurrence of the query, then map the character
      // offsets back to (node, offset) pairs to build a Range. The
      // browser draws the selection using our themed ::selection CSS.
      const textLayer = wrapper.querySelector<HTMLDivElement>(".pdf-viewer__text-layer")
      if (textLayer) {
        selectNthOccurrenceInElement(textLayer, detail.query, occurrenceInPage)
      }
    }

    window.addEventListener(APP_PROJECT_SEARCH_FOCUS_EVENT, onFocus as EventListener)
    return () => {
      window.removeEventListener(APP_PROJECT_SEARCH_FOCUS_EVENT, onFocus as EventListener)
    }
  }, [projectId])

  // Cmd/Ctrl+A inside the PDF viewer selects every text-layer span
  // across every page. The browser's default Cmd+A behaviour selects
  // the editor center (which can include the surrounding chrome);
  // scoping the selection to the pages column gives the expected
  // "select all text in the PDF" outcome.
  useEffect(() => {
    const scrollEl = scrollRef.current
    if (!scrollEl) return

    const onKeyDown = (event: KeyboardEvent) => {
      const isPrimary = event.metaKey || event.ctrlKey
      if (!isPrimary || event.shiftKey || event.altKey) return
      if (event.key.toLowerCase() !== "a") return

      // Only handle when the keydown is happening while the viewer is
      // the active surface — we check by walking up from the active
      // element. If something else owns focus (e.g. the find input),
      // let its default Cmd+A behaviour run.
      const active = document.activeElement
      if (active && active !== document.body && !scrollEl.contains(active)) return

      const pagesEl = pagesRef.current
      if (!pagesEl) return
      // Need at least one text layer to select anything meaningful.
      const firstTextLayer = pagesEl.querySelector(".pdf-viewer__text-layer")
      if (!firstTextLayer) return

      event.preventDefault()
      const range = document.createRange()
      // Select everything from the first text layer to the last —
      // skipping the canvases in between, which aren't selectable
      // anyway but would inflate the selection's geometry.
      const textLayers = pagesEl.querySelectorAll(".pdf-viewer__text-layer")
      if (textLayers.length === 0) return
      range.setStartBefore(textLayers[0])
      range.setEndAfter(textLayers[textLayers.length - 1])
      const selection = window.getSelection()
      if (!selection) return
      selection.removeAllRanges()
      selection.addRange(range)
    }

    scrollEl.addEventListener("keydown", onKeyDown)
    // Also handle the case where focus is on document.body (initial
    // load, after clicking on empty area inside the viewer).
    window.addEventListener("keydown", onKeyDown)
    return () => {
      scrollEl.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("keydown", onKeyDown)
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
      // Goal: the page point under the cursor stays under the cursor
      // after the zoom. With explicit pixel sizing, the scroll
      // container's scroll dimensions scale by the same factor as the
      // pages (because every wrapper's width/height multiplies by r),
      // so the math is identical to the old CSS-`zoom` version.
      // Let `r = newZoom/oldZoom` and (cx, cy) be the cursor's offset
      // inside the scroll viewport. The new scroll position that
      // keeps the same content under the cursor is:
      //   newScroll = cursorOffset * (r - 1) + oldScroll * r
      const r = newZoom / oldZoom
      const rect = el.getBoundingClientRect()
      const cursorX = event.clientX - rect.left
      const cursorY = event.clientY - rect.top
      const oldScrollLeft = el.scrollLeft
      const oldScrollTop = el.scrollTop

      // Direct DOM write — `applyZoom` rewrites every page wrapper's
      // pixel dimensions and the scroll-position adjustment below
      // lands in the same frame. No CSS `zoom`, no transform on the
      // container; just explicit sizes that Chromium lays out
      // synchronously.
      applyZoom(newZoom)
      el.scrollLeft = cursorX * (r - 1) + oldScrollLeft * r
      el.scrollTop = cursorY * (r - 1) + oldScrollTop * r
    }

    // passive:false so preventDefault() actually blocks the browser's
    // default scroll/zoom handling on the pinch gesture.
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => {
      el.removeEventListener("wheel", onWheel)
    }
  }, [applyZoom])

  // ── Render pages whenever doc or container width changes ─────────────
  //
  // Strategy: clear the pages column, then walk the document one page at
  // a time, scaling each page's natural width to the container's inner
  // width. Each page renders to its own canvas (devicePixelRatio for
  // crispness) and is appended as soon as it's ready, so the user sees
  // progressive loading rather than a long blank wait.
  //
  // A monotonically-increasing `generation` token guards against
  // overlapping renders during fast resizes — only the latest render's
  // appends are kept; older ones bail out.
  useEffect(() => {
    if (!doc) return
    const pagesContainer = pagesRef.current
    const scrollContainer = scrollRef.current
    if (!pagesContainer || !scrollContainer) return

    let generation = 0
    const activeRenderTasks = new Set<RenderTask>()

    const render = async () => {
      const myGen = ++generation
      // Cancel any still-running renders from the previous generation —
      // they would write into stale canvases we're about to discard.
      for (const t of activeRenderTasks) {
        try { t.cancel() } catch { /* ignore */ }
      }
      activeRenderTasks.clear()

      const containerWidth = pagesContainer.clientWidth
      if (containerWidth === 0) return

      const dpr = window.devicePixelRatio || 1

      // Resolve palette colours from the live document CSS so the
      // rasterised pages match whatever palette the user has chosen
      // *right now*. The palette vars are scoped to `.app` (see
      // App.css), NOT `:root` — reading off `documentElement` returns
      // empty strings and the fallback grey leaks through. Walk up
      // from the scroll container to find the `.app` ancestor that
      // actually carries the vars.
      let pageColors: { background: string; foreground: string } | undefined
      if (matchPalette) {
        const paletteHost = scrollContainer.closest(".app") ?? document.body
        const cs = getComputedStyle(paletteHost)
        const background = cs.getPropertyValue("--app-bg").trim() || "#111111"
        const foreground = cs.getPropertyValue("--editor-text").trim() || "#f5f5f5"
        pageColors = { background, foreground }
      }

      // Snapshot the currently-rendered page wrappers. We swap each
      // page in-place when its new version is ready — the old wrapper
      // stays visible until the new one is fully painted and ready
      // to take its place. Flicker-free zoom: we never empty the
      // container, we only replace one node at a time.
      const oldPageEls = Array.from(pagesContainer.children) as HTMLDivElement[]

      // Collected page text for the find/replace registry. We populate
      // this lazily inside the loop and publish to the registry once
      // the render completes.
      const extractedPageText: PdfPageText[] = []

      for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
        if (myGen !== generation) return
        let page: PDFPageProxy
        try {
          page = await doc.getPage(pageNumber)
        } catch {
          continue
        }
        if (myGen !== generation) return

        // Fit each page to the container's inner width, then multiply by
        // OVERSAMPLE so the canvas has enough resolution to stay crisp
        // under CSS zoom-in. We rasterize ONCE at this resolution; the
        // user's live zoom is a paint-time CSS operation on top.
        const baseViewport = page.getViewport({ scale: 1 })
        const fitScale = containerWidth / baseViewport.width
        const viewport = page.getViewport({ scale: fitScale * OVERSAMPLE })
        // The text layer is positioned at the *display* size, not the
        // oversampled raster size — that's where the user's mouse
        // actually clicks. Same scale as the visible canvas.
        const displayViewport = page.getViewport({ scale: fitScale })

        // Wrapper: a relatively-positioned container holding the
        // canvas (block) and the text layer (absolutely positioned
        // on top of it) so they overlap exactly.
        const wrapper = document.createElement("div")
        wrapper.className = "pdf-viewer__page-wrapper"
        wrapper.dataset.pageNumber = String(pageNumber)
        // Stash the fit-to-width base dimensions on the wrapper itself
        // so the wheel handler's `applyZoom` can iterate every page
        // and rewrite its display size without re-querying pdf.js.
        const baseW = Math.floor(displayViewport.width)
        const baseH = Math.floor(displayViewport.height)
        wrapper.dataset.baseWidth = String(baseW)
        wrapper.dataset.baseHeight = String(baseH)
        // Initial size = base × 1; `applyZoomToPdfWrapper` below
        // overwrites this with the actual current zoom after the
        // canvas + text layer are attached.
        wrapper.style.width = `${baseW}px`

        const canvas = document.createElement("canvas")
        canvas.className = "pdf-viewer__page"
        canvas.width = Math.floor(viewport.width * dpr)
        canvas.height = Math.floor(viewport.height * dpr)
        canvas.style.width = `${Math.floor(displayViewport.width)}px`

        const ctx = canvas.getContext("2d")
        if (!ctx) continue

        const renderTask = page.render({
          canvas,
          canvasContext: ctx,
          viewport,
          transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
          // When defined, pdf.js re-tints text glyphs to `foreground`
          // and fills the page surface with `background`. Embedded
          // images are not affected. Undefined → original colours.
          pageColors,
        })
        activeRenderTasks.add(renderTask)

        try {
          await renderTask.promise
        } catch {
          // Cancelled by a newer generation, or render error. Discard
          // the half-painted canvas; the old wrapper stays in place.
          activeRenderTasks.delete(renderTask)
          continue
        }
        activeRenderTasks.delete(renderTask)
        if (myGen !== generation) return

        wrapper.appendChild(canvas)

        // ── Text layer for selection / copy ──
        // Render an invisible HTML overlay of selectable text spans
        // positioned over the canvas. PDF.js's `TextLayer` class does
        // the work — we just give it the page's text content and a
        // viewport that matches the display size. Wrapped in try/catch
        // because some PDFs (scanned image-only) have no text content
        // and we don't want a render glitch to crash the whole page.
        try {
          const textContent = await page.getTextContent()
          if (myGen !== generation) return

          const textLayerDiv = document.createElement("div")
          textLayerDiv.className = "pdf-viewer__text-layer"
          textLayerDiv.style.width = `${Math.floor(displayViewport.width)}px`
          textLayerDiv.style.height = `${Math.floor(displayViewport.height)}px`
          wrapper.appendChild(textLayerDiv)

          const textLayer = new TextLayer({
            textContentSource: textContent,
            container: textLayerDiv,
            viewport: displayViewport,
          })
          await textLayer.render()
          if (myGen !== generation) return

          // Build a plain-text representation of the page for the
          // find/replace registry. Item strings are space-joined —
          // not pixel-perfect to the visual layout but good enough
          // for substring search.
          const pageText = textContent.items
            .map((item) => (("str" in item) ? item.str : ""))
            .join(" ")
          extractedPageText.push({ pageNumber, text: pageText })
        } catch {
          // No text layer (image-only page). Canvas alone is fine.
        }

        // Apply the user's current zoom level to this freshly-built
        // wrapper before inserting it, so the in-place swap below
        // doesn't briefly show a fit-to-width-sized page when the
        // user is already zoomed in. Uses the same helper the wheel
        // handler calls so all pages stay in sync.
        applyZoomToPdfWrapper(wrapper, baseW, baseH, pendingZoomRef.current)

        // Atomic in-place swap: the new wrapper appears in the same
        // DOM position as the old one in a single paint frame.
        const oldEl = oldPageEls[pageNumber - 1]
        if (oldEl && oldEl.parentNode === pagesContainer) {
          pagesContainer.replaceChild(wrapper, oldEl)
        } else {
          pagesContainer.appendChild(wrapper)
        }
      }

      if (myGen === generation && extractedPageText.length > 0) {
        registerPdfText(projectId, extractedPageText)
      }
    }

    // Initial render + re-render on container width changes.
    const ro = new ResizeObserver(() => { void render() })
    ro.observe(scrollContainer)

    return () => {
      generation = -1
      for (const t of activeRenderTasks) {
        try { t.cancel() } catch { /* ignore */ }
      }
      activeRenderTasks.clear()
      ro.disconnect()
    }
    // NB: `zoom` is intentionally NOT in this dep list — zoom is a CSS
    // operation only. We rasterize once and live-zoom via paint.
    // `matchPalette` and `paletteNonce` IS in the list — toggling the
    // setting OR switching the palette CSS vars underneath both need
    // a fresh rasterise to pick up the new pageColors.
  }, [doc, matchPalette, paletteNonce])

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
