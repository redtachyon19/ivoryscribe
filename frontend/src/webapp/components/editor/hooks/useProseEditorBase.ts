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

import { useEffect, useMemo, useRef } from "react"
import { useEditor, type Editor as TiptapEditor, type Extensions } from "@tiptap/react"
import { NodeSelection, Selection } from "@tiptap/pm/state"
import { useTypingState } from "./useTypingState"
import { useTypingCaret } from "./useTypingCaret"
import { useEditorContentSync, useEditorReadOnly, useEditorReady } from "./useEditorLifecycle"
import { normalizePastedFormatting } from "../utils/pasteNormalization"
import { emitTipTapWordCounts } from "../utils/wordCount"

type WordCountPayload = { documentWordCount: number; selectedWordCount: number | null }

// The expensive per-keystroke work — serializing the WHOLE doc with getHTML()
// to persist it, and walking the WHOLE doc twice for word counts — used to run
// synchronously on every keystroke. During a fast burst that saturates the main
// thread and starves the caret's requestAnimationFrame glide (the "typing lags
// but paste doesn't" symptom: paste is ONE transaction, a burst is N). These
// debounce that derived/persisted work onto a short trailing window so the
// hot path is just ProseMirror's own (already-applied) DOM edit. The visible
// text is never delayed — only the save + counters wait, and they're flushed on
// blur/teardown (below) so nothing is lost.
const SAVE_DEBOUNCE_MS = 160
// Force a save at least this often during ONE unbroken burst of typing, so a
// crash mid-paragraph can't lose more than this much work even if the user
// never pauses long enough to trip the trailing debounce.
const SAVE_MAX_WAIT_MS = 1200
const WORD_COUNT_DEBOUNCE_MS = 150
const WORD_COUNT_MAX_WAIT_MS = 1200

type DeferredRunner = {
  /** Schedule a thunk on the trailing edge; the most-recently scheduled thunk
   *  wins (older pending work is superseded, not queued). */
  schedule: (run: () => void) => void
  /** Run the pending thunk now (used on blur / teardown). */
  flush: () => void
  /** Drop the pending thunk without running it. */
  cancel: () => void
}

/** A trailing debounce that defers a *thunk* (so the caller's closure — which
 *  may read refs — is built at the call site, i.e. in an event handler, not
 *  during render). Includes a `maxWait` ceiling so continuous activity still
 *  flushes periodically, plus a manual `flush`. */
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

  // Latest config callbacks held in refs so the editor event listeners (set up
  // once per editor in an effect, below) always call the current closures even
  // though callers commonly pass fresh inline arrows every render.
  const onWordCountChangeRef = useRef(config.onWordCountChange)
  const onContentChangeRef = useRef(config.onContentChange)
  const onUpdateSideEffectRef = useRef(config.onUpdateSideEffect)
  const markTypingOnUpdateRef = useRef(config.markTypingOnUpdate)

  // Trailing debouncers for the heavy per-keystroke work. Created once; the
  // thunks they run are built in the event handlers (effect scope), not here.
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
      // When a document begins with a selectable node (e.g. an image),
      // ProseMirror's default `Selection.atStart` lands a NodeSelection on it.
      // In Drafting that's invisible (images are non-interactive), but mounting
      // a fresh interactive editor — e.g. toggling Draft → Typewriter — renders
      // that auto-selection as a highlight ring. Collapse any initial node
      // selection to a plain text cursor so nothing looks selected until the
      // user actually clicks the image.
      const { state, view } = currentEditor
      if (!(state.selection instanceof NodeSelection)) return
      const textSelection = Selection.findFrom(state.doc.resolve(0), 1, true)
      if (textSelection) view.dispatch(state.tr.setSelection(textSelection))
    },
    // `update` handling is attached as an editor event listener in an effect
    // (below) rather than here, so its handlers run in effect scope — that's
    // where reading the latest-callback refs is allowed, and it lets the heavy
    // work be debounced off the keystroke hot path.
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

  /* ── Editor update / selection / blur wiring ──
       Attached as editor event listeners (not via useEditor's onUpdate option)
       so the handlers live in effect scope, where reading the latest-callback
       refs is allowed. The cheap, must-be-immediate work (empty-state attr,
       typing-state) runs synchronously; the expensive whole-doc work (serialize
       + persist, word counts) is debounced off the keystroke hot path so a fast
       burst can't starve the caret's rAF glide. Selection changes (incl. every
       keystroke, which moves the cursor; and click-drag selecting) also recount,
       so they share the same debounce. Blur and teardown flush the pending tail
       immediately — tab switches blur BEFORE activeId changes and the save
       targets this editor's captured id (setTabContentById), so a late flush
       always lands on the right document. ── */
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
