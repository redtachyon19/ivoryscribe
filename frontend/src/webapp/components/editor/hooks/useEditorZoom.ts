import { useEffect, useRef } from "react"

const MIN_ZOOM = 0.5
const MAX_ZOOM = 5
const SNAP_MIN_ZOOM = 0.1
const SNAP_MAX_ZOOM = 8
const SNAP_TOLERANCE = 0.05

type UseEditorZoomOptions = {
  contentRef: React.RefObject<HTMLElement | null>
  scrollRef?: React.RefObject<HTMLElement | null>
  enabledKey?: unknown
  snapPageWidthPx?: number
  snapGutterPx?: number
  fluidContentWidth?: boolean
}

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

function findOverflowParent(el: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = el.parentElement
  while (node) {
    const oy = getComputedStyle(node).overflowY
    if (oy === "auto" || oy === "scroll") return node
    node = node.parentElement
  }
  return null
}

export function useEditorZoom({ scrollRef, contentRef, enabledKey, snapPageWidthPx, snapGutterPx = 0, fluidContentWidth }: UseEditorZoomOptions) {
  const rawZoomRef = useRef(1)
  const appliedZoomRef = useRef(1)
  const lastPinchTimeRef = useRef(0)

  useEffect(() => {
    const content = contentRef.current
    if (!content) return
    const scroller =
      scrollRef?.current ??
      (fluidContentWidth ? findOverflowParent(content) : null) ??
      findScrollParent(content)
    if (!scroller) return

    let widthObserver: ResizeObserver | null = null
    if (fluidContentWidth) {
      const syncWidth = () => {
        const w = scroller.clientWidth
        if (w <= 0) return
        const next = `${w}px`
        if (content.style.width !== next) content.style.width = next
      }
      syncWidth()
      widthObserver = new ResizeObserver(syncWidth)
      widthObserver.observe(scroller)
    }

    const PINCH_TAIL_MS = 200

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

      window.dispatchEvent(new CustomEvent("tw:zoom"))
    }

    const detents = (): number[] | null => {
      if (!snapPageWidthPx || snapPageWidthPx <= 0) return null
      const avail = scroller.clientWidth
      if (avail <= 0) return null
      const full = avail / (snapPageWidthPx + snapGutterPx)
      return [full, full / 2, full / 4, 1]
    }

    const onWheel = (event: WheelEvent) => {
      const now = performance.now()

      if (!event.ctrlKey) {
        if (now - lastPinchTimeRef.current < PINCH_TAIL_MS) event.preventDefault()
        return
      }

      event.preventDefault()
      lastPinchTimeRef.current = now

      const snapping = !!snapPageWidthPx
      const lo = snapping ? SNAP_MIN_ZOOM : MIN_ZOOM
      const hi = snapping ? SNAP_MAX_ZOOM : MAX_ZOOM

      const factor = Math.exp(-event.deltaY * 0.01)
      const newRaw = Math.min(hi, Math.max(lo, rawZoomRef.current * factor))
      rawZoomRef.current = newRaw

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
      widthObserver?.disconnect()
    }
  }, [scrollRef, contentRef, enabledKey, snapPageWidthPx, snapGutterPx, fluidContentWidth])
}
