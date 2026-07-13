import { useEffect, useRef, type RefObject } from "react"
import "./ScrollProgressBar.css"

/**
 * Where the bar reads its scroll position from.
 *
 * - `window` — the page itself scrolls (marketing pages).
 * - `container` — a nested scroller inside `containerRef`. Different children
 *   may scroll (the editor's typewriter / PDF / markdown panes), so a
 *   capture-phase listener catches scroll from whichever descendant moves;
 *   `resolvePrimary` picks the element to measure for the initial paint/resize.
 */
export type ScrollProgressSource =
  | { kind: "window" }
  | {
      kind: "container"
      containerRef: RefObject<HTMLElement | null>
      resolvePrimary: (container: HTMLElement) => HTMLElement
    }

type ScrollProgressBarProps = {
  source: ScrollProgressSource
  /** Extra class on the track (e.g. positioning tweaks per host). */
  className?: string
  /** Expose progressbar a11y semantics; otherwise the bar is decorative. */
  ariaProgress?: boolean
  ariaLabel?: string
  /** For `container` sources: re-subscribe when this changes (active doc/view). */
  revalidateKey?: string | number
}

/**
 * Accent reading-progress bar that fills left→right via scaleX as its source
 * scrolls. Shared by the web editor top bar and the marketing top bar so both
 * stay identical. rAF-throttled.
 */
export default function ScrollProgressBar({
  source,
  className,
  ariaProgress = false,
  ariaLabel = "Reading progress",
  revalidateKey,
}: ScrollProgressBarProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const barRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let frame = 0

    const applyRatio = (ratio: number) => {
      const bar = barRef.current
      if (bar) bar.style.transform = `scaleX(${ratio})`
      if (ariaProgress) trackRef.current?.setAttribute("aria-valuenow", String(Math.round(ratio * 100)))
    }

    const schedule = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        applyRatio(measure())
      })
    }

    let measure: () => number

    if (source.kind === "window") {
      measure = () => {
        const doc = document.documentElement
        const scrollable = doc.scrollHeight - doc.clientHeight
        return scrollable > 0 ? Math.min(1, Math.max(0, window.scrollY / scrollable)) : 0
      }
      applyRatio(measure())
      window.addEventListener("scroll", schedule, { passive: true })
      window.addEventListener("resize", schedule, { passive: true })
      return () => {
        if (frame) cancelAnimationFrame(frame)
        window.removeEventListener("scroll", schedule)
        window.removeEventListener("resize", schedule)
      }
    }

    const container = source.containerRef.current
    if (!container) return
    let activeScroller: HTMLElement = source.resolvePrimary(container)
    measure = () => {
      const total = activeScroller.scrollHeight - activeScroller.clientHeight
      return total <= 0 ? 0 : Math.min(1, Math.max(0, activeScroller.scrollTop / total))
    }
    // Scroll events don't bubble but do run through the capture phase, so one
    // capture listener catches scroll from whichever descendant actually moves.
    const onScrollCapture = (event: Event) => {
      if (event.target instanceof HTMLElement) activeScroller = event.target
      schedule()
    }
    applyRatio(measure())
    container.addEventListener("scroll", onScrollCapture, { capture: true, passive: true })
    window.addEventListener("resize", schedule)
    // Content height changes as you type / switch views / render PDF pages, so
    // observe the container (and the resolved scroller) to stay correct.
    const resizeObserver = new ResizeObserver(schedule)
    resizeObserver.observe(container)
    const primary = source.resolvePrimary(container)
    if (primary !== container) resizeObserver.observe(primary)
    return () => {
      if (frame) cancelAnimationFrame(frame)
      container.removeEventListener("scroll", onScrollCapture, { capture: true } as EventListenerOptions)
      window.removeEventListener("resize", schedule)
      resizeObserver.disconnect()
    }
    // resolvePrimary/containerRef are read fresh whenever revalidateKey changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source.kind, revalidateKey, ariaProgress])

  return (
    <div
      ref={trackRef}
      className={`scroll-progress${className ? ` ${className}` : ""}`}
      {...(ariaProgress
        ? { role: "progressbar", "aria-label": ariaLabel, "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": 0 }
        : { "aria-hidden": true })}
    >
      <div ref={barRef} className="scroll-progress__bar" />
    </div>
  )
}
