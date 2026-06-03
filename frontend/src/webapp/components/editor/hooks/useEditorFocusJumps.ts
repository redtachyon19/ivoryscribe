// Listens for the spell-check navigation event and, when the active document
// matches, scrolls the editor to the requested occurrence of a word and
// selects it:
//
//   • APP_SPELL_CHECK_FOCUS_EVENT       — from the spell-check modal
//
// Find & Replace highlighting is handled separately by useEditorSearchHighlight
// (decoration based) — a native selection flickered out whenever the Find box
// reclaimed focus, so it no longer drives search jumps here.
//
// The event carries a `documentId` and a `documentType`; the hook ignores
// events targeting other documents.

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

    window.addEventListener(APP_SPELL_CHECK_FOCUS_EVENT, onSpellCheckFocus as EventListener)

    return () => {
      window.removeEventListener(APP_SPELL_CHECK_FOCUS_EVENT, onSpellCheckFocus as EventListener)
    }
  }, [editor, documentId, documentType])
}
