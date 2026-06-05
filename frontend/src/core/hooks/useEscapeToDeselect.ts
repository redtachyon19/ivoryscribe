import { useEffect } from "react"

// App-wide: pressing Escape collapses (deselects) any active text selection,
// then consumes the key so it doesn't also fire other Escape behaviours.
//
// Covers every place text gets highlighted:
//   • <input> / <textarea> selections (markdown, plain-text, pinboard text,
//     settings fields, …) — collapsed to the selection's end.
//   • contenteditable / ProseMirror editors (Typewriter, Drafting) and plain
//     page-text selections — collapsed via the DOM Selection, which ProseMirror
//     observes and mirrors into its own state.
//
// When nothing is selected, Escape passes through untouched (so it still
// closes menus, modals, popovers, etc.). It also defers to an armed format
// painter, whose own Escape handler cancels the operation.

export function useEscapeToDeselect() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return

      // Let an armed format painter handle Escape (it cancels the operation).
      if (document.querySelector('[class*="paint-armed"]')) return

      const active = document.activeElement as HTMLElement | null
      if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) {
        const field = active as HTMLInputElement | HTMLTextAreaElement
        // selectionStart throws on input types that don't support it
        // (number, email, color, …) — treat those as "nothing to collapse".
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

    // Capture phase so it runs before component/editor handlers and can consume
    // the event when there's a selection to clear.
    document.addEventListener("keydown", onKeyDown, true)
    return () => document.removeEventListener("keydown", onKeyDown, true)
  }, [])
}
