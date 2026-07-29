import { useCallback, useEffect, useRef, useState } from "react"

type Rect = { x: number; y: number; width: number; height: number }

type MarqueeState = {
  isActive: boolean
  rect: Rect | null
  selectedIds: Set<string>
}

type UseMarqueeSelectionOptions = {
  getItemRects: () => Map<string, DOMRect>
  containerRef: React.RefObject<HTMLElement | null>
  onSelectionChange: (ids: Set<string>) => void
  threshold?: number
  ignoreSelector?: string
}

const DEFAULT_IGNORE_SELECTOR = "button, input, textarea, select, a, [draggable='true'], li, article"

export default function useMarqueeSelection({
  getItemRects,
  containerRef,
  onSelectionChange,
  threshold = 5,
  ignoreSelector = DEFAULT_IGNORE_SELECTOR,
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

      const mx1 = marqueeRect.x
      const my1 = marqueeRect.y
      const mx2 = mx1 + marqueeRect.width
      const my2 = my1 + marqueeRect.height

      for (const [id, domRect] of items) {
        const ix1 = domRect.left - containerRect.left + scrollLeft
        const iy1 = domRect.top - containerRect.top + scrollTop
        const ix2 = ix1 + domRect.width
        const iy2 = iy1 + domRect.height

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
      if (e.button !== 0) return
      const target = e.target as HTMLElement
      if (target.closest(ignoreSelector)) return

      const container = containerRef.current
      if (!container) return

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
    [containerRef, ignoreSelector],
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
    isActive: state.isActive,
    rect: state.rect,
    selectedIds: state.selectedIds,
    handleMouseDown,
  }
}
