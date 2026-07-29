import { useCallback, useEffect, useRef } from "react"
import usePanelMarquee from "./usePanelMarquee"

type UsePanelSelectionOptions = {
  getOrderedIds: () => string[]
  getActiveId: () => string | null
  onActivate: (id: string) => void
  onDelete: (selectedIds: Set<string>) => void
  arrowActivates?: boolean
  allIds: string[]
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

  const anchorRef = useRef<string | null>(null)
  const leadRef = useRef<string | null>(null)

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

  const selectSingle = useCallback(
    (id: string) => {
      anchorRef.current = id
      leadRef.current = id
      setMarqueeSelectedIds(new Set())
    },
    [setMarqueeSelectedIds],
  )

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
          anchorRef.current = nextId
          setMarqueeSelectedIds(new Set())
          cbsRef.current.onActivate(nextId)
        } else {
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
    marqueeContainerRef,
    marqueeSelectedIds,
    setMarqueeSelectedIds,
    liveSelectedIds,
    marquee,
    selectSingle,
    selectRange,
    armSelection,
    handleKeyDown,
  }
}
