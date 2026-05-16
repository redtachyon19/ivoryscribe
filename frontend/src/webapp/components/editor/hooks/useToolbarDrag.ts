// Generic toolbar drag — shared by TypewriterEditor and PinboardEditor.
//
// Hand a ref to the toolbar element back to the caller and return:
//   • `toolbarPos` — current `{x, y}` once the user has dragged (null otherwise)
//   • `isDragging` — true during an active drag (toolbar styles a dragging cursor)
//   • `onGripMouseDown` — handler to bind to the toolbar's grip element
//
// The default coordinate system is viewport-relative (works with
// `position: fixed`). Pass `useParentRelativeCoords: true` for toolbars
// positioned with `position: absolute` inside a relative parent (pinboard
// case — the toolbar lives inside the canvas container).

import { useCallback, useEffect, useRef, useState } from "react"

type ToolbarDragStart = { x: number; y: number; ox: number; oy: number }

type UseToolbarDragOptions = {
  useParentRelativeCoords?: boolean
}

export function useToolbarDrag<T extends HTMLElement = HTMLDivElement>(
  options?: UseToolbarDragOptions,
) {
  const toolbarRef = useRef<T | null>(null)
  const [toolbarPos, setToolbarPos] = useState<{ x: number; y: number } | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const dragStart = useRef<ToolbarDragStart>({ x: 0, y: 0, ox: 0, oy: 0 })
  const useParentRelativeCoords = options?.useParentRelativeCoords ?? false

  const onGripMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const rect = toolbarRef.current?.getBoundingClientRect()
    if (!rect) return

    let ox = rect.left
    let oy = rect.top
    if (useParentRelativeCoords) {
      const parentRect = toolbarRef.current?.parentElement?.getBoundingClientRect()
      if (!parentRect) return
      ox = rect.left - parentRect.left
      oy = rect.top - parentRect.top
    }

    setIsDragging(true)
    dragStart.current = { x: e.clientX, y: e.clientY, ox, oy }
  }, [useParentRelativeCoords])

  useEffect(() => {
    if (!isDragging) return
    const onMove = (e: MouseEvent) => {
      const s = dragStart.current
      setToolbarPos({ x: s.ox + (e.clientX - s.x), y: s.oy + (e.clientY - s.y) })
    }
    const onUp = () => setIsDragging(false)
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
    return () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }
  }, [isDragging])

  return { toolbarRef, toolbarPos, isDragging, onGripMouseDown }
}
