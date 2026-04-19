export const DEFAULT_DISPLAY_FONT = '"EB Garamond", serif'
export const DEFAULT_BODY_FONT = '"Times", "Times New Roman", serif'
export const DEFAULT_UI_FONT = '"Lato", sans-serif'
export const EMOJI_FONT_FALLBACK = '"Noto Emoji", "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", sans-serif'

export function withEmojiFontFallback(fontFamily: string) {
  const trimmed = fontFamily.trim()
  if (!trimmed) {
    return EMOJI_FONT_FALLBACK
  }

  if (/(noto emoji|--app-emoji-font)/i.test(trimmed)) {
    return trimmed
  }

  return `${trimmed}, ${EMOJI_FONT_FALLBACK}`
}

export const FONT_OPTIONS = [
  { label: "Times (Default)", value: '"Times", "Times New Roman", serif' },
  { label: "Times New Roman", value: '"Times New Roman", serif' },
  { label: "Roboto Mono", value: '"Roboto Mono", monospace' },
  { label: "Cabin", value: '"Cabin", sans-serif' },
  { label: "Google Sans Flex", value: '"Google Sans Flex", sans-serif' },
  { label: "Inter", value: '"Inter", sans-serif' },
  { label: "Lato", value: '"Lato", sans-serif' },
  { label: "Noto Sans", value: '"Noto Sans", sans-serif' },
  { label: "Arial", value: "Arial, sans-serif" },
  { label: "Courier", value: '"Courier New", Courier, monospace' },
  { label: "EB Garamond", value: '"EB Garamond", serif' },
  { label: "Montserrat", value: '"Montserrat", sans-serif' },
] as const

export type Palette = "ivory" | "elephant" | "midnight" | "sunset" | "woodland" | "glacier" | "custom"

export const PALETTE_OPTIONS: { label: string; value: Palette }[] = [
  { label: "Ivory Tusk (Default)", value: "ivory" },
  { label: "Elephant (Dark Mode)", value: "elephant" },
  { label: "Moon & Midnight", value: "midnight" },
  { label: "Sunset Savannah", value: "sunset" },
  { label: "Woodland Forrest", value: "woodland" },
  { label: "Glaciers & Waterfalls", value: "glacier" },
  { label: "(Custom)", value: "custom" },
]

export const MIN_FONT_SIZE = 10
export const MAX_FONT_SIZE = 84
export const DEFAULT_CUSTOM_BACKGROUND = "#0f0f0f"
export const DEFAULT_CUSTOM_ACCENT = "#9ab8ff"

export function hexToRgb(value: string) {
  const normalized = value.trim().replace("#", "")
  if (normalized.length !== 6) {
    return null
  }

  const parsed = Number.parseInt(normalized, 16)
  if (Number.isNaN(parsed)) {
    return null
  }

  return {
    r: (parsed >> 16) & 255,
    g: (parsed >> 8) & 255,
    b: parsed & 255,
  }
}

export function mixHexColors(base: string, target: string, ratio: number) {
  const from = hexToRgb(base)
  const to = hexToRgb(target)

  if (!from || !to) {
    return base
  }

  const clampRatio = Math.min(1, Math.max(0, ratio))
  const r = Math.round(from.r + (to.r - from.r) * clampRatio)
  const g = Math.round(from.g + (to.g - from.g) * clampRatio)
  const b = Math.round(from.b + (to.b - from.b) * clampRatio)

  return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`
}

export function pickReadableTextColor(background: string) {
  const rgb = hexToRgb(background)
  if (!rgb) {
    return "#f5f5f5"
  }

  const brightness = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000
  return brightness >= 150 ? "#111111" : "#f5f5f5"
}

export function clampFontSize(value: number) {
  return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, value))
}

export function getSystemPalette(isDarkMode: boolean): Palette {
  return isDarkMode ? "elephant" : "ivory"
}

export function getInitialPalette(): Palette {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "ivory"
  }

  return getSystemPalette(window.matchMedia("(prefers-color-scheme: dark)").matches)
}
