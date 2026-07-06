// Typewriter page geometry.
//
// All measurements are in pixels @ 96 DPI unless otherwise noted. Margins are
// kept in inches (user-facing values from the ruler) and converted at render
// time via `inToPx`.
//
// Margins themselves live inside the Project (see `core/utils/projects.ts`'s
// `marginsById`, `getTabMargins`, and `setTabMarginsById`), so they round-trip
// through the .tusk file on disk and through cloud sync. This module keeps only
// the pure geometry helpers; it no longer touches local storage.

export type { Margins } from "../../../../core/utils/projects"
export { DEFAULT_MARGINS } from "../../../../core/utils/projects"

export const PAGE_W_PX = 816  // 8.5in × 96 dpi
export const PAGE_H_PX = 1056 // 11in  × 96 dpi
export const PAGE_GAP_PX = 40

export const MIN_MARGIN_IN = 0.25
export const MAX_MARGIN_IN = 3.0

export function inToPx(inches: number) {
  return Math.round(inches * 96)
}
