// A swatch button that opens the in-app ColorPicker in a portaled popover.
// Reusable click-to-pick control (settings, etc.) — same picker as the
// typewriter toolbar's "Custom…" option, with the same dismiss behaviour.

import { useEffect, useRef, useState, type CSSProperties } from "react"
import { createPortal } from "react-dom"
import { ColorPicker } from "./ColorPicker"

type ColorPickerButtonProps = {
  value: string
  onChange: (hex: string) => void
  ariaLabel?: string
  id?: string
}

export function ColorPickerButton({ value, onChange, ariaLabel, id }: ColorPickerButtonProps) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement | null>(null)
  const popRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onMouseDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (!btnRef.current?.contains(t) && !popRef.current?.contains(t)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    // Defer arming the outside-click listener so the click that opens the
    // popover doesn't immediately dismiss it.
    let attached = false
    const armId = window.setTimeout(() => {
      attached = true
      document.addEventListener("mousedown", onMouseDown)
    }, 0)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      window.clearTimeout(armId)
      if (attached) document.removeEventListener("mousedown", onMouseDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [open])

  const rect = open ? btnRef.current?.getBoundingClientRect() : undefined
  // Open below the swatch, left-aligned; clamp so a 200px picker stays on screen.
  const popStyle: CSSProperties = rect
    ? {
        position: "fixed",
        left: Math.min(rect.left, (typeof window !== "undefined" ? window.innerWidth : 9999) - 232),
        top: rect.bottom + 6,
        zIndex: 4000,
      }
    : { display: "none" }

  return (
    <>
      <button
        ref={btnRef}
        id={id}
        type="button"
        className="color-swatch-btn"
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="color-swatch-btn__fill" style={{ background: value }} aria-hidden="true" />
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div ref={popRef} className="tw-colorpicker-popover" style={popStyle} role="dialog" aria-label={ariaLabel}>
              <ColorPicker value={value} onChange={onChange} />
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
