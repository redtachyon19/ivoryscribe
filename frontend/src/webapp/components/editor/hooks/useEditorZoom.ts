// useEditorZoom — trackpad-pinch / ctrl+scroll zoom for the prose editors
// (Draft + Typewriter), zooming toward the cursor.
//
// This mirrors the ImageViewer / PDFViewer pinch handler (ctrl+wheel = macOS
// trackpad pinch), but where those resize an <img>/canvas in pixels, a text
// editor zooms via the CSS `zoom` property on the content element.
//
// Why `zoom` and not `transform: scale()`: `transform` is purely visual — it
// does NOT change layout, so the scroll container's scrollHeight stays at the
// unscaled size and zoomed-in content gets clipped/unreachable above the
// fold. CSS `zoom` reflows the box at the new scale, so the scroll area grows
// to contain it and every line stays reachable. Chromium (Electron + the web
// build) supports `zoom` natively.
//
// Cursor anchoring uses the same formula as the image/pdf viewers — because
// `zoom` scales the scrollable content, scrollHeight scales by the same factor
// r = newZoom/oldZoom, so:
//   newScroll = cursorOffset * (r - 1) + oldScroll * r
//
// Zoom is always fluid (continuous). When `snapPageWidthPx` is set (the
// Typewriter page), three "magnetic" detents are added — where the page fills
// the full, half, or quarter of the editor width. The gesture accumulates a
// continuous *raw* zoom; the *applied* zoom sticks to a detent while the raw
// value is within a small tolerance band, then releases as you keep going, so
// you glide smoothly but settle naturally on those levels.

import { useEffect, useRef } from "react"

const MIN_ZOOM = 0.5
const MAX_ZOOM = 5
// Bounds for the snap-enabled (Typewriter) range. The quarter-width detent can
// sit below the free-zoom MIN on a wide editor, so allow a lower floor.
const SNAP_MIN_ZOOM = 0.1
const SNAP_MAX_ZOOM = 8
// How close (as a fraction) the fluid zoom must be to a detent to stick to it.
const SNAP_TOLERANCE = 0.05

type UseEditorZoomOptions = {
  /** The element we zoom via the CSS `zoom` property. The scroll container is
   *  auto-resolved as its nearest scrollable ancestor. */
  contentRef: React.RefObject<HTMLElement | null>
  /** Explicit scroll container. If omitted, the nearest ancestor with
   *  overflow auto/scroll is used. */
  scrollRef?: React.RefObject<HTMLElement | null>
  /** Re-attach the wheel listener when this changes (e.g. editor mount). */
  enabledKey?: unknown
  /** Adds magnetic snap detents. The page's unscaled width in CSS px (e.g. an
   *  8.5in page is 816px). The three detents make that page fill the full /
   *  half / quarter of the scroll container's visible width. Omit for plain
   *  fluid zoom (no detents). */
  snapPageWidthPx?: number
  /** Unscaled width in CSS px of fixed chrome that sits alongside the page in
   *  the same zoomed block (e.g. the Typewriter's vertical ruler column). The
   *  detents reserve room for it so the "full" level fits the page AND this
   *  gutter inside the editor width — otherwise the block overflows and the
   *  page covers the gutter. */
  snapGutterPx?: number
}

/** Walk up from `el` to the nearest ancestor that scrolls vertically. */
function findScrollParent(el: HTMLElement): HTMLElement {
  let node: HTMLElement | null = el.parentElement
  while (node) {
    const oy = getComputedStyle(node).overflowY
    if ((oy === "auto" || oy === "scroll") && node.scrollHeight > node.clientHeight + 1) {
      return node
    }
    node = node.parentElement
  }
  return el
}

export function useEditorZoom({ scrollRef, contentRef, enabledKey, snapPageWidthPx, snapGutterPx = 0 }: UseEditorZoomOptions) {
  // `rawZoomRef` is the continuous value the gesture accumulates; `appliedZoomRef`
  // is what's actually set as CSS zoom (== raw, unless stuck to a detent).
  const rawZoomRef = useRef(1)
  const appliedZoomRef = useRef(1)
  const lastPinchTimeRef = useRef(0)

  useEffect(() => {
    const content = contentRef.current
    if (!content) return
    const scroller = scrollRef?.current ?? findScrollParent(content)
    if (!scroller) return

    const PINCH_TAIL_MS = 200

    // Apply a new zoom and keep the point under the cursor fixed.
    const applyZoom = (newZoom: number, event: WheelEvent) => {
      const oldZoom = appliedZoomRef.current
      if (newZoom === oldZoom) return
      appliedZoomRef.current = newZoom

      const r = newZoom / oldZoom
      const rect = scroller.getBoundingClientRect()
      const cursorX = event.clientX - rect.left
      const cursorY = event.clientY - rect.top
      const oldScrollLeft = scroller.scrollLeft
      const oldScrollTop = scroller.scrollTop

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(content.style as any).zoom = String(newZoom)
      scroller.scrollLeft = cursorX * (r - 1) + oldScrollLeft * r
      scroller.scrollTop = cursorY * (r - 1) + oldScrollTop * r
    }

    // The detent levels (full / half / quarter of the live editor width), or
    // null when snapping is disabled.
    const detents = (): number[] | null => {
      if (!snapPageWidthPx || snapPageWidthPx <= 0) return null
      const avail = scroller.clientWidth
      if (avail <= 0) return null
      // Reserve room for the gutter (vertical ruler) so the "full" level fits
      // the page AND the gutter inside the editor — both stay visible.
      const full = avail / (snapPageWidthPx + snapGutterPx)
      // `1` is the natural-size (100%) detent — the page renders at its true
      // CSS px and the zoomed chrome (e.g. the show-rulers icon) matches the
      // fixed-size settings icon.
      return [full, full / 2, full / 4, 1]
    }

    const onWheel = (event: WheelEvent) => {
      const now = performance.now()

      // Non-pinch wheel: suppress pan only within the pinch tail; otherwise
      // let the container scroll normally.
      if (!event.ctrlKey) {
        if (now - lastPinchTimeRef.current < PINCH_TAIL_MS) event.preventDefault()
        return
      }

      event.preventDefault()
      lastPinchTimeRef.current = now

      const snapping = !!snapPageWidthPx
      const lo = snapping ? SNAP_MIN_ZOOM : MIN_ZOOM
      const hi = snapping ? SNAP_MAX_ZOOM : MAX_ZOOM

      // Accumulate the continuous (fluid) zoom.
      const factor = Math.exp(-event.deltaY * 0.01)
      const newRaw = Math.min(hi, Math.max(lo, rawZoomRef.current * factor))
      rawZoomRef.current = newRaw

      // Stick to a detent while the fluid value is within tolerance of it.
      let newApplied = newRaw
      const levels = detents()
      if (levels) {
        for (const level of levels) {
          if (Math.abs(newRaw / level - 1) < SNAP_TOLERANCE) {
            newApplied = level
            break
          }
        }
      }

      applyZoom(newApplied, event)
    }

    scroller.addEventListener("wheel", onWheel, { passive: false })
    return () => {
      scroller.removeEventListener("wheel", onWheel)
    }
  }, [scrollRef, contentRef, enabledKey, snapPageWidthPx, snapGutterPx])
}
