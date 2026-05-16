// Word count helpers shared by DraftingEditor and TypewriterEditor.
// MarkdownEditor uses a different path (operates on raw markdown source,
// not on a TipTap doc); see MarkdownEditor.tsx for that local helper.

import type { Editor as TiptapEditor } from "@tiptap/react"
import { countWords } from "../../../../core/utils/markdown"

export type WordCountPayload = {
  documentWordCount: number
  selectedWordCount: number | null
}

export type WordCountListener = (payload: WordCountPayload) => void

/** Compute and emit document + selection word counts for a TipTap editor. */
export function emitTipTapWordCounts(editor: TiptapEditor, onChange: WordCountListener | undefined) {
  if (!onChange) return
  const documentWordCount = countWords(editor.getText())
  const { from, to } = editor.state.selection
  const selectedWordCount = from === to ? null : countWords(editor.state.doc.textBetween(from, to, " "))
  onChange({ documentWordCount, selectedWordCount })
}
