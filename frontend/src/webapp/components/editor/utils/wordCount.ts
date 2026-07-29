import type { Editor as TiptapEditor } from "@tiptap/react"
import { countWords } from "../../../../core/utils/markdown"

export type WordCountPayload = {
  documentWordCount: number
  selectedWordCount: number | null
}

export type WordCountListener = (payload: WordCountPayload) => void

export function emitTipTapWordCounts(editor: TiptapEditor, onChange: WordCountListener | undefined) {
  if (!onChange) return
  const documentWordCount = countWords(editor.getText())
  const { from, to } = editor.state.selection
  const selectedWordCount = from === to ? null : countWords(editor.state.doc.textBetween(from, to, " "))
  onChange({ documentWordCount, selectedWordCount })
}
