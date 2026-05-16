// Typewriter font + persisted-preference helpers. Margins live in
// typewriterMargins.ts; this file holds the typography defaults, font-size
// presets, the pt↔px conversions used by the toolbar, and the two
// global-to-the-user UI toggles (rulers on/off, toolbar on/off).

import { FONT_OPTIONS as APP_FONT_OPTIONS } from "../../../../core/utils/appearance"

export const FONT_OPTIONS = APP_FONT_OPTIONS
export const DEFAULT_FONT_FAMILY = APP_FONT_OPTIONS[0]?.value ?? '"Times", "Times New Roman", serif'

// User-facing default in points (Google Docs default). The toolbar surfaces pt
// while the document stores px on the textStyle mark.
export const DEFAULT_FONT_SIZE_PT = 11
export const DEFAULT_FONT_SIZE_PX = ptToPx(DEFAULT_FONT_SIZE_PT)

// Google Docs "Single" line spacing — used both in the editor's inline style
// and in the Cmd+Enter line-fill heuristic.
export const DEFAULT_LINE_HEIGHT = 1.15

// Google Docs' actual font-size dropdown values, in points.
export const FONT_SIZE_PRESETS = [8, 9, 10, 11, 12, 14, 16, 18, 24, 30, 36, 48, 60, 72, 96]

export function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v))
}

// 1pt = 96/72 px at 96 DPI. Kept as floats — fractional CSS pixels render
// fine and rounding accumulates visible drift.
export function ptToPx(pt: number) {
  return (pt * 96) / 72
}

export function pxToPt(px: number) {
  return (px * 72) / 96
}

// Persisted UI toggles — applied to every typewriter document across tabs and
// projects. Default to OFF so the writing surface is uncluttered until the
// user opts in.
export const SHOW_RULERS_KEY = "ivoryscribe:typewriter-show-rulers"
export const SHOW_TOOLBAR_KEY = "ivoryscribe:typewriter-show-toolbar"

export function loadBoolPref(key: string): boolean {
  if (typeof window === "undefined") return false
  try {
    return window.localStorage.getItem(key) === "true"
  } catch {
    return false
  }
}

export function saveBoolPref(key: string, value: boolean) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(key, String(value))
  } catch {
    /* ignore */
  }
}
