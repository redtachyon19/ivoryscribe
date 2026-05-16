// Cloud preference sync for local-mode (Electron) users.
//
// `useWorkspaceHydration` already handles preferences when running in cloud
// mode — but in local mode we pass it `session: null` so it doesn't replace
// the user's local files with cloud projects. That gate also stops preference
// loading + push. This hook fills that gap: it fetches preferences on login,
// applies them to the orchestrator's style state, and debounce-pushes any
// subsequent change. It deliberately never touches projects[] or folders[].

import { useEffect, useRef, type Dispatch, type SetStateAction } from "react"
import { getPreferences, updatePreferences } from "../api"
import type { Palette } from "../utils/appearance"
import { applyPreferences } from "../utils/preferences"
import type { UserSession } from "../state/session"

const PUSH_DEBOUNCE_MS = 700

type Props = {
  /** When null, the hook is dormant. Pass null in cloud mode (where
   *  useWorkspaceHydration handles preferences) or when not signed in. */
  session: UserSession | null
  // Current values
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
  // Setters
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

  // True once the initial fetch has populated state. Until that happens we
  // don't push, otherwise an out-of-the-box defaults-only state would clobber
  // whatever the user actually saved on the server.
  const hasHydratedRef = useRef(false)
  const lastPushedRef = useRef<string | null>(null)
  const pushTimerRef = useRef<number | null>(null)

  // ── Hydrate on login ────────────────────────────────────────────────
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
        // Seed the lastPushed signature so we don't immediately re-push what
        // we just received.
        lastPushedRef.current = serializeForPush(resolved)
      } catch {
        // Server unreachable / not logged in / etc. Stay with whatever state
        // the user currently has.
      }
    }

    void fetch()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.token])

  // ── Push on change (debounced) ──────────────────────────────────────
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
          // Try again on the next change.
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
