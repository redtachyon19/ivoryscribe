import { useEffect, useRef } from "react"
import type { TabViewMode } from "../utils/viewModePrefs"
import type { MarkdownTabViewMode } from "../utils/markdownViewModePrefs"

type ActiveDocumentType = "prose" | "pinboard" | "markdown" | "plaintext" | "pdf" | "image"

type UseViewModeShortcutsParams = {
  enabled: boolean
  activeDocumentType: ActiveDocumentType
  setProseViewMode: (mode: TabViewMode) => void
  setMarkdownViewMode: (mode: MarkdownTabViewMode) => void
}

const PROSE_BY_DIGIT: Record<string, TabViewMode> = { "1": "drafting", "2": "typewriter" }
const MARKDOWN_BY_DIGIT: Record<string, MarkdownTabViewMode> = { "1": "editor", "2": "both", "3": "preview" }

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

    window.addEventListener("keydown", onKeyDown, true)
    return () => window.removeEventListener("keydown", onKeyDown, true)
  }, [])
}
