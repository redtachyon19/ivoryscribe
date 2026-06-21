// Typewriter page geometry + margin persistence.
//
// All measurements are in pixels @ 96 DPI unless otherwise noted. Margins are
// kept in inches (user-facing values from the ruler) and converted at render
// time via `inToPx`.

export const PAGE_W_PX = 816  // 8.5in × 96 dpi
export const PAGE_H_PX = 1056 // 11in  × 96 dpi
export const PAGE_GAP_PX = 40

export const MIN_MARGIN_IN = 0.25
export const MAX_MARGIN_IN = 3.0

const STORAGE_KEY = "ivoryscribe:typewriter-margins:"

export type Margins = { top: number; bottom: number; left: number; right: number }

export const DEFAULT_MARGINS: Margins = { top: 1, bottom: 1, left: 1, right: 1 }

export function inToPx(inches: number) {
  return Math.round(inches * 96)
}

export function loadMargins(id: string | null): Margins {
  if (!id) return DEFAULT_MARGINS
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}${id}`)
    if (!raw) return DEFAULT_MARGINS
    const p = JSON.parse(raw) as Partial<Margins>
    return {
      top:    typeof p.top    === "number" ? p.top    : DEFAULT_MARGINS.top,
      bottom: typeof p.bottom === "number" ? p.bottom : DEFAULT_MARGINS.bottom,
      left:   typeof p.left   === "number" ? p.left   : DEFAULT_MARGINS.left,
      right:  typeof p.right  === "number" ? p.right  : DEFAULT_MARGINS.right,
    }
  } catch {
    return DEFAULT_MARGINS
  }
}

export function saveMargins(id: string | null, m: Margins) {
  if (!id) return
  try {
    localStorage.setItem(`${STORAGE_KEY}${id}`, JSON.stringify(m))
  } catch {
    /* localStorage write failure is non-fatal */
  }
}
