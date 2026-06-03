import { useCallback, useRef, useState } from "react"
import useMarqueeSelection from "../shared/hooks/useMarqueeSelection"

type UsePanelMarqueeOptions = {
  /** Forwarded to useMarqueeSelection — see its `ignoreSelector`. Both nav
   *  panels rely on the default (which bails on rows / `li` / draggable
   *  buttons), so a press on a row starts its native drag and only a press in
   *  the gaps / empty list space starts a marquee. */
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

  return { marqueeContainerRef, marqueeSelectedIds, setMarqueeSelectedIds, marquee, liveSelectedIds }
}
