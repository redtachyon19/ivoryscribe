import { useEffect, useRef, type Dispatch, type SetStateAction } from "react"
import { getPreferences, updatePreferences } from "@shared/api"
import type { Palette } from "../utils/appearance"
import { applyPreferences } from "../utils/preferences"
import type { UserSession } from "../state/session"

const PUSH_DEBOUNCE_MS = 700

type Props = {
  session: UserSession | null
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

export function useCloudPreferenceSync(props: Props): void {
  const {
    session,
    palette, customPaletteBackground, customPaletteAccent,
    displayFont, bodyFont, uiFont, fontSize, isWordCountEnabled,
    isMenuBarEnabled, isFlagsEnabled, isTranslucentNavPanel,
    setPalette, setCustomPaletteBackground, setCustomPaletteAccent,
    setDisplayFont, setBodyFont, setUiFont, setFontSize, setIsWordCountEnabled,
    setIsMenuBarEnabled, setIsFlagsEnabled, setIsTranslucentNavPanel,
  } = props

  const hasHydratedRef = useRef(false)
  const lastPushedRef = useRef<string | null>(null)
  const pushTimerRef = useRef<number | null>(null)

  useEffect(() => {
    if (!session) {
      hasHydratedRef.current = false
      lastPushedRef.current = null
      return
    }

    let cancelled = false
    const fetch = async () => {
      try {
        const prefs = await getPreferences(session.token)
        if (cancelled) return

        const resolved = applyPreferences(prefs, {
          setPalette, setCustomPaletteBackground, setCustomPaletteAccent,
          setDisplayFont, setBodyFont, setUiFont, setFontSize, setIsWordCountEnabled,
          setIsMenuBarEnabled, setIsFlagsEnabled, setIsTranslucentNavPanel,
        })

        hasHydratedRef.current = true
        lastPushedRef.current = serializeForPush(resolved)
      } catch {
      }
    }

    void fetch()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.token])

  useEffect(() => {
    if (!session) return
    if (!hasHydratedRef.current) return

    const signature = serializeForPush({
      palette,
      customPaletteBackground,
      customPaletteAccent,
      displayFont,
      bodyFont,
      uiFont,
      fontSize,
      isWordCountEnabled,
      isMenuBarEnabled,
      isFlagsEnabled,
      isTranslucentNavPanel,
    })
    if (signature === lastPushedRef.current) return

    if (pushTimerRef.current !== null) {
      window.clearTimeout(pushTimerRef.current)
    }
    pushTimerRef.current = window.setTimeout(() => {
      pushTimerRef.current = null
      void (async () => {
        try {
          await updatePreferences(session.token, {
            theme: {
              palette,
              customPaletteBackground,
              customPaletteAccent,
            },
            editorSettings: {
              displayFont,
              bodyFont,
              uiFont,
              fontSize,
              isWordCountEnabled,
            },
            uiSettings: {
              menuBarEnabled: isMenuBarEnabled,
              flagsEnabled: isFlagsEnabled,
              translucentNavPanel: isTranslucentNavPanel,
            },
          })
          lastPushedRef.current = signature
        } catch {
        }
      })()
    }, PUSH_DEBOUNCE_MS)

    return () => {
      if (pushTimerRef.current !== null) {
        window.clearTimeout(pushTimerRef.current)
        pushTimerRef.current = null
      }
    }
  }, [
    session, palette, customPaletteBackground, customPaletteAccent,
    displayFont, bodyFont, uiFont, fontSize, isWordCountEnabled,
    isMenuBarEnabled, isFlagsEnabled, isTranslucentNavPanel,
  ])
}

function serializeForPush(values: {
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
}): string {
  return JSON.stringify(values)
}
