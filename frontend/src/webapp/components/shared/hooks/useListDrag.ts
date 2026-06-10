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

// Map a pointer Y in a list's DEAD SPACE (the flex gaps + the invisible
// drop-line strips between rows, where no row's own dragover fires) to the
// nearest reorder boundary. This makes the whole band between two rows resolve
// to "between those two" instead of snapping to the list's first/last row.
// Rows are found via [data-selectable-id]; DOM order == visual top-to-bottom.
export function nearestRowBoundary(listEl: HTMLElement, clientY: number): DropTarget {
  const entries = Array.from(listEl.querySelectorAll<HTMLElement>("[data-selectable-id]"))
    .map((el) => {
      const id = el.getAttribute("data-selectable-id")
      if (!id) return null
      const rect = el.getBoundingClientRect()
      return { id, top: rect.top, bottom: rect.bottom, mid: rect.top + rect.height / 2 }
    })
    .filter((entry): entry is { id: string; top: number; bottom: number; mid: number } => entry !== null)

  if (entries.length === 0) return null

  const first = entries[0]
  if (clientY < first.mid) return { targetId: first.id, mode: "before" }

  const last = entries[entries.length - 1]
  if (clientY >= last.mid) return { targetId: last.id, mode: "after" }

  for (let i = 0; i < entries.length - 1; i += 1) {
    const above = entries[i]
    const below = entries[i + 1]
    if (clientY >= above.mid && clientY < below.mid) {
      // Both sides render the same centered line; pick the nearer one so the
      // committed insertion lands on the visually-closer side.
      const gapMid = (above.bottom + below.top) / 2
      return clientY < gapMid ? { targetId: above.id, mode: "after" } : { targetId: below.id, mode: "before" }
    }
  }

  return { targetId: last.id, mode: "after" }
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

    // Build the drag image from the whole row, not the default (the draggable
    // element is the flex:1 label, which is narrower than the row and clips its
    // right side). The live row has a transparent background, so a raw snapshot
    // looks hollow — clone it off-screen with a solid palette-background fill
    // (+ accent outline) so the dragged tile reads as a solid card. The clone
    // is a sibling of the row so the palette CSS variables still resolve.
    const row = (event.currentTarget as HTMLElement | null)?.closest<HTMLElement>("[data-selectable-id]")
    if (row && row.parentElement) {
      const rect = row.getBoundingClientRect()
      const ghost = row.cloneNode(true) as HTMLElement
      ghost.style.cssText =
        `position:fixed;left:-10000px;top:0;width:${rect.width}px;margin:0;pointer-events:none;` +
        `background:var(--app-bg, #1e1e1e);` +
        `box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--app-accent, #9ab8ff) 60%, transparent);`
      row.parentElement.appendChild(ghost)
      event.dataTransfer.setDragImage(ghost, event.clientX - rect.left, event.clientY - rect.top)
      window.setTimeout(() => ghost.remove(), 0)
    }

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

  const createRootListHandlers = (itemIds: string[]) => {
    const onDragOver = (event: DragEvent<HTMLUListElement>) => {
      if (!draggingId || itemIds.length === 0) return

      event.preventDefault()
      // This list owns the active drag, so claim the event before the panel's
      // container-level dead-space clear can wipe a highlight a child just set.
      event.stopPropagation()

      // Rows stopPropagation, so we only reach here over the dead space between
      // rows (the flex gap + the invisible drop-line strips). Resolve the cursor
      // to the nearest row boundary so the between-rows indicator stays lit
      // across that whole band, instead of snapping to the first/last row.
      const boundary = nearestRowBoundary(event.currentTarget, event.clientY)
      if (boundary) setDropTarget(boundary)
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
    // Null this hook's reorder/inside highlight. Used by the panel's
    // container-level dead-space clear so the accent only ever marks the one
    // live target. Additive: existing consumers (DocumentTabsPanel) ignore it.
    clearDropTarget: () => setDropTarget(null),
    handleDragStart,
    handleDragEnd,
    handleRowDragOver,
    handleRowDrop,
    createRootListHandlers,
  }
}
