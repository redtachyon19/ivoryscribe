import { useEffect, useMemo, useRef } from "react"
import { useEditor, type Editor as TiptapEditor, type Extensions } from "@tiptap/react"
import { NodeSelection, Selection } from "@tiptap/pm/state"
import { useTypingState } from "./useTypingState"
import { useTypingCaret } from "./useTypingCaret"
import { useEditorContentSync, useEditorReadOnly, useEditorReady } from "./useEditorLifecycle"
import { normalizePastedFormatting } from "../utils/pasteNormalization"
import { emitTipTapWordCounts } from "../utils/wordCount"

type WordCountPayload = { documentWordCount: number; selectedWordCount: number | null }

const SAVE_DEBOUNCE_MS = 160
const SAVE_MAX_WAIT_MS = 1200
const WORD_COUNT_DEBOUNCE_MS = 150
const WORD_COUNT_MAX_WAIT_MS = 1200

type DeferredRunner = {
  schedule: (run: () => void) => void
  flush: () => void
  cancel: () => void
}

function createDeferredRunner(waitMs: number, maxWaitMs: number): DeferredRunner {
  let timer = 0
  let firstScheduledAt = 0
  let pending: (() => void) | null = null

  const fire = () => {
    if (timer) {
      window.clearTimeout(timer)
      timer = 0
    }
    firstScheduledAt = 0
    const run = pending
    pending = null
    run?.()
  }

  return {
    schedule(run: () => void) {
      pending = run
      const now = performance.now()
      if (!firstScheduledAt) firstScheduledAt = now
      if (timer) window.clearTimeout(timer)
      if (now - firstScheduledAt >= maxWaitMs) {
        fire()
      } else {
        timer = window.setTimeout(fire, waitMs)
      }
    },
    flush() {
      if (pending) fire()
    },
    cancel() {
      if (timer) window.clearTimeout(timer)
      timer = 0
      firstScheduledAt = 0
      pending = null
    },
  }
}

export type ProseEditorBaseConfig = {
  documentId: string | null
  content: string
  readOnly: boolean
  placeholder: string
  extensions: Extensions
  editorStyle?: string
  defaultContent?: string
  stripInlineStylesOnPaste?: boolean
  markTypingOnUpdate?: boolean
  onContentChange: (nextContent: string) => void
  onWordCountChange?: (payload: WordCountPayload) => void
  onTypingStateChange?: (isTyping: boolean) => void
  onEditorReady?: (editor: TiptapEditor | null) => void
  onUpdateSideEffect?: (editor: TiptapEditor) => void
  onContentSync?: (editor: TiptapEditor) => void
}

const DEFAULT_PROSE_CONTENT = "<p></p>"

export function useProseEditorBase(config: ProseEditorBaseConfig) {
  const fallbackContent = config.defaultContent ?? DEFAULT_PROSE_CONTENT
  const editorSurfaceRef = useRef<HTMLDivElement | null>(null)

  const onWordCountChangeRef = useRef(config.onWordCountChange)
  const onContentChangeRef = useRef(config.onContentChange)
  const onUpdateSideEffectRef = useRef(config.onUpdateSideEffect)
  const markTypingOnUpdateRef = useRef(config.markTypingOnUpdate)

  const persistRunner = useMemo(() => createDeferredRunner(SAVE_DEBOUNCE_MS, SAVE_MAX_WAIT_MS), [])
  const wordCountRunner = useMemo(
    () => createDeferredRunner(WORD_COUNT_DEBOUNCE_MS, WORD_COUNT_MAX_WAIT_MS),
    [],
  )

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
    onCreate: ({ editor: currentEditor }) => {
      const { state, view } = currentEditor
      if (!(state.selection instanceof NodeSelection)) return
      const textSelection = Selection.findFrom(state.doc.resolve(0), 1, true)
      if (textSelection) view.dispatch(state.tr.setSelection(textSelection))
    },
  })

  const { caretRef } = useTypingCaret({ editor, editorSurfaceRef, markUiTypingActivity })

  useEditorContentSync(editor, config.content, config.documentId, fallbackContent, config.onContentSync)
  useEditorReadOnly(editor, config.readOnly)
  useEditorReady(editor, config.onEditorReady)

  useEffect(() => {
    onWordCountChangeRef.current = config.onWordCountChange
    onContentChangeRef.current = config.onContentChange
    onUpdateSideEffectRef.current = config.onUpdateSideEffect
    markTypingOnUpdateRef.current = config.markTypingOnUpdate
  }, [config.onWordCountChange, config.onContentChange, config.onUpdateSideEffect, config.markTypingOnUpdate])

  useEffect(() => {
    if (!editor) return

    const persistNow = () => onContentChangeRef.current(editor.getHTML())
    const countNow = () => emitTipTapWordCounts(editor, onWordCountChangeRef.current)

    const onUpdate = () => {
      onUpdateSideEffectRef.current?.(editor)
      if (markTypingOnUpdateRef.current) markUiTypingActivity()
      persistRunner.schedule(persistNow)
      wordCountRunner.schedule(countNow)
    }
    const onSelectionUpdate = () => wordCountRunner.schedule(countNow)
    const flushDeferred = () => {
      persistRunner.flush()
      wordCountRunner.flush()
    }

    editor.on("update", onUpdate)
    editor.on("selectionUpdate", onSelectionUpdate)
    editor.on("blur", flushDeferred)
    return () => {
      editor.off("update", onUpdate)
      editor.off("selectionUpdate", onSelectionUpdate)
      editor.off("blur", flushDeferred)
      flushDeferred()
    }
  }, [editor, persistRunner, wordCountRunner, markUiTypingActivity])

  return { editor, editorSurfaceRef, caretRef, isUiTyping, markUiTypingActivity }
}
