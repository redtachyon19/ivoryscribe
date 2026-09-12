// Breathing room kept between a followed row and the edge of the scroll viewport.
export const PANEL_SCROLL_MARGIN = 24

export function findScrollParent(element: HTMLElement): HTMLElement | null {
  let node = element.parentElement
  while (node) {
    const overflowY = getComputedStyle(node).overflowY
    if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight) {
      return node
    }
    node = node.parentElement
  }
  return null
}

// Scrolled by hand rather than through scrollIntoView, which would also shift
// the rail's horizontal slide out from under the panel.
export function scrollRowIntoView(row: HTMLElement, behavior: ScrollBehavior = "auto") {
  const scroller = findScrollParent(row)
  if (!scroller) return

  const rowRect = row.getBoundingClientRect()
  const viewRect = scroller.getBoundingClientRect()
  let delta = 0
  if (rowRect.top < viewRect.top + PANEL_SCROLL_MARGIN) {
    delta = rowRect.top - viewRect.top - PANEL_SCROLL_MARGIN
  } else if (rowRect.bottom > viewRect.bottom - PANEL_SCROLL_MARGIN) {
    delta = rowRect.bottom - viewRect.bottom + PANEL_SCROLL_MARGIN
  }
  if (delta === 0) return

  scroller.scrollTo({ top: scroller.scrollTop + delta, behavior })
}
