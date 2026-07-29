import { FONT_OPTIONS as APP_FONT_OPTIONS } from "../../../../core/utils/appearance"

export const FONT_OPTIONS = APP_FONT_OPTIONS
export const DEFAULT_FONT_FAMILY = APP_FONT_OPTIONS[0]?.value ?? '"Times", "Times New Roman", serif'

export const DEFAULT_FONT_SIZE_PT = 11
export const DEFAULT_FONT_SIZE_PX = ptToPx(DEFAULT_FONT_SIZE_PT)

export const DEFAULT_LINE_HEIGHT = 1.15

export const FONT_SIZE_PRESETS = [8, 9, 10, 11, 12, 14, 16, 18, 24, 30, 36, 48, 60, 72, 96]

export function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v))
}

export function ptToPx(pt: number) {
  return (pt * 96) / 72
}

export function pxToPt(px: number) {
  return (px * 72) / 96
}

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
  }
}
