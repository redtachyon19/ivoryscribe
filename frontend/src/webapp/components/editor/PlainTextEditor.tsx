import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react"
import {
  APP_PROJECT_SEARCH_FOCUS_EVENT,
  APP_SPELL_CHECK_FOCUS_EVENT,
  type ProjectSearchFocusDetail,
  type SpellCheckFocusDetail,
} from "../../../core/events/editorEvents"
import { countWords } from "../../../core/utils/markdown"
import { useEditorCommandBus } from "./hooks/useEditorCommandBus"
import "./PlainTextEditor.css"

type PlainTextEditorProps = {
  documentId: string | null
  content: string
  editorFontSize: number
  onContentChange: (nextContent: string) => void
  onWordCountChange?: (payload: { documentWordCount: number; selectedWordCount: number | null }) => void
  onTypingStateChange?: (isTyping: boolean) => void
}

export default function PlainTextEditor({
  documentId,
  content,
  editorFontSize,
  onContentChange,
  onWordCountChange,
  onTypingStateChange,
}: PlainTextEditorProps) {
  useEditorCommandBus(null)
  const [draft, setDraft] = useState(content)
  const typingTimeoutRef = useRef<number | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  const emitWordCounts = (value: string, selection?: { start: number; end: number }) => {
    const documentWordCount = countWords(value)
    const selectedWordCount =
      selection && selection.start !== selection.end
        ? countWords(value.slice(selection.start, selection.end))
        : null

    onWordCountChange?.({
      documentWordCount,
      selectedWordCount,
    })
  }

  const syncTextareaHeight = () => {
    const textarea = textareaRef.current
    if (!textarea) return

    textarea.style.height = "auto"
    const minHeight = Number.parseFloat(window.getComputedStyle(textarea).minHeight) || 0
    textarea.style.height = `${Math.max(textarea.scrollHeight, minHeight)}px`
  }

  const markTypingActivity = () => {
    onTypingStateChange?.(true)

    if (typingTimeoutRef.current) {
      window.clearTimeout(typingTimeoutRef.current)
    }

    typingTimeoutRef.current = window.setTimeout(() => {
      onTypingStateChange?.(false)
      typingTimeoutRef.current = null
    }, 450)
  }

  useEffect(() => {
    setDraft(content)
    emitWordCounts(content)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, documentId])

  useLayoutEffect(() => {
    syncTextareaHeight()
  }, [draft, editorFontSize])

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        window.clearTimeout(typingTimeoutRef.current)
      }
      onTypingStateChange?.(false)
    }
  }, [onTypingStateChange])

  useEffect(() => {
    const onSpellCheckFocus = (event: Event) => {
      const customEvent = event as CustomEvent<SpellCheckFocusDetail>
      const detail = customEvent.detail

      if (!detail || detail.documentType !== "plaintext" || detail.documentId !== documentId) {
        return
      }

      const textarea = textareaRef.current
      if (!textarea) return

      const valueLength = textarea.value.length
      const start = Math.max(0, Math.min(valueLength, detail.start))
      const end = Math.max(start, Math.min(valueLength, detail.end))

      textarea.focus()
      textarea.setSelectionRange(start, end)
      textarea.scrollIntoView({ behavior: "smooth", block: "center" })
    }

    window.addEventListener(APP_SPELL_CHECK_FOCUS_EVENT, onSpellCheckFocus as EventListener)
    return () => {
      window.removeEventListener(APP_SPELL_CHECK_FOCUS_EVENT, onSpellCheckFocus as EventListener)
    }
  }, [documentId])

  useEffect(() => {
    const onProjectSearchFocus = (event: Event) => {
      const customEvent = event as CustomEvent<ProjectSearchFocusDetail>
      const detail = customEvent.detail

      if (!detail || detail.documentType !== "plaintext" || detail.documentId !== documentId) {
        return
      }

      const textarea = textareaRef.current
      if (!textarea) return

      const valueLength = textarea.value.length
      const start = Math.max(0, Math.min(valueLength, detail.start))
      const end = Math.max(start, Math.min(valueLength, detail.end))

      textarea.focus()
      textarea.setSelectionRange(start, end)
      textarea.scrollIntoView({ behavior: "smooth", block: "center" })
    }

    window.addEventListener(APP_PROJECT_SEARCH_FOCUS_EVENT, onProjectSearchFocus as EventListener)
    return () => {
      window.removeEventListener(APP_PROJECT_SEARCH_FOCUS_EVENT, onProjectSearchFocus as EventListener)
    }
  }, [documentId])

  const fontStyle = {
    "--plaintext-font-size": `${Math.max(14, Math.round(Math.min(84, Math.max(20, editorFontSize)) * 0.56))}px`,
  } as CSSProperties

  return (
    <div className="plaintext-editor" style={fontStyle} role="region" aria-label="Plain-text editor">
      <textarea
        ref={textareaRef}
        className="plaintext-editor__textarea"
        value={draft}
        onChange={(event) => {
          syncTextareaHeight()
          const nextValue = event.target.value
          setDraft(nextValue)
          onContentChange(nextValue)
          markTypingActivity()
          emitWordCounts(nextValue, {
            start: event.target.selectionStart,
            end: event.target.selectionEnd,
          })
        }}
        onSelect={(event) => {
          emitWordCounts(event.currentTarget.value, {
            start: event.currentTarget.selectionStart,
            end: event.currentTarget.selectionEnd,
          })
        }}
        placeholder="Start typing…"
        spellCheck={true}
        autoCorrect="on"
        autoCapitalize="sentences"
        aria-label="Plain-text content"
      />
    </div>
  )
}
