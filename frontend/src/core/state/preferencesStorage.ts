import {
  DEFAULT_BODY_FONT,
  DEFAULT_CUSTOM_ACCENT,
  DEFAULT_CUSTOM_BACKGROUND,
  DEFAULT_DISPLAY_FONT,
  DEFAULT_UI_FONT,
  PALETTE_OPTIONS,
  clampFontSize,
  type Palette,
} from "../utils/appearance"

const STORAGE_KEY = "ivoryscribe.preferences.v1"

export type StoredPreferences = {
  palette?: Palette
  customPaletteBackground?: string
  customPaletteAccent?: string
  displayFont?: string
  bodyFont?: string
  uiFont?: string
  fontSize?: number
  isWordCountEnabled?: boolean
  isMenuBarEnabled?: boolean
  isFlagsEnabled?: boolean
  isTranslucentNavPanel?: boolean
  matchPdfToPalette?: boolean
}

function safeWindow(): Storage | null {
  if (typeof window === "undefined") return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function readStoredPreferences(): StoredPreferences {
  const storage = safeWindow()
  if (!storage) return {}
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== "object") return {}
    return sanitize(parsed as Record<string, unknown>)
  } catch {
    return {}
  }
}

export function writeStoredPreferences(patch: StoredPreferences): void {
  const storage = safeWindow()
  if (!storage) return
  try {
    const current = readStoredPreferences()
    const next = { ...current, ...patch }
    storage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
  }
}

export function clearStoredPreferences(): void {
  const storage = safeWindow()
  if (!storage) return
  try {
    storage.removeItem(STORAGE_KEY)
  } catch {
  }
}

const stored = (): StoredPreferences => readStoredPreferences()

export function getStoredPalette(fallback: Palette): Palette {
  const value = stored().palette
  return value && PALETTE_OPTIONS.some((option) => option.value === value) ? value : fallback
}

export function getStoredString(key: keyof StoredPreferences, fallback: string): string {
  const value = stored()[key]
  return typeof value === "string" ? value : fallback
}

export function getStoredNumber(key: keyof StoredPreferences, fallback: number): number {
  const value = stored()[key]
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

export function getStoredBoolean(key: keyof StoredPreferences, fallback: boolean): boolean {
  const value = stored()[key]
  return typeof value === "boolean" ? value : fallback
}

export function getStoredAppStyleDefaults() {
  const s = stored()
  return {
    palette: (s.palette && PALETTE_OPTIONS.some((option) => option.value === s.palette))
      ? s.palette as Palette
      : null,
    customPaletteBackground: typeof s.customPaletteBackground === "string"
      ? s.customPaletteBackground
      : DEFAULT_CUSTOM_BACKGROUND,
    customPaletteAccent: typeof s.customPaletteAccent === "string"
      ? s.customPaletteAccent
      : DEFAULT_CUSTOM_ACCENT,
    displayFont: typeof s.displayFont === "string" ? s.displayFont : DEFAULT_DISPLAY_FONT,
    bodyFont: typeof s.bodyFont === "string" ? s.bodyFont : DEFAULT_BODY_FONT,
    uiFont: typeof s.uiFont === "string" ? s.uiFont : DEFAULT_UI_FONT,
    fontSize: typeof s.fontSize === "number" && Number.isFinite(s.fontSize)
      ? clampFontSize(s.fontSize)
      : 32,
    isWordCountEnabled: typeof s.isWordCountEnabled === "boolean" ? s.isWordCountEnabled : false,
    matchPdfToPalette: typeof s.matchPdfToPalette === "boolean" ? s.matchPdfToPalette : false,
  }
}

function sanitize(value: Record<string, unknown>): StoredPreferences {
  const out: StoredPreferences = {}
  if (typeof value.palette === "string" && PALETTE_OPTIONS.some((o) => o.value === value.palette)) {
    out.palette = value.palette as Palette
  }
  if (typeof value.customPaletteBackground === "string") out.customPaletteBackground = value.customPaletteBackground
  if (typeof value.customPaletteAccent === "string") out.customPaletteAccent = value.customPaletteAccent
  if (typeof value.displayFont === "string") out.displayFont = value.displayFont
  if (typeof value.bodyFont === "string") out.bodyFont = value.bodyFont
  if (typeof value.uiFont === "string") out.uiFont = value.uiFont
  if (typeof value.fontSize === "number" && Number.isFinite(value.fontSize)) out.fontSize = value.fontSize
  if (typeof value.isWordCountEnabled === "boolean") out.isWordCountEnabled = value.isWordCountEnabled
  if (typeof value.isMenuBarEnabled === "boolean") out.isMenuBarEnabled = value.isMenuBarEnabled
  if (typeof value.isFlagsEnabled === "boolean") out.isFlagsEnabled = value.isFlagsEnabled
  if (typeof value.isTranslucentNavPanel === "boolean") out.isTranslucentNavPanel = value.isTranslucentNavPanel
  if (typeof value.matchPdfToPalette === "boolean") out.matchPdfToPalette = value.matchPdfToPalette
  return out
}
