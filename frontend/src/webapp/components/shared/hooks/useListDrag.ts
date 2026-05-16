import { useState, type DragEvent } from "react"

export type DropMode = "before" | "after" | "inside"

export type DropTarget = {
  targetId: string
  mode: DropMode
} | null

// Converts pointer position into drop mode (top/bottom edges vs center-inside).
export function getDropMode(event: DragEvent<HTMLElement>): DropMode {
  const rect = event.currentTarget.getBoundingClientRect()
  const topThreshold = rect.top + rect.height * 0.33
  const bottomThreshold = rect.top + rect.height * 0.67

  if (event.clientY <= topThreshold) {
    return "before"
  }

  if (event.clientY >= bottomThreshold) {
    return "after"
  }

  return "inside"
}

// Flat-only variant: only supports before/after, not inside.
export function getDropModeFlatOnly(event: DragEvent<HTMLElement>): DropMode {
  const rect = event.currentTarget.getBoundingClientRect()
  const midpoint = rect.top + rect.height * 0.5

  return event.clientY <= midpoint ? "before" : "after"
}

type UseListDragOptions = {
  /** When true, only "before"/"after" drop modes are used (no "inside"). */
  flatOnly?: boolean
}

export function useListDrag(options: UseListDragOptions = {}) {
  const { flatOnly = false } = options
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget>(null)

  const resolveDropMode = flatOnly ? getDropModeFlatOnly : getDropMode

  const handleDragStart = (event: DragEvent<HTMLButtonElement>, id: string, editingId?: string | null) => {
    if (editingId) {
      event.preventDefault()
      return
    }

    event.dataTransfer.effectAllowed = "move"
    event.dataTransfer.setData("text/plain", id)
    setDraggingId(id)
  }

  const handleDragEnd = () => {
    setDraggingId(null)
    setDropTarget(null)
  }

  const handleRowDragOver = (event: DragEvent<HTMLElement>, targetId: string) => {
    event.preventDefault()
    event.stopPropagation()
    const mode = resolveDropMode(event)
    setDropTarget({ targetId, mode })
  }

  const handleRowDrop = (event: DragEvent<HTMLElement>, targetId: string) => {
    event.preventDefault()
    event.stopPropagation()
    const mode = dropTarget?.targetId === targetId ? dropTarget.mode : resolveDropMode(event)
    return { targetId, mode }
  }

  const createRootListHandlers = (
    itemIds: string[],
    itemClassName: string,
  ) => {
    const onDragOver = (event: DragEvent<HTMLUListElement>) => {
      if (!draggingId || itemIds.length === 0) return

      event.preventDefault()
      const targetElement = event.target as HTMLElement | null
      if (targetElement?.closest(`.${itemClassName}`)) return

      const firstId = itemIds[0]
      const lastId = itemIds[itemIds.length - 1]
      if (!firstId || !lastId) return

      const listRect = event.currentTarget.getBoundingClientRect()
      const relativeY = event.clientY - listRect.top
      const isTopZone = relativeY < listRect.height * 0.5

      setDropTarget({
        targetId: isTopZone ? firstId : lastId,
        mode: isTopZone ? "before" : "after",
      })
    }

    const onDrop = (event: DragEvent<HTMLUListElement>) => {
      if (!draggingId || !dropTarget) return null

      event.preventDefault()
      const result = { sourceId: draggingId, targetId: dropTarget.targetId, mode: dropTarget.mode }
      setDraggingId(null)
      setDropTarget(null)
      return result
    }

    return { onDragOver, onDrop }
  }

  return {
    draggingId,
    dropTarget,
    setDraggingId,
    setDropTarget,
    handleDragStart,
    handleDragEnd,
    handleRowDragOver,
    handleRowDrop,
    createRootListHandlers,
  }
}
