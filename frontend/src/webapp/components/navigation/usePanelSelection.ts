import { useCallback, useEffect, useRef } from "react"
import usePanelMarquee from "./usePanelMarquee"

// Shared selection model for the two navigation list panels (DocumentTabsPanel +
// ProjectBrowserPanel). Both render the same kind of draggable, marquee-
// selectable list with a sliding active-pill, so the click / shift-click /
// double-click / arrow-key / Delete selection behaviour lives here ONCE instead
// of being duplicated per panel. It composes usePanelMarquee (the rubber-band
// selection + the committed selection set) and adds:
//   • an anchor (fixed end of a shift-range) and a lead (the moving / keyboard
//     cursor),
//   • selectSingle / selectRange / armSelection for click, shift-click and
//     double-click,
//   • handleKeyDown for Up/Down (+Shift), Enter and Delete/Backspace, scoped to
//     the panel shell so it never reaches the editor or another panel,
//   • focus management (focus a row by data-selectable-id; focus the shell after
//     a marquee so the keyboard picks up where the drag ended).
// Panel-specific bits (the visible order, the active id, what "open" means, and
// what Delete trashes) are passed in.

type UsePanelSelectionOptions = {
  /** Visible item ids top-to-bottom, in render order (collapsed children
   *  excluded). Drives range selection and arrow navigation. */
  getOrderedIds: () => string[]
  /** The currently open/active item id, or null — the arrow start when nothing
   *  has been clicked yet. */
  getActiveId: () => string | null
  /** Open/activate an item (Enter, and plain arrows when `arrowActivates`).
   *  Panel-specific: open a tab, open a project, or toggle a folder. */
  onActivate: (id: string) => void
  /** Trash the current selection (Delete/Backspace while the selection is
   *  non-empty). Receives the live selection so the panel can decide what is
   *  actually deletable (e.g. projects but not folders). */
  onDelete: (selectedIds: Set<string>) => void
  /** When true (document tabs), a plain Up/Down OPENS the adjacent item (the
   *  white "current" pill follows) and drops the action-selection. When false
   *  (project browser), a plain arrow moves an accent selection cursor without
   *  opening — opening a project there would navigate away. */
  arrowActivates?: boolean
  /** All currently-valid selectable ids (visible AND collapsed). The hook prunes
   *  ids that vanish (item deleted / moved out) from the selection. Pass a
   *  memoized array so the prune only runs when the set actually changes. */
  allIds: string[]
  /** Forwarded to usePanelMarquee (e.g. to let a row-press start a native drag
   *  rather than a marquee). */
  marqueeIgnoreSelector?: string
}

