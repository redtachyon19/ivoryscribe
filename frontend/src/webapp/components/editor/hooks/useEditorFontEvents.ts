// Listens for the three font-related events the global menu dispatches:
//   • EDITOR_FONT_SIZE_CHANGE_EVENT — delta from a +/- menu action
//   • EDITOR_FONT_SIZE_SET_EVENT    — absolute size from the size dropdown
//   • EDITOR_FONT_FAMILY_CHANGE_EVENT — new font family from the picker
//
// Used by DraftingEditor (and any future editor that wants the same global
// menu hookup). The hook clamps font sizes to [min, max] and wraps the font
// family in `withEmojiFontFallback` so emoji glyphs render even when the
// chosen font lacks them.

import { useEffect, type Dispatch, type SetStateAction } from "react"
import {
  EDITOR_FONT_FAMILY_CHANGE_EVENT,
  EDITOR_FONT_SIZE_CHANGE_EVENT,
  EDITOR_FONT_SIZE_SET_EVENT,
} from "../../../../core/events/editorEvents"
import { withEmojiFontFallback } from "../../../../core/utils/appearance"

type FontSizeChangeDetail = { delta: number }
type FontSizeSetDetail = { value: number }
type FontFamilyChangeDetail = { fontFamily: string }

type UseEditorFontEventsParams = {
  setFontSize: Dispatch<SetStateAction<number>>
  setFontFamily: Dispatch<SetStateAction<string>>
  minFontSize: number
  maxFontSize: number
}

export function useEditorFontEvents({
  setFontSize,
  setFontFamily,
  minFontSize,
  maxFontSize,
}: UseEditorFontEventsParams) {
  useEffect(() => {
    const clamp = (value: number) => Math.min(maxFontSize, Math.max(minFontSize, value))

    const onFontSizeChange = (event: Event) => {
      const detail = (event as CustomEvent<FontSizeChangeDetail>).detail
      const delta = detail?.delta ?? 0
      if (!delta) return
      setFontSize((current) => clamp(current + delta))
    }

    const onFontSizeSet = (event: Event) => {
      const detail = (event as CustomEvent<FontSizeSetDetail>).detail
      const value = detail?.value
      if (typeof value !== "number" || Number.isNaN(value)) return
      setFontSize(clamp(value))
    }

    const onFontFamilyChange = (event: Event) => {
      const detail = (event as CustomEvent<FontFamilyChangeDetail>).detail
      const nextFontFamily = detail?.fontFamily
      if (!nextFontFamily) return
      setFontFamily(withEmojiFontFallback(nextFontFamily))
    }

    window.addEventListener(EDITOR_FONT_SIZE_CHANGE_EVENT, onFontSizeChange as EventListener)
    window.addEventListener(EDITOR_FONT_SIZE_SET_EVENT, onFontSizeSet as EventListener)
    window.addEventListener(EDITOR_FONT_FAMILY_CHANGE_EVENT, onFontFamilyChange as EventListener)

    return () => {
      window.removeEventListener(EDITOR_FONT_SIZE_CHANGE_EVENT, onFontSizeChange as EventListener)
      window.removeEventListener(EDITOR_FONT_SIZE_SET_EVENT, onFontSizeSet as EventListener)
      window.removeEventListener(EDITOR_FONT_FAMILY_CHANGE_EVENT, onFontFamilyChange as EventListener)
    }
  }, [setFontSize, setFontFamily, minFontSize, maxFontSize])
}
