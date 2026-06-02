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

import { useEffect, useRef } from "react"

const MIN_ZOOM = 0.5
const MAX_ZOOM = 5

type UseEditorZoomOptions = {
  /** The element we zoom via the CSS `zoom` property. The scroll container is
   *  auto-resolved as its nearest scrollable ancestor. */
  contentRef: React.RefObject<HTMLElement | null>
  /** Explicit scroll container. If omitted, the nearest ancestor with
   *  overflow auto/scroll is used. */
  scrollRef?: React.RefObject<HTMLElement | null>
  /** Re-attach the wheel listener when this changes (e.g. editor mount). */
  enabledKey?: unknown
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

export function useEditorZoom({ scrollRef, contentRef, enabledKey }: UseEditorZoomOptions) {
  const zoomRef = useRef(1)
  const lastPinchTimeRef = useRef(0)
  const clampHitTimeRef = useRef(0)

  useEffect(() => {
    const content = contentRef.current
    if (!content) return
    const scroller = scrollRef?.current ?? findScrollParent(content)
    if (!scroller) return

    const PINCH_TAIL_MS = 200
    const CLAMP_COOLDOWN_MS = 250

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

      if (now - clampHitTimeRef.current < CLAMP_COOLDOWN_MS) {
        clampHitTimeRef.current = now
        return
      }

      const oldZoom = zoomRef.current
      const factor = Math.exp(-event.deltaY * 0.01)
      const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, oldZoom * factor))
      if (newZoom === oldZoom) {
        clampHitTimeRef.current = now
        return
      }
      zoomRef.current = newZoom

      // ── Zoom toward the cursor ──
      // `zoom` reflows the box, so scrollHeight scales by r = newZoom/oldZoom
      // and the same anchor formula the image/pdf viewers use applies.
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

    scroller.addEventListener("wheel", onWheel, { passive: false })
    return () => {
      scroller.removeEventListener("wheel", onWheel)
    }
  }, [scrollRef, contentRef, enabledKey])
}
