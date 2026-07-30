import { useLayoutEffect, useRef, useState, type CSSProperties } from "react"

type MarqueeTextProps = {
  text: string
}

export default function MarqueeText({ text }: MarqueeTextProps) {
  const viewportRef = useRef<HTMLSpanElement | null>(null)
  const textRef = useRef<HTMLSpanElement | null>(null)
  const [state, setState] = useState({ isOverflowing: false, loopDistance: 0 })

  useLayoutEffect(() => {
    const viewport = viewportRef.current
    const textEl = textRef.current

    if (!viewport || !textEl) {
      return
    }

    const measure = () => {
      const viewportWidth = viewport.clientWidth
      const textWidth = textEl.scrollWidth
      const nextIsOverflowing = textWidth > viewportWidth + 1
      const nextLoopDistance = nextIsOverflowing ? textWidth + 28 : 0

      setState((current) => {
        if (current.isOverflowing === nextIsOverflowing && current.loopDistance === nextLoopDistance) {
          return current
        }

        return { isOverflowing: nextIsOverflowing, loopDistance: nextLoopDistance }
      })
    }

    measure()

    const rafId = window.requestAnimationFrame(measure)
    const settleId = window.setTimeout(measure, 240)

    const resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null
    resizeObserver?.observe(viewport)
    resizeObserver?.observe(textEl)
    window.addEventListener("resize", measure)

    return () => {
      window.cancelAnimationFrame(rafId)
      window.clearTimeout(settleId)
      resizeObserver?.disconnect()
      window.removeEventListener("resize", measure)
    }
  }, [text])

  return (
    <span
      ref={viewportRef}
      className={`marquee-text ${state.isOverflowing ? "marquee-text--overflowing" : ""}`.trim()}
      style={
        state.isOverflowing
          ? ({ "--marquee-distance": `${state.loopDistance}px` } as CSSProperties)
          : undefined
      }
    >
      <span className="marquee-text__track">
        <span ref={textRef} className="marquee-text__item">{text}</span>
        {state.isOverflowing ? <span className="marquee-text__gap" aria-hidden="true" /> : null}
        {state.isOverflowing ? (
          <span className="marquee-text__item" aria-hidden="true">{text}</span>
        ) : null}
      </span>
    </span>
  )
}
