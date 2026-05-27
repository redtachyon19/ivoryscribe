// ImageViewer — read-only viewer for standalone PNG / JPEG documents.
//
// Mirrors PDFViewer's lifecycle: workspace-root + relative-path go in,
// an absolute path is computed at render time (so changing the workspace
// in settings reroots automatically), the bytes are read via the
// preload's `readFileBinary` IPC, then wrapped in a Blob URL so the
// browser's native <img> decoder takes over. We never let the renderer
// hold an absolute file:// URL or a cached bitmap — the source-of-truth
// is always the live workspace root + relative path.
//
// Why a Blob URL instead of <img src={absolutePath}>: Electron's
// renderer cannot load `file://` URLs without electron-specific
// permissions (and even then, paths with spaces / special chars cause
// trouble). Reading the file ourselves via the IPC, then handing the
// Uint8Array to URL.createObjectURL, sidesteps that entirely and works
// the same way it does for PDFs.

import { useCallback, useEffect, useRef, useState } from "react"
import { AlertCircle, FileImage } from "lucide-react"
import "./ImageViewer.css"

// Zoom clamps. Images get a much wider MAX than PDFs because the
// common image-inspection use case is "zoom way in on a pixel-level
// detail" — capping at 8× makes users bounce off the limit and feels
// restrictive. 32× is enough to inspect individual pixels of a
// reasonable-sized image without making the math overflow CSS layout.
const MIN_ZOOM = 0.25
const MAX_ZOOM = 32

type ImageViewerProps = {
  /** Current workspace root from settings. Joined with `relativePath`
   *  at render time to get an absolute path — we never cache the
   *  result, so the path always tracks whatever the user has chosen as
   *  their workspace right now. Null disables loading (cloud mode). */
  workspaceRoot: string | null
  /** Path of the image relative to the workspace root, e.g.
   *  `"Assets/photo.png"`. Stored on the project at hydrate. */
  relativePath: string
}

/** Map an extension to a MIME type so the Blob URL is decoded as the
 *  right image format. The browser is usually tolerant about this, but
 *  setting it explicitly avoids quirks with certain JPEGs that some
 *  decoders refuse without an explicit hint. */
function mimeForExtension(relativePath: string): string {
  const lower = relativePath.toLowerCase()
  if (lower.endsWith(".png")) return "image/png"
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg"
  return "application/octet-stream"
}

