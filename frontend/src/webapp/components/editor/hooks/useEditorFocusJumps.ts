// Listens for two cross-component navigation events and, when the active
// document matches, scrolls the editor to the requested occurrence of a word
// or query and selects it:
//
//   • APP_SPELL_CHECK_FOCUS_EVENT       — from the spell-check modal
//   • APP_PROJECT_SEARCH_FOCUS_EVENT    — from find/replace and global search
//
// Both events carry a `documentId` and a `documentType`; the hook ignores
// events targeting other documents.

import { useEffect } from "react"
import type { Editor as TiptapEditor } from "@tiptap/react"
import {
  APP_PROJECT_SEARCH_FOCUS_EVENT,
  APP_SPELL_CHECK_FOCUS_EVENT,
  type ProjectSearchFocusDetail,
  type SpellCheckFocusDetail,
} from "../../../../core/events/editorEvents"
import { applyTextHitSelection, findTextQueryHit, findTextWordHit } from "../utils/textHitFinder"

type UseEditorFocusJumpsParams = {
  editor: TiptapEditor | null
  documentId: string | null
  /** The document type for this editor — used to filter events targeting
   *  other doc types (e.g. markdown). DraftingEditor passes "text". */
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

    const onProjectSearchFocus = (event: Event) => {
      const detail = (event as CustomEvent<ProjectSearchFocusDetail>).detail
      if (!detail || detail.documentType !== documentType || detail.documentId !== documentId) return

      const editorDom = editor.view.dom
      const hit = findTextQueryHit(editorDom, detail.query, detail.occurrenceIndex)
      if (!hit) return

      editor.commands.focus()
      applyTextHitSelection(hit, editorDom)
    }

    window.addEventListener(APP_SPELL_CHECK_FOCUS_EVENT, onSpellCheckFocus as EventListener)
    window.addEventListener(APP_PROJECT_SEARCH_FOCUS_EVENT, onProjectSearchFocus as EventListener)

    return () => {
      window.removeEventListener(APP_SPELL_CHECK_FOCUS_EVENT, onSpellCheckFocus as EventListener)
      window.removeEventListener(APP_PROJECT_SEARCH_FOCUS_EVENT, onProjectSearchFocus as EventListener)
    }
  }, [editor, documentId, documentType])
}
