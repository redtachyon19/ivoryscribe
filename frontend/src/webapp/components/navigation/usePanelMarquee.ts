import { useCallback, useEffect, useRef, useState } from "react"
import useMarqueeSelection from "../shared/hooks/useMarqueeSelection"

type UsePanelMarqueeOptions = {
  /** Forwarded to useMarqueeSelection — see its `ignoreSelector`. Panels
   *  whose rows are themselves the selectable items (so a press on a row
   *  should start a marquee, not bail) pass a narrower selector. */
  ignoreSelector?: string
}

/**
 * Shared marquee selection setup used by navigation panel components.
 * Encapsulates the container ref, getItemRects helper, useMarqueeSelection wiring,
 * and the liveSelectedIds computation that is identical in both panels.
 */
export default function usePanelMarquee(options: UsePanelMarqueeOptions = {}) {
  const marqueeContainerRef = useRef<HTMLDivElement | null>(null)
  const [marqueeSelectedIds, setMarqueeSelectedIds] = useState<Set<string>>(new Set())

  const getItemRects = useCallback(() => {
    const map = new Map<string, DOMRect>()
    const container = marqueeContainerRef.current
    if (!container) return map

    for (const element of container.querySelectorAll("[data-selectable-id]")) {
      const id = element.getAttribute("data-selectable-id")
      if (id) map.set(id, element.getBoundingClientRect())
    }

    return map
  }, [])

  const marquee = useMarqueeSelection({
    getItemRects,
    containerRef: marqueeContainerRef,
    onSelectionChange: setMarqueeSelectedIds,
    ignoreSelector: options.ignoreSelector,
  })

  const liveSelectedIds = marquee.isActive ? marquee.selectedIds : marqueeSelectedIds

  // Escape clears the current selection (consistent with text deselection).
  // Skip while editing a field (rename, etc.) — Escape means "cancel edit"
  // there — and only act when something is actually selected.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return
      const active = document.activeElement as HTMLElement | null
      if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.isContentEditable)) return
      setMarqueeSelectedIds((current) => (current.size > 0 ? new Set() : current))
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [])

  return { marqueeContainerRef, marqueeSelectedIds, setMarqueeSelectedIds, marquee, liveSelectedIds }
}
