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
      if (!detail || detail.documentType !== "text" || detail.documentId !== documentId) return

      editor.commands.setSearchHighlight({ query: detail.query, active: detail.occurrenceIndex })

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
