import { useCallback, useEffect, useRef, useState } from "react"

type Rect = { x: number; y: number; width: number; height: number }

type MarqueeState = {
  /** Whether a marquee drag is currently in progress */
  isActive: boolean
  /** The visible rectangle in viewport coordinates (for rendering the overlay) */
  rect: Rect | null
  /** IDs currently inside the marquee */
  selectedIds: Set<string>
}

type UseMarqueeSelectionOptions = {
  /**
   * Map of selectable item IDs to their bounding rects (relative to the container).
   * Called continuously during drag to compute intersections.
   */
  getItemRects: () => Map<string, DOMRect>
  /** The scroll container ref — marquee coords are relative to this */
  containerRef: React.RefObject<HTMLElement | null>
  /** Called when marquee finishes with final set of selected IDs */
  onSelectionChange: (ids: Set<string>) => void
  /** Minimum drag distance (px) before marquee activates */
  threshold?: number
}

export default function useMarqueeSelection({
  getItemRects,
  containerRef,
  onSelectionChange,
  threshold = 5,
}: UseMarqueeSelectionOptions) {
  const [state, setState] = useState<MarqueeState>({
    isActive: false,
    rect: null,
    selectedIds: new Set(),
  })

  const originRef = useRef({ x: 0, y: 0 })
  const activeRef = useRef(false)
  const thresholdMetRef = useRef(false)

  const rectsToSelection = useCallback(
    (marqueeRect: Rect): Set<string> => {
      const items = getItemRects()
      const selected = new Set<string>()

      const container = containerRef.current
      if (!container) return selected

      const containerRect = container.getBoundingClientRect()
      const scrollLeft = container.scrollLeft
      const scrollTop = container.scrollTop

      // Convert marquee to absolute container-scroll coords
      const mx1 = marqueeRect.x
      const my1 = marqueeRect.y
      const mx2 = mx1 + marqueeRect.width
      const my2 = my1 + marqueeRect.height

      for (const [id, domRect] of items) {
        // Item rect is viewport-relative, convert to container-scroll-relative
        const ix1 = domRect.left - containerRect.left + scrollLeft
        const iy1 = domRect.top - containerRect.top + scrollTop
        const ix2 = ix1 + domRect.width
        const iy2 = iy1 + domRect.height

        // AABB intersection
        if (mx1 < ix2 && mx2 > ix1 && my1 < iy2 && my2 > iy1) {
          selected.add(id)
        }
      }

      return selected
    },
    [getItemRects, containerRef],
  )

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Only left click, not on interactive elements
      if (e.button !== 0) return
      const target = e.target as HTMLElement
      if (target.closest("button, input, textarea, select, a, [draggable='true'], li, article")) return

      const container = containerRef.current
      if (!container) return

      // Prevent text selection while dragging
      e.preventDefault()

      const scrollLeft = container.scrollLeft
      const scrollTop = container.scrollTop
      const containerRect = container.getBoundingClientRect()

      originRef.current = {
        x: e.clientX - containerRect.left + scrollLeft,
        y: e.clientY - containerRect.top + scrollTop,
      }
      activeRef.current = true
      thresholdMetRef.current = false
    },
    [containerRef],
  )

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!activeRef.current) return

      const container = containerRef.current
      if (!container) return

      const containerRect = container.getBoundingClientRect()
      const scrollLeft = container.scrollLeft
      const scrollTop = container.scrollTop

      const currentX = e.clientX - containerRect.left + scrollLeft
      const currentY = e.clientY - containerRect.top + scrollTop

      if (!thresholdMetRef.current) {
        const dx = currentX - originRef.current.x
        const dy = currentY - originRef.current.y
        if (Math.sqrt(dx * dx + dy * dy) < threshold) return
        thresholdMetRef.current = true
      }

      const x = Math.min(originRef.current.x, currentX)
      const y = Math.min(originRef.current.y, currentY)
      const width = Math.abs(currentX - originRef.current.x)
      const height = Math.abs(currentY - originRef.current.y)

      const rect = { x, y, width, height }
      const selectedIds = rectsToSelection(rect)

      setState({ isActive: true, rect, selectedIds })
    }

    const onMouseUp = () => {
      if (!activeRef.current) return
      const didDrag = thresholdMetRef.current
      activeRef.current = false

      setState((prev) => {
        if (prev.isActive) {
          onSelectionChange(prev.selectedIds)
        } else if (!didDrag) {
          // Click without drag — clear selection
          onSelectionChange(new Set())
        }
        return { isActive: false, rect: null, selectedIds: new Set() }
      })
    }

    window.addEventListener("mousemove", onMouseMove)
    window.addEventListener("mouseup", onMouseUp)
    return () => {
      window.removeEventListener("mousemove", onMouseMove)
      window.removeEventListener("mouseup", onMouseUp)
    }
  }, [containerRef, threshold, rectsToSelection, onSelectionChange])

  return {
    /** Whether marquee is currently being drawn */
    isActive: state.isActive,
    /** The current marquee rectangle (container-scroll-relative coords) */
    rect: state.rect,
    /** IDs currently inside the marquee during drag */
    selectedIds: state.selectedIds,
    /** Attach to the container's onMouseDown */
    handleMouseDown,
  }
}
