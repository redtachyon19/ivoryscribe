import type { Dispatch, SetStateAction } from "react"
import {
  clampFontSize,
  DEFAULT_BODY_FONT,
  DEFAULT_CUSTOM_ACCENT,
  DEFAULT_CUSTOM_BACKGROUND,
  DEFAULT_DISPLAY_FONT,
  DEFAULT_UI_FONT,
  getInitialPalette,
  PALETTE_OPTIONS,
  type Palette,
} from "./appearance"
import { requestEditorFontFamilyChange } from "../events/editorEvents"

export type PreferencesPayload = {
  theme?: {
    palette?: string
    customPaletteBackground?: string
    customPaletteAccent?: string
  }
  editorSettings?: {
    displayFont?: string
    bodyFont?: string
    uiFont?: string
    selectedFont?: string
    fontSize?: number
    isWordCountEnabled?: boolean
  }
  uiSettings?: {
    menuBarEnabled?: boolean
    flagsEnabled?: boolean
    translucentNavPanel?: boolean
  }
}

export type ResolvedPreferences = {
  palette: Palette
  customPaletteBackground: string
  customPaletteAccent: string
  displayFont: string
  bodyFont: string
  uiFont: string
  fontSize: number
  isWordCountEnabled: boolean
  isMenuBarEnabled: boolean
  isFlagsEnabled: boolean
  isTranslucentNavPanel: boolean
}

export type PreferenceMutators = {
  setPalette: Dispatch<SetStateAction<Palette>>
  setCustomPaletteBackground: Dispatch<SetStateAction<string>>
  setCustomPaletteAccent: Dispatch<SetStateAction<string>>
  setDisplayFont: Dispatch<SetStateAction<string>>
  setBodyFont: Dispatch<SetStateAction<string>>
  setUiFont: Dispatch<SetStateAction<string>>
  setFontSize: Dispatch<SetStateAction<number>>
  setIsWordCountEnabled: Dispatch<SetStateAction<boolean>>
  setIsMenuBarEnabled: Dispatch<SetStateAction<boolean>>
  setIsFlagsEnabled: Dispatch<SetStateAction<boolean>>
  setIsTranslucentNavPanel: Dispatch<SetStateAction<boolean>>
}

function resolveFontSize(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return 32
  return clampFontSize(raw)
}

export function resolvePreferences(prefs: PreferencesPayload): ResolvedPreferences {
  const theme = prefs.theme ?? {}
  const editor = prefs.editorSettings ?? {}
  const ui = prefs.uiSettings ?? {}

  const palette: Palette =
    typeof theme.palette === "string" && PALETTE_OPTIONS.some((option) => option.value === theme.palette)
      ? (theme.palette as Palette)
      : getInitialPalette()

  return {
    palette,
    customPaletteBackground: typeof theme.customPaletteBackground === "string" ? theme.customPaletteBackground : DEFAULT_CUSTOM_BACKGROUND,
    customPaletteAccent: typeof theme.customPaletteAccent === "string" ? theme.customPaletteAccent : DEFAULT_CUSTOM_ACCENT,
    displayFont: typeof editor.displayFont === "string" ? editor.displayFont : DEFAULT_DISPLAY_FONT,
    bodyFont: typeof editor.bodyFont === "string"
      ? editor.bodyFont
      : (typeof editor.selectedFont === "string" ? editor.selectedFont : DEFAULT_BODY_FONT),
    uiFont: typeof editor.uiFont === "string" ? editor.uiFont : DEFAULT_UI_FONT,
    fontSize: resolveFontSize(editor.fontSize),
    isWordCountEnabled: Boolean(editor.isWordCountEnabled),
    isMenuBarEnabled: Boolean(ui.menuBarEnabled),
    isFlagsEnabled: Boolean(ui.flagsEnabled),
    isTranslucentNavPanel: ui.translucentNavPanel !== false,
  }
}

export function applyPreferences(prefs: PreferencesPayload, mutators: PreferenceMutators): ResolvedPreferences {
  const resolved = resolvePreferences(prefs)

  mutators.setPalette(resolved.palette)
  mutators.setCustomPaletteBackground(resolved.customPaletteBackground)
  mutators.setCustomPaletteAccent(resolved.customPaletteAccent)
  mutators.setDisplayFont(resolved.displayFont)
  mutators.setBodyFont(resolved.bodyFont)
  mutators.setUiFont(resolved.uiFont)
  mutators.setFontSize(resolved.fontSize)
  mutators.setIsWordCountEnabled(resolved.isWordCountEnabled)
  mutators.setIsMenuBarEnabled(resolved.isMenuBarEnabled)
  mutators.setIsFlagsEnabled(resolved.isFlagsEnabled)
  mutators.setIsTranslucentNavPanel(resolved.isTranslucentNavPanel)

  requestEditorFontFamilyChange(resolved.bodyFont)

  return resolved
}
