// Drives the Find & Replace decoration highlight for a TipTap prose editor
// (Draft + Typewriter). On a search-focus event targeting THIS document it
// paints every match, emphasises the active one, and scrolls it into view; on a
// clear event it removes the decorations.
//
// Unlike the old native-selection approach (useEditorFocusJumps' search branch,
// now removed) this does not steal or rely on DOM focus, so the highlight stays
// visible while the Find box keeps focus.

import { useEffect } from "react"
import type { Editor as TiptapEditor } from "@tiptap/react"
import {
  APP_PROJECT_SEARCH_CLEAR_EVENT,
  APP_PROJECT_SEARCH_FOCUS_EVENT,
  type ProjectSearchFocusDetail,
} from "../../../../core/events/editorEvents"

type UseEditorSearchHighlightParams = {
  editor: TiptapEditor | null
  documentId: string | null
}

export function useEditorSearchHighlight({ editor, documentId }: UseEditorSearchHighlightParams) {
  useEffect(() => {
    if (!editor || !documentId) return

    const onSearchFocus = (event: Event) => {
      const detail = (event as CustomEvent<ProjectSearchFocusDetail>).detail
      // Both Draft and Typewriter surface their content as "text" results.
      if (!detail || detail.documentType !== "text" || detail.documentId !== documentId) return

      editor.commands.setSearchHighlight({ query: detail.query, active: detail.occurrenceIndex })

      // Scroll the active match into view once ProseMirror has rendered the
      // decoration span into the DOM.
      window.requestAnimationFrame(() => {
        const activeEl = editor.view.dom.querySelector<HTMLElement>(".search-hit--active")
        activeEl?.scrollIntoView({ behavior: "smooth", block: "center" })
      })
    }

    const onSearchClear = () => {
      editor.commands.clearSearchHighlight()
    }

    window.addEventListener(APP_PROJECT_SEARCH_FOCUS_EVENT, onSearchFocus as EventListener)
    window.addEventListener(APP_PROJECT_SEARCH_CLEAR_EVENT, onSearchClear)

    return () => {
      window.removeEventListener(APP_PROJECT_SEARCH_FOCUS_EVENT, onSearchFocus as EventListener)
      window.removeEventListener(APP_PROJECT_SEARCH_CLEAR_EVENT, onSearchClear)
    }
  }, [editor, documentId])
}
