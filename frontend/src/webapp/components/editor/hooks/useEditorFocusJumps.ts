import { useEffect } from "react"
import type { Editor as TiptapEditor } from "@tiptap/react"
import {
  APP_SPELL_CHECK_FOCUS_EVENT,
  type SpellCheckFocusDetail,
} from "../../../../core/events/editorEvents"
import { applyTextHitSelection, findTextWordHit } from "../utils/textHitFinder"

type UseEditorFocusJumpsParams = {
  editor: TiptapEditor | null
  documentId: string | null
  documentType: "text" | "markdown"
}

export function useEditorFocusJumps({ editor, documentId, documentType }: UseEditorFocusJumpsParams) {
  useEffect(() => {
    if (!editor || !documentId) return

    const onSpellCheckFocus = (event: Event) => {
      const detail = (event as CustomEvent<SpellCheckFocusDetail>).detail
      if (!detail || detail.documentType !== documentType || detail.documentId !== documentId) return

      const editorDom = editor.view.dom
      const hit = findTextWordHit(editorDom, detail.normalizedWord, detail.occurrenceIndex)
      if (!hit) return

      editor.commands.focus()
      applyTextHitSelection(hit, editorDom)
    }

    window.addEventListener(APP_SPELL_CHECK_FOCUS_EVENT, onSpellCheckFocus as EventListener)

    return () => {
      window.removeEventListener(APP_SPELL_CHECK_FOCUS_EVENT, onSpellCheckFocus as EventListener)
    }
  }, [editor, documentId, documentType])
}