export default function ImageViewer({ workspaceRoot, relativePath }: ImageViewerProps) {
  // Resolve to an absolute path at render time, against the live
  // workspace root setting. We don't memo this — recomputing on every
  // render is trivial and guarantees that any workspace switch shows up
  // immediately.
  const filePath = (() => {
    if (!workspaceRoot) return null
    const api = window.electronAPI?.path
    if (!api) return null
    return api.join(workspaceRoot, relativePath)
  })()

  // Pre-flight error states (no workspace selected, not in Electron)
  // are derived during render — no setState in the effect for them.
  // This keeps the only-async-setState invariant the
  // `react-hooks/set-state-in-effect` rule enforces.
  const preflightError = (() => {
    if (!filePath) return "No workspace folder selected — open Settings to choose one."
    const api = window.electronAPI?.fs
    if (!api || typeof api.readFileBinary !== "function") return "Image viewing requires the desktop app."
    return null
  })()

  // The async-load state. Stays "loading" until the readFileBinary
  // promise resolves; switches to "ready" or "error" inside the
  // promise handlers (i.e. asynchronously, not synchronously in the
  // effect body — which is what the lint rule cares about).
  type LoadState =
    | { status: "loading" }
    | { status: "ready"; url: string }
    | { status: "error"; message: string }
  const [load, setLoad] = useState<LoadState>({ status: "loading" })
  // Stash the URL on a ref so the cleanup function can revoke the
  // previous one even when React batches state updates.
  const lastUrlRef = useRef<string | null>(null)

  // ── Zoom state (refs only — no React state) ─────────────────────────
  //
  // Zoom is applied by setting EXPLICIT pixel width/height on the <img>
  // and growing the stage box to match. We deliberately do NOT use CSS
  // `zoom` on the stage anymore: that approach broke once the rendered
  // image reached viewport edges, because Chromium's legacy `zoom`
  // property + `max-width: 100%` on a flex child causes the child to
  // re-clamp to the parent's pre-zoom 100% as the zoom grows, snapping
  // the image back to fit-to-window mid-gesture. Driving pixel sizes
  // directly from JS sidesteps that interaction entirely.
  //
  // The pending zoom value lives in a ref so a sequence of wheel
  // events all read the latest value without going through React
  // state. The DOM writes (`img.style.width`, `stage.style.width`)
  // persist across re-renders; the stage callback ref clears them
  // and resets the ref whenever the stage element fully remounts.
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const pendingZoomRef = useRef(1)
  // Natural pixel dimensions of the currently-loaded image bitmap,
  // captured from <img>.naturalWidth / naturalHeight on load.
  const naturalDimsRef = useRef<{ w: number; h: number } | null>(null)
  // "Fit-to-window at zoom = 1" pixel dimensions — natural size scaled
  // down (never up) to fit inside the viewport minus padding, preserving
  // aspect ratio. Every applied zoom is just `baseDims × zoom`.
  const baseDimsRef = useRef<{ w: number; h: number } | null>(null)
  // Timestamp of the last pinch (ctrl-wheel) event. Pan events arriving
  // within PINCH_TAIL_MS of a pinch are suppressed so the gesture stays
  // a pure zoom instead of slipping into a scroll halfway through.
  const lastPinchTimeRef = useRef(0)
  // ── Post-clamp sliding cooldown ──
  //
  // Targeted fix for the "zoom in, then the zoom flips inverted
  // mid-gesture" bug: macOS trackpad pinches don't end cleanly when
  // they hit MAX_ZOOM. After the user pinches past the limit,
  // Chromium keeps dispatching wheel events as the OS unwinds the
  // gesture's momentum — first with the same sign as the original
  // pinch, then decaying through zero, then a tail with the OPPOSITE
  // sign. That last batch would otherwise be processed as a real
  // pinch-in and immediately zoom OUT below the clamp.
  //
  // The previous fixed 250 ms cooldown wasn't enough because
  //   (a) the momentum tail on macOS routinely runs 300–600 ms, and
  //   (b) decayed events with deltaY ≈ 0 didn't re-extend the
  //       cooldown, so the very next opposite-sign event slipped
  //       through the moment the window expired.
  // The fix is to convert the cooldown into a SLIDING window:
  // every wheel event that arrives while we're already cooling down
  // resets the timer, so the cooldown only truly ends once wheel
  // events have stopped arriving entirely (the user has lifted
  // their fingers). Quick-direction reversals away from the clamp
  // still work because the cooldown only starts on a real clamp hit.
  const clampHitTimeRef = useRef(0)

  // Visual padding around the image inside the scroll viewport. Subtracted
  // when computing fit-to-window dims (so the image at zoom=1 doesn't
  // touch the viewport edges) and added back when sizing the stage so
  // there's breathing room at every zoom level. Read from the stage's
  // computed style lazily inside `applyZoom` so the value tracks the
  // CSS `clamp(24px, 6vw, 120px)` rule, not a hardcoded fallback.
  const FALLBACK_PAD_X = 48
  const FALLBACK_PAD_Y = 48

  // Read the live padding from the stage element. Falls back to a sane
  // default before the element exists, so this function is always safe
  // to call.
  const readStagePadding = useCallback((): { x: number; y: number } => {
    const stage = stageRef.current
    if (!stage) return { x: FALLBACK_PAD_X, y: FALLBACK_PAD_Y }
    const cs = getComputedStyle(stage)
    const px = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0)
    const py = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0)
    return {
      x: px > 0 ? px : FALLBACK_PAD_X,
      y: py > 0 ? py : FALLBACK_PAD_Y,
    }
  }, [])

  // Compute the fit-to-window base dimensions for a freshly-loaded
  // image. "Base" = the pixel size we render the image at when zoom=1,
  // so every applied size is just `base × zoom`. The image is never
  // enlarged above natural — small images stay small (and zoom grows
  // them from there); large images are shrunk to fit inside the
  // viewport minus padding.
  const computeBaseDims = useCallback((naturalW: number, naturalH: number): { w: number; h: number } | null => {
    const scroller = scrollRef.current
    if (!scroller || naturalW <= 0 || naturalH <= 0) return null
    const { x: padX, y: padY } = readStagePadding()
    const availW = Math.max(1, scroller.clientWidth - padX)
    const availH = Math.max(1, scroller.clientHeight - padY)
    const scale = Math.min(availW / naturalW, availH / naturalH, 1)
    return { w: naturalW * scale, h: naturalH * scale }
  }, [readStagePadding])

  // Apply a zoom level to the DOM by writing explicit pixel dimensions
  // on the image and growing the stage box to contain it (+ padding).
  // No-op until the image has loaded and `baseDimsRef` is populated;
  // the wheel handler still updates `pendingZoomRef` in the meantime,
  // and the onLoad handler picks up the latest pending value when the
  // image finishes decoding.
  const applyZoom = useCallback((zoom: number) => {
    const img = imgRef.current
    const stage = stageRef.current
    const scroller = scrollRef.current
    const base = baseDimsRef.current
    if (!img || !stage || !scroller || !base) return

    const displayW = base.w * zoom
    const displayH = base.h * zoom

    // Override the legacy max-width/max-height fallbacks defined in
    // CSS — they only apply before the image has loaded, but once we
    // know the natural size and the user's zoom, JS owns sizing.
    img.style.maxWidth = "none"
    img.style.maxHeight = "none"
    img.style.width = `${displayW}px`
    img.style.height = `${displayH}px`

    // The stage grows to contain the image + padding, but never
    // shrinks below the viewport — at small zoom levels we still want
    // the empty surround so the image stays centered and the scroll
    // container has something to lay out.
    const { x: padX, y: padY } = readStagePadding()
    const stageW = Math.max(scroller.clientWidth, displayW + padX)
    const stageH = Math.max(scroller.clientHeight, displayH + padY)
    stage.style.minWidth = "0"
    stage.style.minHeight = "0"
    stage.style.width = `${stageW}px`
    stage.style.height = `${stageH}px`
  }, [readStagePadding])

  // Image onLoad handler — fires when a new src finishes decoding.
  // Captures natural dims, recomputes the fit-to-window base, then
  // re-applies the current pending zoom so the new image lands at the
  // expected size on first paint (whether that's zoom=1 after a fresh
  // mount or the persisted level after switching between images).
  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const naturalW = e.currentTarget.naturalWidth
    const naturalH = e.currentTarget.naturalHeight
    if (naturalW <= 0 || naturalH <= 0) return
    naturalDimsRef.current = { w: naturalW, h: naturalH }
    baseDimsRef.current = computeBaseDims(naturalW, naturalH)
    applyZoom(pendingZoomRef.current)
  }, [applyZoom, computeBaseDims])

  // Callback ref for the stage. Runs whenever the element mounts (i.e.
  // every fresh load + initial mount) — we use it to reset zoom back
  // to fit-to-window and to clear any leftover scroll position and
  // inline-style overrides from a previous lifecycle. Doing this here
  // rather than in a useEffect side-steps the `set-state-in-effect`
  // lint rule (we don't touch React state here either — just refs
  // and DOM).
  const stageRefCallback = useCallback((el: HTMLDivElement | null) => {
    stageRef.current = el
    if (!el) return
    pendingZoomRef.current = 1
    baseDimsRef.current = null
    naturalDimsRef.current = null
    // Clear all inline overrides so the CSS fallback (min-width:100%
    // etc.) takes effect until the image finishes loading and JS
    // takes over sizing again.
    el.style.zoom = ""
    el.style.width = ""
    el.style.height = ""
    el.style.minWidth = ""
    el.style.minHeight = ""
    const scroller = scrollRef.current
    if (scroller) {
      scroller.scrollLeft = 0
      scroller.scrollTop = 0
    }
  }, [])

  useEffect(() => {
    // Pre-flight errors are surfaced during render — skip the async
    // load entirely if one is set.
    if (preflightError) return
    // filePath is non-null when preflightError is null (the preflight
    // check above proved it). Capture it in a local so TS narrows the
    // type for the async callback.
    const absPath = filePath
    if (!absPath) return
    const api = window.electronAPI?.fs
    if (!api || typeof api.readFileBinary !== "function") return

    let cancelled = false

    void (async () => {
      try {
        const bytes = await api.readFileBinary(absPath)
        if (cancelled) return
        // pdf.js mutates the input buffer (see PDFViewer); image
        // decoders don't, but we still hand the Blob a fresh copy so
        // a re-open of the same path can't accidentally see a
        // detached ArrayBuffer.
        const blob = new Blob([bytes.slice()], { type: mimeForExtension(relativePath) })
        const url = URL.createObjectURL(blob)
        if (cancelled) {
          URL.revokeObjectURL(url)
          return
        }
        // Revoke the previous URL before swapping in the new one so we
        // never leak. Doing it here rather than in the cleanup callback
        // keeps the active <img>'s src valid while the swap happens.
        if (lastUrlRef.current) URL.revokeObjectURL(lastUrlRef.current)
        lastUrlRef.current = url
        setLoad({ status: "ready", url })
      } catch (err) {
        if (cancelled) return
        const message = err instanceof Error ? err.message : "Failed to load image"
        setLoad({ status: "error", message })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [filePath, relativePath, preflightError])

  // Revoke the last URL when the component unmounts entirely so the
  // browser frees the bitmap.
  useEffect(() => {
    return () => {
      if (lastUrlRef.current) {
        URL.revokeObjectURL(lastUrlRef.current)
        lastUrlRef.current = null
      }
    }
  }, [])

  // ── Trackpad pinch / ctrl+scroll → zoom ───────────────────────────
  //
  // Direct port of PDFViewer's pinch handler. On macOS, a trackpad
  // pinch is delivered as a `wheel` event with `ctrlKey === true`
  // (Chromium synthesises this). On Windows/Linux, holding ctrl while
  // scrolling sends the same flag.
  //
  // Zoom is applied by writing explicit pixel width/height onto the
  // <img> element (and growing the stage box to match) via the
  // `applyZoom` helper, NOT via CSS `zoom`. CSS `zoom` + a
  // percentage-constrained child image caused the image to snap back
  // to fit-to-window the moment its rendered edges reached the
  // viewport boundary; explicit pixel sizing has no such break.
  // We mutate the DOM directly here so the gesture stays smooth —
  // no React reconciliation in the hot path.
  //
  // We re-attach when the load state flips because the scroll
  // container element only exists while we're rendering the ready
  // view; loading/error swap it out for a different root.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    // Pinch "tail": any wheel events arriving within this many ms after
    // a pinch event are treated as part of the same gesture and have
    // their default (scroll) suppressed. macOS trackpad emits pan +
    // pinch interleaved; without this the page would scroll while the
    // user is trying to zoom.
    const PINCH_TAIL_MS = 200
    // After hitting a zoom clamp, ignore wheel events for this long
    // so the OS gesture-momentum tail can't immediately flip the zoom
    // direction. Short enough that a deliberate reverse pinch after
    // the cooldown still feels responsive.
    const CLAMP_COOLDOWN_MS = 250

    const onWheel = (event: WheelEvent) => {
      const now = performance.now()

      // Non-pinch wheel: pan during a pinch is suppressed; pan outside
      // a pinch scrolls normally (which is what `overflow: auto` on
      // the container does for free).
      if (!event.ctrlKey) {
        if (now - lastPinchTimeRef.current < PINCH_TAIL_MS) {
          event.preventDefault()
        }
        return
      }

      // Pinch / ctrl+scroll: zoom and pin the point under the cursor.
      event.preventDefault()
      lastPinchTimeRef.current = now

      // Sliding post-clamp cooldown — drop wheel events for a beat
      // after the zoom hit MIN/MAX, AND extend the cooldown on every
      // event that arrives while we're already cooling down. This
      // swallows the entire macOS momentum tail (which can outlast
      // any fixed window AND can include decayed deltaY=0 events
      // that would otherwise have let the cooldown expire mid-tail
      // and the next reversed-sign event start zooming the wrong
      // way). Quick reversals away from the clamp are still
      // honored — the cooldown only starts on a real clamp hit.
      if (now - clampHitTimeRef.current < CLAMP_COOLDOWN_MS) {
        clampHitTimeRef.current = now
        return
      }

      const oldZoom = pendingZoomRef.current
      // deltaY > 0 = pinch-in (zoom out); < 0 = pinch-out (zoom in).
      // Exponentiate the raw delta into a multiplicative factor so the
      // gesture feels uniform regardless of trackpad sensitivity.
      const factor = Math.exp(-event.deltaY * 0.01)
      const rawZoom = oldZoom * factor
      const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, rawZoom))
      if (newZoom === oldZoom) {
        // At the clamp. Start the sliding cooldown unconditionally:
        // this also covers the deltaY≈0 case in the decaying tail,
        // where the previous "only if rawZoom !== oldZoom" gate
        // would have failed to re-extend the window and let the
        // first opposite-sign tail event slip through afterwards.
        clampHitTimeRef.current = now
        return
      }
      pendingZoomRef.current = newZoom

      const stageEl = stageRef.current
      if (!stageEl) return

      // ── Zoom toward the cursor ──
      //
      // Goal: the image point currently under the cursor stays under
      // the cursor after zoom. Same formula PDFViewer uses: let r =
      // newZoom / oldZoom and (cx, cy) = cursor offset inside the
      // scroll viewport. The new scroll position that keeps content
      // anchored to the cursor is:
      //   newScroll = cursorOffset * (r - 1) + oldScroll * r
      const r = newZoom / oldZoom
      const rect = el.getBoundingClientRect()
      const cursorX = event.clientX - rect.left
      const cursorY = event.clientY - rect.top
      const oldScrollLeft = el.scrollLeft
      const oldScrollTop = el.scrollTop

      // Direct DOM write: bypass React entirely so the visual update
      // lands on the very next frame, in the same paint as the scroll
      // adjustment below. `applyZoom` writes explicit pixel dims on
      // the <img> and stage (replacing the old CSS `zoom` approach
      // that snap-broke at viewport edges); the scrollLeft/scrollTop
      // adjustment lands in the same frame so the cursor stays
      // anchored to the same image point through the zoom.
      applyZoom(newZoom)
      el.scrollLeft = cursorX * (r - 1) + oldScrollLeft * r
      el.scrollTop = cursorY * (r - 1) + oldScrollTop * r
    }

    // passive: false so preventDefault() actually blocks the browser's
    // default scroll/zoom handling on the pinch gesture.
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => {
      el.removeEventListener("wheel", onWheel)
    }
  }, [load.status])

  // Pre-flight errors win over the async load state — if we never
  // could have started the load, surface that reason rather than the
  // initial "loading" placeholder.
  if (preflightError) {
    return (
      <div className="image-viewer image-viewer--error" role="alert">
        <AlertCircle size={28} strokeWidth={1.6} aria-hidden={true} />
        <span>{preflightError}</span>
        <span className="image-viewer__path">{relativePath}</span>
      </div>
    )
  }

  if (load.status === "error") {
    return (
      <div className="image-viewer image-viewer--error" role="alert">
        <AlertCircle size={28} strokeWidth={1.6} aria-hidden={true} />
        <span>{load.message}</span>
        <span className="image-viewer__path">{relativePath}</span>
      </div>
    )
  }

  if (load.status === "loading") {
    return (
      <div className="image-viewer image-viewer__loading">
        <FileImage size={28} strokeWidth={1.6} aria-hidden={true} />
        <span>Loading image…</span>
      </div>
    )
  }

  return (
    <div className="image-viewer" ref={scrollRef}>
      {/* The stage holds the image and is the element that gets CSS
          `zoom` applied directly during pinch / ctrl-scroll. Using a
          callback ref here so we can reset zoom + scroll position
          every time the element mounts (i.e. when a fresh image
          loads — the loading state unmounts the stage in between). */}
      <div className="image-viewer__stage" ref={stageRefCallback}>
        {/* Native <img> handles decoding + zoom-on-scroll via the
            browser's own subpixel scaling. Object-fit: contain keeps
            the entire image visible inside the editor pane without
            cropping; the wrapper takes care of centering. The alt
            text falls back to the on-disk basename so a missing
            decode still reads sensibly. */}
        <img
          ref={imgRef}
          className="image-viewer__image"
          src={load.url}
          alt={relativePath}
          draggable={false}
          onLoad={handleImageLoad}
        />
      </div>
    </div>
  )
}
