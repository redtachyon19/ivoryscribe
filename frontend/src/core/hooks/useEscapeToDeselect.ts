import { useEffect } from "react"

export function useEscapeToDeselect() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return

      if (document.querySelector('[class*="paint-armed"]')) return

      const active = document.activeElement as HTMLElement | null
      if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) {
        const field = active as HTMLInputElement | HTMLTextAreaElement
        let start: number | null = null
        let end: number | null = null
        try {
          start = field.selectionStart
          end = field.selectionEnd
        } catch {
          return
        }
        if (start != null && end != null && start !== end) {
          field.setSelectionRange(end, end)
          e.preventDefault()
          e.stopPropagation()
        }
        return
      }

      const selection = window.getSelection()
      if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
        selection.collapseToEnd()
        e.preventDefault()
        e.stopPropagation()
      }
    }

    document.addEventListener("keydown", onKeyDown, true)
    return () => document.removeEventListener("keydown", onKeyDown, true)
  }, [])
}