export default function usePanelSelection({
  getOrderedIds,
  getActiveId,
  onActivate,
  onDelete,
  arrowActivates = false,
  allIds,
  marqueeIgnoreSelector,
}: UsePanelSelectionOptions) {
  const { marqueeContainerRef, marqueeSelectedIds, setMarqueeSelectedIds, marquee, liveSelectedIds } = usePanelMarquee(
    marqueeIgnoreSelector ? { ignoreSelector: marqueeIgnoreSelector } : {},
  )

  // `anchor` = fixed end of a shift-range; `lead` = the moving end / keyboard
  // cursor. Refs, not state — they steer selection but don't paint.
  const anchorRef = useRef<string | null>(null)
  const leadRef = useRef<string | null>(null)

  // Latest callbacks in a ref so the handlers/effect read current closures
  // without churning their own identity when the panel passes fresh inline
  // arrows each render. Updated in an effect (not during render) so a ref is
  // never written mid-render; the handlers only fire post-commit, so they always
  // see the latest.
  const cbsRef = useRef({ getOrderedIds, getActiveId, onActivate, onDelete })
  useEffect(() => {
    cbsRef.current = { getOrderedIds, getActiveId, onActivate, onDelete }
  }, [getOrderedIds, getActiveId, onActivate, onDelete])

  const focusItem = useCallback(
    (id: string) => {
      const container = marqueeContainerRef.current
      const node = container?.querySelector<HTMLElement>(`[data-selectable-id="${CSS.escape(id)}"]`)
      if (!node) return
      const focusable = node.matches("button, [tabindex]")
        ? node
        : node.querySelector<HTMLElement>("button, [tabindex], a")
      focusable?.focus({ preventScroll: true })
    },
    [marqueeContainerRef],
  )

  // Plain click: navigate only — clear the action-selection and set the anchor
  // for a following shift-range. The panel opens/toggles the item itself.
  const selectSingle = useCallback(
    (id: string) => {
      anchorRef.current = id
      leadRef.current = id
      setMarqueeSelectedIds(new Set())
    },
    [setMarqueeSelectedIds],
  )

  // Shift-click: range-select from the anchor to `id` in visible order.
  const selectRange = useCallback(
    (id: string) => {
      const order = cbsRef.current.getOrderedIds()
      const anchorIndex = anchorRef.current ? order.indexOf(anchorRef.current) : -1
      const targetIndex = order.indexOf(id)
      if (anchorIndex === -1 || targetIndex === -1) {
        anchorRef.current = id
        leadRef.current = id
        setMarqueeSelectedIds(new Set([id]))
        return
      }
      const [lo, hi] = anchorIndex <= targetIndex ? [anchorIndex, targetIndex] : [targetIndex, anchorIndex]
      leadRef.current = id
      setMarqueeSelectedIds(new Set(order.slice(lo, hi + 1)))
    },
    [setMarqueeSelectedIds],
  )

  // Double-click: arm a single item as the action selection (accent).
  const armSelection = useCallback(
    (id: string) => {
      anchorRef.current = id
      leadRef.current = id
      setMarqueeSelectedIds(new Set([id]))
    },
    [setMarqueeSelectedIds],
  )

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLElement>) => {
      const target = event.target as HTMLElement
      // Let the rename input own its keys (Delete, arrows, Enter, Escape).
      if (target.closest("input, textarea")) return

      if (event.key === "Delete" || event.key === "Backspace") {
        if (marqueeSelectedIds.size === 0) return
        event.preventDefault()
        cbsRef.current.onDelete(marqueeSelectedIds)
        return
      }

      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        const order = cbsRef.current.getOrderedIds()
        if (order.length === 0) return
        event.preventDefault()

        const lead = leadRef.current ?? cbsRef.current.getActiveId()
        const leadIndex = lead ? order.indexOf(lead) : -1
        const step = event.key === "ArrowDown" ? 1 : -1
        const nextIndex =
          leadIndex === -1
            ? event.key === "ArrowDown"
              ? 0
              : order.length - 1
            : Math.min(order.length - 1, Math.max(0, leadIndex + step))
        const nextId = order[nextIndex]
        if (!nextId) return

        if (event.shiftKey) {
          let anchorIndex = anchorRef.current ? order.indexOf(anchorRef.current) : -1
          if (anchorIndex === -1) {
            anchorIndex = leadIndex === -1 ? nextIndex : leadIndex
            anchorRef.current = order[anchorIndex] ?? nextId
          }
          const [lo, hi] = anchorIndex <= nextIndex ? [anchorIndex, nextIndex] : [nextIndex, anchorIndex]
          setMarqueeSelectedIds(new Set(order.slice(lo, hi + 1)))
        } else if (arrowActivates) {
          // Navigate: open the adjacent item (white pill), drop the selection.
          anchorRef.current = nextId
          setMarqueeSelectedIds(new Set())
          cbsRef.current.onActivate(nextId)
        } else {
          // Move an accent selection cursor without opening.
          anchorRef.current = nextId
          setMarqueeSelectedIds(new Set([nextId]))
        }

        leadRef.current = nextId
        focusItem(nextId)
        return
      }

      if (event.key === "Enter") {
        const lead = leadRef.current
        if (!lead) return
        event.preventDefault()
        anchorRef.current = lead
        setMarqueeSelectedIds(new Set())
        cbsRef.current.onActivate(lead)
      }
    },
    [arrowActivates, focusItem, marqueeSelectedIds, setMarqueeSelectedIds],
  )

  // Drop ids that no longer exist (item deleted, moved out, collapsed away) from
  // the selection, so a stale id can't linger or be re-selected.
  useEffect(() => {
    const valid = new Set(allIds)
    setMarqueeSelectedIds((current) => {
      if (current.size === 0) return current
      let changed = false
      const next = new Set<string>()
      for (const id of current) {
        if (valid.has(id)) next.add(id)
        else changed = true
      }
      return changed ? next : current
    })
  }, [allIds, setMarqueeSelectedIds])

  // After a marquee settles, pull focus into the panel and seed anchor/lead from
  // the selection so Delete / Shift+Arrow continue from where the drag ended.
  const wasMarqueeActiveRef = useRef(false)
  useEffect(() => {
    const wasActive = wasMarqueeActiveRef.current
    wasMarqueeActiveRef.current = marquee.isActive
    if (!wasActive || marquee.isActive || marqueeSelectedIds.size === 0) return

    const order = cbsRef.current.getOrderedIds()
    const selectedInOrder = order.filter((id) => marqueeSelectedIds.has(id))
    if (selectedInOrder.length === 0) return

    anchorRef.current = selectedInOrder[0]
    leadRef.current = selectedInOrder[selectedInOrder.length - 1]
    marqueeContainerRef.current?.focus({ preventScroll: true })
  }, [marquee.isActive, marqueeContainerRef, marqueeSelectedIds])

  return {
    // Pass through usePanelMarquee under the same names so the panels rewire
    // minimally.
    marqueeContainerRef,
    marqueeSelectedIds,
    setMarqueeSelectedIds,
    liveSelectedIds,
    marquee,
    // Selection gestures.
    selectSingle,
    selectRange,
    armSelection,
    handleKeyDown,
  }
}
