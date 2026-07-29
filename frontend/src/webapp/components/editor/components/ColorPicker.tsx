import { useCallback, useRef, useState } from "react"
import "./ColorPicker.css"

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n))
}

function hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
  const c = v * s
  const hp = ((h % 360) + 360) % 360 / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  let r = 0
  let g = 0
  let b = 0
  if (hp < 1) { r = c; g = x }
  else if (hp < 2) { r = x; g = c }
  else if (hp < 3) { g = c; b = x }
  else if (hp < 4) { g = x; b = c }
  else if (hp < 5) { r = x; b = c }
  else { r = c; b = x }
  const m = v - c
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  }
}

function hsvToHex(h: number, s: number, v: number): string {
  const { r, g, b } = hsvToRgb(h, s, v)
  const hex = (n: number) => n.toString(16).padStart(2, "0")
  return `#${hex(r)}${hex(g)}${hex(b)}`
}

function hexToHsv(hex: string): { h: number; s: number; v: number } | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  let str = m[1]
  if (str.length === 3) str = str.split("").map((c) => c + c).join("")
  const r = parseInt(str.slice(0, 2), 16) / 255
  const g = parseInt(str.slice(2, 4), 16) / 255
  const b = parseInt(str.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  return { h, s: max === 0 ? 0 : d / max, v: max }
}

type ColorPickerProps = {
  value: string
  onChange: (hex: string) => void
}

export function ColorPicker({ value, onChange }: ColorPickerProps) {
  const initial = hexToHsv(value) ?? { h: 0, s: 0, v: 0 }
  const [h, setH] = useState(initial.h)
  const [s, setS] = useState(initial.s)
  const [v, setV] = useState(initial.v)
  const [hexText, setHexText] = useState(value)

  const svRef = useRef<HTMLDivElement | null>(null)
  const hueRef = useRef<HTMLDivElement | null>(null)

  const emit = useCallback(
    (nh: number, ns: number, nv: number) => {
      const hex = hsvToHex(nh, ns, nv)
      setHexText(hex)
      onChange(hex)
    },
    [onChange],
  )

  const startDrag = (move: (clientX: number, clientY: number) => void) =>
    (e: React.PointerEvent) => {
      e.preventDefault()
      move(e.clientX, e.clientY)
      const onMove = (ev: PointerEvent) => move(ev.clientX, ev.clientY)
      const onUp = () => {
        window.removeEventListener("pointermove", onMove)
        window.removeEventListener("pointerup", onUp)
      }
      window.addEventListener("pointermove", onMove)
      window.addEventListener("pointerup", onUp)
    }

  const handleSv = (clientX: number, clientY: number) => {
    const el = svRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const ns = clamp01((clientX - r.left) / r.width)
    const nv = 1 - clamp01((clientY - r.top) / r.height)
    setS(ns)
    setV(nv)
    emit(h, ns, nv)
  }

  const handleHue = (clientX: number) => {
    const el = hueRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const nh = clamp01((clientX - r.left) / r.width) * 360
    setH(nh)
    emit(nh, s, v)
  }

  const currentHex = hsvToHex(h, s, v)
  const hueHex = hsvToHex(h, 1, 1)

  return (
    <div className="tw-colorpicker">
      <div
        ref={svRef}
        className="tw-colorpicker__sv"
        style={{
          background: `linear-gradient(to top, #000, rgba(0,0,0,0)), linear-gradient(to right, #fff, rgba(255,255,255,0)), ${hueHex}`,
        }}
        onPointerDown={startDrag((x, y) => handleSv(x, y))}
        role="slider"
        aria-label="Saturation and brightness"
      >
        <span
          className="tw-colorpicker__sv-thumb"
          style={{ left: `${s * 100}%`, top: `${(1 - v) * 100}%`, background: currentHex }}
        />
      </div>

      <div
        ref={hueRef}
        className="tw-colorpicker__hue"
        onPointerDown={startDrag((x) => handleHue(x))}
        role="slider"
        aria-label="Hue"
      >
        <span className="tw-colorpicker__hue-thumb" style={{ left: `${(h / 360) * 100}%` }} />
      </div>

      <div className="tw-colorpicker__row">
        <span className="tw-colorpicker__preview" style={{ background: currentHex }} aria-hidden="true" />
        <input
          className="tw-colorpicker__hex"
          value={hexText}
          spellCheck={false}
          aria-label="Hex colour value"
          onChange={(e) => {
            const next = e.target.value
            setHexText(next)
            const parsed = hexToHsv(next)
            if (parsed) {
              setH(parsed.h)
              setS(parsed.s)
              setV(parsed.v)
              onChange(hsvToHex(parsed.h, parsed.s, parsed.v))
            }
          }}
        />
      </div>
    </div>
  )
}
