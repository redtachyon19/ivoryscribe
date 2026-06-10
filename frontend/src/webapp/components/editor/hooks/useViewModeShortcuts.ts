// ⌘/Ctrl + 1/2/3 — switch the active document's view.
//
//   • Prose tab (Book chapters): ⌘1 = Draft, ⌘2 = Typewriter.
//   • Markdown tab:              ⌘1 = Editor, ⌘2 = Both, ⌘3 = Preview/View.
//
// Other document kinds (pinboard, PDF, image, plain text) have no alternate
// views, so the shortcuts are ignored there.
//
// Params are read through a ref so the global keydown listener subscribes once
// (not on every keystroke-driven re-render of the Editor page).

import { useEffect, useRef } from "react"
import type { TabViewMode } from "../utils/viewModePrefs"
import type { MarkdownTabViewMode } from "../utils/markdownViewModePrefs"

type ActiveDocumentType = "prose" | "pinboard" | "markdown" | "plaintext" | "pdf" | "image"

type UseViewModeShortcutsParams = {
  /** Only act while the editor surface is showing a switchable document. */
  enabled: boolean
  activeDocumentType: ActiveDocumentType
  setProseViewMode: (mode: TabViewMode) => void
  setMarkdownViewMode: (mode: MarkdownTabViewMode) => void
}

const PROSE_BY_DIGIT: Record<string, TabViewMode> = { "1": "drafting", "2": "typewriter" }
const MARKDOWN_BY_DIGIT: Record<string, MarkdownTabViewMode> = { "1": "editor", "2": "both", "3": "preview" }

// Resolve "1"/"2"/"3" from a keydown, layout-independently: prefer the logical
// key, fall back to the physical Digit/Numpad code (AZERTY etc. yield a glyph
// for the top-row keys, but the code is stable).
function digitFromEvent(event: KeyboardEvent): "1" | "2" | "3" | null {
  if (event.key === "1" || event.key === "2" || event.key === "3") return event.key
  switch (event.code) {
    case "Digit1":
    case "Numpad1":
      return "1"
    case "Digit2":
    case "Numpad2":
      return "2"
    case "Digit3":
    case "Numpad3":
      return "3"
    default:
      return null
  }
}

export function useViewModeShortcuts(params: UseViewModeShortcutsParams) {
  const paramsRef = useRef(params)
  paramsRef.current = params

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // ⌘ (mac) / Ctrl (win/linux) + bare digit. No Shift/Alt so we don't
      // collide with other accelerators.
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return

      const digit = digitFromEvent(event)
      if (!digit) return

      const { enabled, activeDocumentType, setProseViewMode, setMarkdownViewMode } = paramsRef.current
      if (!enabled) return

      if (activeDocumentType === "prose") {
        const mode = PROSE_BY_DIGIT[digit]
        if (!mode) return
        event.preventDefault()
        setProseViewMode(mode)
      } else if (activeDocumentType === "markdown") {
        const mode = MARKDOWN_BY_DIGIT[digit]
        if (!mode) return
        event.preventDefault()
        setMarkdownViewMode(mode)
      }
    }

    // Capture phase so we win before the editor's own keydown handlers.
    window.addEventListener("keydown", onKeyDown, true)
    return () => window.removeEventListener("keydown", onKeyDown, true)
  }, [])
}
