import { useEffect, useMemo, useState, type CSSProperties } from "react"
import {
  PALETTE_OPTIONS,
  clampFontSize,
  getInitialPalette,
  getSystemPalette,
  mixHexColors,
  pickReadableTextColor,
  withEmojiFontFallback,
  type Palette,
} from "../utils/appearance"
import {
  APP_COLOR_PALETTE_CHANGE_EVENT,
  EDITOR_FONT_FAMILY_CHANGE_EVENT,
  EDITOR_FONT_SIZE_CHANGE_EVENT,
  EDITOR_FONT_SIZE_SET_EVENT,
  requestEditorFontFamilyChange,
  requestEditorFontSizeSet,
} from "../events/editorEvents"
import { getStoredAppStyleDefaults, writeStoredPreferences } from "../state/preferencesStorage"

export function useAppStyle() {
  const stored = getStoredAppStyleDefaults()
  const [displayFont, setDisplayFont] = useState<string>(stored.displayFont)
  const [bodyFont, setBodyFont] = useState<string>(stored.bodyFont)
  const [uiFont, setUiFont] = useState<string>(stored.uiFont)
  const [fontSize, setFontSize] = useState<number>(stored.fontSize)
  const [isWordCountEnabled, setIsWordCountEnabled] = useState<boolean>(stored.isWordCountEnabled)
  const [palette, setPalette] = useState<Palette>(() => stored.palette ?? getInitialPalette())
  const [customPaletteBackground, setCustomPaletteBackground] = useState(stored.customPaletteBackground)
  const [customPaletteAccent, setCustomPaletteAccent] = useState(stored.customPaletteAccent)
  const [matchPdfToPalette, setMatchPdfToPalette] = useState<boolean>(stored.matchPdfToPalette)

  useEffect(() => {
    writeStoredPreferences({
      palette,
      customPaletteBackground,
      customPaletteAccent,
      displayFont,
      bodyFont,
      uiFont,
      fontSize,
      isWordCountEnabled,
      matchPdfToPalette,
    })
  }, [
    palette,
    customPaletteBackground,
    customPaletteAccent,
    displayFont,
    bodyFont,
    uiFont,
    fontSize,
    isWordCountEnabled,
    matchPdfToPalette,
  ])

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return
    }

    const colorSchemeQuery = window.matchMedia("(prefers-color-scheme: dark)")

    const onColorSchemeChange = (event: MediaQueryListEvent) => {
      setPalette(getSystemPalette(event.matches))
    }

    const legacyColorSchemeQuery = colorSchemeQuery as MediaQueryList & {
      addListener?: (listener: (event: MediaQueryListEvent) => void) => void
      removeListener?: (listener: (event: MediaQueryListEvent) => void) => void
    }

    if ("addEventListener" in colorSchemeQuery) {
      colorSchemeQuery.addEventListener("change", onColorSchemeChange)
    } else if (legacyColorSchemeQuery.addListener) {
      legacyColorSchemeQuery.addListener(onColorSchemeChange)
    }

    return () => {
      if ("removeEventListener" in colorSchemeQuery) {
        colorSchemeQuery.removeEventListener("change", onColorSchemeChange)
      } else if (legacyColorSchemeQuery.removeListener) {
        legacyColorSchemeQuery.removeListener(onColorSchemeChange)
      }
    }
  }, [])

  useEffect(() => {
    const onFontFamilyChange = (event: Event) => {
      const customEvent = event as CustomEvent<{ fontFamily: string }>
      const nextFontFamily = customEvent.detail?.fontFamily
      if (!nextFontFamily) {
        return
      }

      setBodyFont(nextFontFamily)
    }

    const onFontSizeChange = (event: Event) => {
      const customEvent = event as CustomEvent<{ delta: number }>
      const delta = customEvent.detail?.delta ?? 0

      if (!delta) {
        return
      }

      setFontSize((current) => clampFontSize(current + delta))
    }

    const onFontSizeSet = (event: Event) => {
      const customEvent = event as CustomEvent<{ value: number }>
      const value = customEvent.detail?.value
      if (typeof value !== "number" || Number.isNaN(value)) {
        return
      }

      setFontSize(clampFontSize(value))
    }

    const onPaletteChange = (event: Event) => {
      const customEvent = event as CustomEvent<{ palette: string }>
      const nextPalette = customEvent.detail?.palette
      if (!nextPalette) {
        return
      }

      const isSupported = PALETTE_OPTIONS.some((option) => option.value === nextPalette)
      if (!isSupported) {
        return
      }

      setPalette(nextPalette as Palette)
    }

    window.addEventListener(EDITOR_FONT_FAMILY_CHANGE_EVENT, onFontFamilyChange as EventListener)
    window.addEventListener(EDITOR_FONT_SIZE_CHANGE_EVENT, onFontSizeChange as EventListener)
    window.addEventListener(EDITOR_FONT_SIZE_SET_EVENT, onFontSizeSet as EventListener)
    window.addEventListener(APP_COLOR_PALETTE_CHANGE_EVENT, onPaletteChange as EventListener)

    return () => {
      window.removeEventListener(EDITOR_FONT_FAMILY_CHANGE_EVENT, onFontFamilyChange as EventListener)
      window.removeEventListener(EDITOR_FONT_SIZE_CHANGE_EVENT, onFontSizeChange as EventListener)
      window.removeEventListener(EDITOR_FONT_SIZE_SET_EVENT, onFontSizeSet as EventListener)
      window.removeEventListener(APP_COLOR_PALETTE_CHANGE_EVENT, onPaletteChange as EventListener)
    }
  }, [])

  const applyDisplayFont = (fontFamily: string) => {
    setDisplayFont(fontFamily)
  }

  const applyBodyFont = (fontFamily: string) => {
    setBodyFont(fontFamily)
    requestEditorFontFamilyChange(fontFamily)
  }

  const applyUiFont = (fontFamily: string) => {
    setUiFont(fontFamily)
  }

  const applyFontSize = (nextFontSize: number) => {
    requestEditorFontSizeSet(clampFontSize(nextFontSize))
  }

  const appStyleVariables = useMemo(() => {
    const variables: Record<string, string> = {
      "--app-display-font": withEmojiFontFallback(displayFont),
      "--app-body-font": withEmojiFontFallback(bodyFont),
      "--app-ui-font": withEmojiFontFallback(uiFont),
    }

    if (palette !== "custom") {
      return variables as CSSProperties
    }

    const textColor = pickReadableTextColor(customPaletteBackground)
    const menuBackground = mixHexColors(customPaletteBackground, textColor === "#111111" ? "#ffffff" : "#000000", 0.06)
    const menuHover = mixHexColors(customPaletteBackground, textColor === "#111111" ? "#ffffff" : "#000000", 0.12)
    const dropdownBackground = mixHexColors(customPaletteBackground, textColor === "#111111" ? "#ffffff" : "#000000", 0.09)
    const borderColor = mixHexColors(customPaletteBackground, textColor, 0.18)
    const placeholderColor = textColor === "#111111" ? "rgba(17, 17, 17, 0.44)" : "rgba(245, 245, 245, 0.46)"
    const isLightTextMode = textColor === "#111111"

    variables["--app-bg"] = customPaletteBackground
    variables["--app-accent"] = customPaletteAccent
    variables["--brand-color"] = textColor
    variables["--menu-bg"] = menuBackground
    variables["--menu-border"] = borderColor
    variables["--menu-button"] = textColor
    variables["--menu-button-hover-bg"] = menuHover
    variables["--menu-dropdown-bg"] = dropdownBackground
    variables["--menu-dropdown-border"] = borderColor
    variables["--editor-text"] = textColor
    variables["--editor-title"] = textColor
    variables["--editor-placeholder"] = placeholderColor
    variables["--project-wallpaper-opacity"] = isLightTextMode ? "0.2" : "0.12"
    variables["--project-wallpaper-filter"] = isLightTextMode ? "grayscale(1) brightness(0.22) contrast(1.2)" : "none"

    return variables as CSSProperties
  }, [bodyFont, customPaletteAccent, customPaletteBackground, displayFont, palette, uiFont])

  return {
    palette,
    setPalette,
    customPaletteBackground,
    setCustomPaletteBackground,
    customPaletteAccent,
    setCustomPaletteAccent,
    displayFont,
    setDisplayFont,
    bodyFont,
    setBodyFont,
    uiFont,
    setUiFont,
    fontSize,
    setFontSize,
    isWordCountEnabled,
    setIsWordCountEnabled,
    matchPdfToPalette,
    setMatchPdfToPalette,
    applyDisplayFont,
    applyBodyFont,
    applyUiFont,
    applyFontSize,
    appStyleVariables,
  }
}
