// Shared TipTap base for the two prose editors (Drafting & Typewriter).
//
// Both editors previously hand-rolled the same skeleton: a `useEditor()` call
// with identical `editorProps` attributes and an `onUpdate` of the same shape,
// plus `useTypingState`, `useTypingCaret`, the three `useEditorLifecycle`
// effects, and a word-count-on-selection effect. That parallel wiring had
// already drifted between the two files. This hook owns the common base so the
// editors only differ where they genuinely diverge (extension set, chrome).
//
// Extension lists stay caller-owned: the two editors use different sets and
// TipTap extension order can be behaviourally significant, so this hook does
// not assemble or reorder them.

import { useEffect, useRef } from "react"
import { useEditor, type Editor as TiptapEditor, type Extensions } from "@tiptap/react"
import { useTypingState } from "./useTypingState"
import { useTypingCaret } from "./useTypingCaret"
import { useEditorContentSync, useEditorReadOnly, useEditorReady } from "./useEditorLifecycle"
import { normalizePastedFormatting } from "../utils/pasteNormalization"
import { emitTipTapWordCounts } from "../utils/wordCount"

type WordCountPayload = { documentWordCount: number; selectedWordCount: number | null }

export type ProseEditorBaseConfig = {
  documentId: string | null
  content: string
  readOnly: boolean
  /** Placeholder text shown when the document is empty. */
  placeholder: string
  /** Full TipTap extension list — kept caller-owned (see file header). */
  extensions: Extensions
  /** Optional inline `style` attribute applied to the editor DOM node. */
  editorStyle?: string
  /** HTML used when `content` is falsy. Defaults to "<p></p>". */
  defaultContent?: string
  /** When true, paste normalization also strips inline styles (Drafting). */
  stripInlineStylesOnPaste?: boolean
  /** When true, `onUpdate` also marks typing activity (Typewriter). */
  markTypingOnUpdate?: boolean
  onContentChange: (nextContent: string) => void
  onWordCountChange?: (payload: WordCountPayload) => void
  onTypingStateChange?: (isTyping: boolean) => void
  onEditorReady?: (editor: TiptapEditor | null) => void
  /** Side effect run at the start of `onUpdate`, before `onContentChange`
   *  (Drafting uses this to re-sync its empty-state attribute). */
  onUpdateSideEffect?: (editor: TiptapEditor) => void
  /** Passed through to `useEditorContentSync` — runs after a content re-sync. */
  onContentSync?: (editor: TiptapEditor) => void
}

const DEFAULT_PROSE_CONTENT = "<p></p>"

export function useProseEditorBase(config: ProseEditorBaseConfig) {
  const fallbackContent = config.defaultContent ?? DEFAULT_PROSE_CONTENT
  const editorSurfaceRef = useRef<HTMLDivElement | null>(null)

  // Keep the latest onWordCountChange in a ref so the selectionUpdate listener
  // (below) can subscribe once per editor instead of re-subscribing on every
  // render — callers commonly pass a fresh inline arrow for onWordCountChange.
  const onWordCountChangeRef = useRef(config.onWordCountChange)

  const { isUiTyping, markUiTypingActivity } = useTypingState({
    onTypingStateChange: config.onTypingStateChange,
  })

  const editor = useEditor({
    extensions: config.extensions,
    editorProps: {
      attributes: {
        "data-placeholder": config.placeholder,
        spellcheck: "true",
        autocorrect: "on",
        autocapitalize: "sentences",
        ...(config.editorStyle ? { style: config.editorStyle } : {}),
      },
      transformPastedHTML: (html: string) =>
        config.stripInlineStylesOnPaste
          ? normalizePastedFormatting(html, { stripInlineStyles: true })
          : normalizePastedFormatting(html),
    },
    content: config.content || fallbackContent,
    onUpdate: ({ editor: currentEditor }) => {
      config.onUpdateSideEffect?.(currentEditor)
      config.onContentChange(currentEditor.getHTML())
      emitTipTapWordCounts(currentEditor, config.onWordCountChange)
      if (config.markTypingOnUpdate) markUiTypingActivity()
    },
  })

  const { caretRef } = useTypingCaret({ editor, editorSurfaceRef, markUiTypingActivity })

  useEditorContentSync(editor, config.content, config.documentId, fallbackContent, config.onContentSync)
  useEditorReadOnly(editor, config.readOnly)
  useEditorReady(editor, config.onEditorReady)

  useEffect(() => {
    onWordCountChangeRef.current = config.onWordCountChange
  }, [config.onWordCountChange])

  /* ── Word count on selection change. Keyed on `editor` only — the callback
       is read through a ref so an unstable onWordCountChange prop does not
       tear down and re-add the listener. ── */
  useEffect(() => {
    if (!editor) return
    const onSelectionUpdate = () => emitTipTapWordCounts(editor, onWordCountChangeRef.current)
    editor.on("selectionUpdate", onSelectionUpdate)
    return () => { editor.off("selectionUpdate", onSelectionUpdate) }
  }, [editor])

  return { editor, editorSurfaceRef, caretRef, isUiTyping, markUiTypingActivity }
}
