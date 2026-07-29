import { useCallback, useEffect, useRef, useState } from "react"
import useMarqueeSelection from "../shared/hooks/useMarqueeSelection"

type UsePanelMarqueeOptions = {
  ignoreSelector?: string
}

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

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0 || e.shiftKey || e.metaKey || e.ctrlKey) return
      const container = marqueeContainerRef.current
      const target = e.target instanceof Element ? e.target : null
      if (!container || !target) return
      if (container.contains(target)) return
      if (target.closest('[role="menu"], [role="menuitem"], [role="dialog"], .project-context-menu')) return
      setMarqueeSelectedIds((current) => (current.size > 0 ? new Set() : current))
    }
    document.addEventListener("mousedown", onMouseDown, true)
    return () => document.removeEventListener("mousedown", onMouseDown, true)
  }, [])

  return { marqueeContainerRef, marqueeSelectedIds, setMarqueeSelectedIds, marquee, liveSelectedIds }
}
