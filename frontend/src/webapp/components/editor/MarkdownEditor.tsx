import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import { Eye, SquarePen } from "lucide-react"
import { MARKDOWN_EDITOR_COMMAND_EVENT, type MarkdownEditorCommand } from "../../../core/editorEvents"
import { countWords, normalizeMarkdownContentForEditing, renderMarkdownToHtml } from "../../../core/markdown"
import "./MarkdownEditor.css"

type MarkdownEditorProps = {
  documentId: string | null
  content: string
  editorFontSize: number
  onContentChange: (nextContent: string) => void
  onWordCountChange?: (payload: { documentWordCount: number; selectedWordCount: number | null }) => void
  onTypingStateChange?: (isTyping: boolean) => void
}

export default function MarkdownEditor({
  documentId,
  content,
  editorFontSize,
  onContentChange,
  onWordCountChange,
  onTypingStateChange,
}: MarkdownEditorProps) {
  const [markdownDraft, setMarkdownDraft] = useState(() => normalizeMarkdownContentForEditing(content))
  const [paneViewMode, setPaneViewMode] = useState<"split" | "editor" | "preview">("split")
  const [paneTransitionTarget, setPaneTransitionTarget] = useState<"editor" | "preview" | "split" | null>(null)
  const [splitRatio, setSplitRatio] = useState(0.5)
  const typingTimeoutRef = useRef<number | null>(null)
  const paneTransitionTimeoutRef = useRef<number | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const layoutRef = useRef<HTMLDivElement | null>(null)

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
    if (!textarea) {
      return
    }

    // Match preview behavior by allowing the page to scroll instead of the textarea itself.
    textarea.style.height = "auto"
    const minHeight = Number.parseFloat(window.getComputedStyle(textarea).minHeight) || 0
    textarea.style.height = `${Math.max(textarea.scrollHeight, minHeight)}px`
  }

  const applyNextContent = (
    nextValue: string,
    nextSelection?: { start: number; end: number },
  ) => {
    setMarkdownDraft(nextValue)
    onContentChange(nextValue)
    markTypingActivity()
    emitWordCounts(nextValue, nextSelection)

    if (!nextSelection) {
      return
    }

    window.requestAnimationFrame(() => {
      const textarea = textareaRef.current
      if (!textarea) {
        return
      }

      textarea.focus()
      textarea.setSelectionRange(nextSelection.start, nextSelection.end)
    })
  }

  const withSelectionWrapped = (
    value: string,
    selectionStart: number,
    selectionEnd: number,
    prefix: string,
    suffix = prefix,
    emptySelectionFallback = "text",
  ) => {
    const selectedText = value.slice(selectionStart, selectionEnd)
    const inner = selectedText || emptySelectionFallback
    const replacement = `${prefix}${inner}${suffix}`
    const nextValue = `${value.slice(0, selectionStart)}${replacement}${value.slice(selectionEnd)}`

    const isEmptySelection = selectionStart === selectionEnd
    const nextStart = isEmptySelection ? selectionStart + prefix.length : selectionStart
    const nextEnd = isEmptySelection ? nextStart + inner.length : selectionStart + replacement.length

    return {
      nextValue,
      selection: {
        start: nextStart,
        end: nextEnd,
      },
    }
  }

  const prefixSelectionLines = (
    value: string,
    selectionStart: number,
    selectionEnd: number,
    prefix: string,
  ) => {
    const lineStart = value.lastIndexOf("\n", Math.max(0, selectionStart - 1)) + 1
    const lineEndBreak = value.indexOf("\n", selectionEnd)
    const lineEnd = lineEndBreak === -1 ? value.length : lineEndBreak

    const block = value.slice(lineStart, lineEnd)
    const lines = block.split("\n")
    const prefixedLines = lines.map((line) => {
      if (!line.trim()) {
        return line
      }

      return line.startsWith(prefix) ? line : `${prefix}${line}`
    })

    const replacement = prefixedLines.join("\n")
    const nextValue = `${value.slice(0, lineStart)}${replacement}${value.slice(lineEnd)}`

    return {
      nextValue,
      selection: {
        start: lineStart,
        end: lineStart + replacement.length,
      },
    }
  }

  const applyMarkdownCommand = (command: MarkdownEditorCommand) => {
    const textarea = textareaRef.current
    if (!textarea) {
      return
    }

    const value = textarea.value
    const selectionStart = textarea.selectionStart
    const selectionEnd = textarea.selectionEnd

    if (command === "heading-1") {
      const result = prefixSelectionLines(value, selectionStart, selectionEnd, "# ")
      applyNextContent(result.nextValue, result.selection)
      return
    }

    if (command === "heading-2") {
      const result = prefixSelectionLines(value, selectionStart, selectionEnd, "## ")
      applyNextContent(result.nextValue, result.selection)
      return
    }

    if (command === "bold") {
      const result = withSelectionWrapped(value, selectionStart, selectionEnd, "**", "**", "bold text")
      applyNextContent(result.nextValue, result.selection)
      return
    }

    if (command === "italic") {
      const result = withSelectionWrapped(value, selectionStart, selectionEnd, "*", "*", "italic text")
      applyNextContent(result.nextValue, result.selection)
      return
    }

    if (command === "inline-code") {
      const result = withSelectionWrapped(value, selectionStart, selectionEnd, "`", "`", "code")
      applyNextContent(result.nextValue, result.selection)
      return
    }

    if (command === "code-block") {
      const result = withSelectionWrapped(value, selectionStart, selectionEnd, "```\n", "\n```", "code")
      applyNextContent(result.nextValue, result.selection)
      return
    }

    if (command === "link") {
      const selectedText = value.slice(selectionStart, selectionEnd) || "link text"
      const replacement = `[${selectedText}](https://)`
      const nextValue = `${value.slice(0, selectionStart)}${replacement}${value.slice(selectionEnd)}`
      const start = selectionStart + selectedText.length + 3
      const end = start + "https://".length
      applyNextContent(nextValue, { start, end })
    }
  }

  const handleMarkdownShortcut = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const hasPrimaryModifier = event.metaKey || event.ctrlKey
    if (!hasPrimaryModifier || event.shiftKey) {
      return
    }

    const key = event.key.toLowerCase()

    if (event.altKey && key === "1") {
      event.preventDefault()
      applyMarkdownCommand("heading-1")
      return
    }

    if (event.altKey && key === "2") {
      event.preventDefault()
      applyMarkdownCommand("heading-2")
      return
    }

    if (event.altKey && key === "c") {
      event.preventDefault()
      applyMarkdownCommand("code-block")
      return
    }

    if (event.altKey) {
      return
    }

    if (key === "b") {
      event.preventDefault()
      applyMarkdownCommand("bold")
      return
    }

    if (key === "i") {
      event.preventDefault()
      applyMarkdownCommand("italic")
      return
    }

    if (key === "e") {
      event.preventDefault()
      applyMarkdownCommand("inline-code")
      return
    }

    if (key === "k") {
      event.preventDefault()
      applyMarkdownCommand("link")
    }
  }

  useEffect(() => {
    const normalized = normalizeMarkdownContentForEditing(content)
    setMarkdownDraft(normalized)
    emitWordCounts(normalized)
  }, [content, documentId])

  useLayoutEffect(() => {
    syncTextareaHeight()
  }, [markdownDraft, splitRatio, paneViewMode, editorFontSize])

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        window.clearTimeout(typingTimeoutRef.current)
      }
      if (paneTransitionTimeoutRef.current) {
        window.clearTimeout(paneTransitionTimeoutRef.current)
      }
      onTypingStateChange?.(false)
    }
  }, [onTypingStateChange])

  useEffect(() => {
    const onMarkdownCommand = (event: Event) => {
      const customEvent = event as CustomEvent<{ command?: MarkdownEditorCommand }>
      const command = customEvent.detail?.command
      if (!command) {
        return
      }

      applyMarkdownCommand(command)
    }

    window.addEventListener(MARKDOWN_EDITOR_COMMAND_EVENT, onMarkdownCommand as EventListener)
    return () => {
      window.removeEventListener(MARKDOWN_EDITOR_COMMAND_EVENT, onMarkdownCommand as EventListener)
    }
  }, [])

  const previewHtml = useMemo(() => {
    return renderMarkdownToHtml(markdownDraft)
  }, [markdownDraft])

  const markdownFontStyle = useMemo(() => {
    const clampedSize = Math.min(84, Math.max(20, editorFontSize))
    const sourceSize = Math.max(14, Math.round(clampedSize * 0.56))
    const previewSize = Math.max(14, Math.round(clampedSize * 0.56))

    return {
      "--markdown-source-font-size": `${sourceSize}px`,
      "--markdown-preview-font-size": `${previewSize}px`,
    } as CSSProperties
  }, [editorFontSize, splitRatio])

  const sourcePaneStyle = useMemo(() => {
    return {
      width: `${Math.round(splitRatio * 1000) / 10}%`,
    } as CSSProperties
  }, [splitRatio])

  const previewPaneStyle = useMemo(() => {
    return {
      width: `${Math.round((1 - splitRatio) * 1000) / 10}%`,
    } as CSSProperties
  }, [splitRatio])

  const clampSplitRatio = (value: number) => {
    return Math.min(0.8, Math.max(0.2, value))
  }

  const updateSplitRatioFromClientX = (clientX: number) => {
    const layout = layoutRef.current
    if (!layout) {
      return
    }

    const bounds = layout.getBoundingClientRect()
    if (bounds.width <= 0) {
      return
    }

    const rawRatio = (clientX - bounds.left) / bounds.width
    setSplitRatio(clampSplitRatio(rawRatio))
  }

  const startDividerDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (paneTransitionTarget) {
      return
    }

    if (window.matchMedia("(max-width: 980px)").matches) {
      return
    }

    event.preventDefault()

    if (paneViewMode !== "split") {
      setPaneViewMode("split")
      setPaneTransitionTarget(null)
      const fallbackRatio = paneViewMode === "editor" ? 0.78 : 0.22
      setSplitRatio(fallbackRatio)
      window.requestAnimationFrame(() => {
        updateSplitRatioFromClientX(event.clientX)
      })
    }

    const pointerId = event.pointerId
    event.currentTarget.setPointerCapture(pointerId)

    const onPointerMove = (moveEvent: PointerEvent) => {
      updateSplitRatioFromClientX(moveEvent.clientX)
    }

    const stopDragging = () => {
      window.removeEventListener("pointermove", onPointerMove)
      window.removeEventListener("pointerup", stopDragging)
      window.removeEventListener("pointercancel", stopDragging)
    }

    window.addEventListener("pointermove", onPointerMove)
    window.addEventListener("pointerup", stopDragging)
    window.addEventListener("pointercancel", stopDragging)
  }

  const togglePaneView = (target: "editor" | "preview") => {
    if (paneTransitionTarget) {
      return
    }

    const TRANSITION_MS = 380

    if (paneTransitionTimeoutRef.current) {
      window.clearTimeout(paneTransitionTimeoutRef.current)
      paneTransitionTimeoutRef.current = null
    }

    setPaneViewMode((current) => {
      if (current === target) {
        setPaneTransitionTarget("split")
        const nextSplit = 0.5

        // Allow browser to apply split mode layout before animating toward center.
        window.requestAnimationFrame(() => {
          setSplitRatio(nextSplit)
        })

        paneTransitionTimeoutRef.current = window.setTimeout(() => {
          setPaneTransitionTarget(null)
          paneTransitionTimeoutRef.current = null
        }, TRANSITION_MS)

        return "split"
      }

      if (current === "split") {
        setPaneTransitionTarget(target)
        // Keep both panes mounted and drive the transition only through width changes.
        setSplitRatio(target === "editor" ? 1 : 0)

        paneTransitionTimeoutRef.current = window.setTimeout(() => {
          setPaneViewMode(target)
          setPaneTransitionTarget(null)
          paneTransitionTimeoutRef.current = null
        }, TRANSITION_MS)

        return current
      }

      return target
    })
  }

  const previewIsFading = paneViewMode === "split" && paneTransitionTarget === "editor"
  const editorIsFading = paneViewMode === "split" && paneTransitionTarget === "preview"
  const dividerIsFading = paneViewMode === "split" && (paneTransitionTarget === "editor" || paneTransitionTarget === "preview")
  const editorIsCollapsed = paneViewMode === "preview"
  const previewIsCollapsed = paneViewMode === "editor"

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

  return (
    <div className="markdown-editor" style={markdownFontStyle} role="region" aria-label="Markdown split editor" ref={layoutRef}>
      <section
        className={`markdown-editor__pane markdown-editor__pane--source ${editorIsFading ? "markdown-editor__pane--fading" : ""} ${editorIsCollapsed ? "markdown-editor__pane--collapsed" : ""}`.trim()}
        style={sourcePaneStyle}
        aria-label="Markdown source"
      >
        <button
          type="button"
          className="markdown-editor__pane-label"
          onClick={() => {
            togglePaneView("editor")
          }}
        >
          <SquarePen size={14} strokeWidth={2} aria-hidden="true" />
          <span>Editor</span>
        </button>
        <textarea
          ref={textareaRef}
          className="markdown-editor__textarea"
          value={markdownDraft}
          onKeyDown={handleMarkdownShortcut}
          onChange={(event) => {
            syncTextareaHeight()
            const nextValue = event.target.value
            setMarkdownDraft(nextValue)
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
          placeholder="# Start writing in Markdown"
          spellCheck={false}
          aria-label="Markdown editor"
        />
      </section>

      <button
        type="button"
        className={`markdown-editor__divider ${dividerIsFading ? "markdown-editor__divider--fading" : ""} ${paneViewMode === "editor" ? "markdown-editor__divider--single-editor" : ""} ${paneViewMode === "preview" ? "markdown-editor__divider--single-preview" : ""}`.trim()}
        aria-label="Resize markdown editor panes"
        onPointerDown={startDividerDrag}
      >
        <span className="markdown-editor__divider-line" aria-hidden="true" />
      </button>

      <section
        className={`markdown-editor__pane markdown-editor__pane--preview ${previewIsFading ? "markdown-editor__pane--fading" : ""} ${previewIsCollapsed ? "markdown-editor__pane--collapsed" : ""}`.trim()}
        style={previewPaneStyle}
        aria-label="Markdown preview"
      >
        <button
          type="button"
          className="markdown-editor__pane-label"
          onClick={() => {
            togglePaneView("preview")
          }}
        >
          <Eye size={14} strokeWidth={2} aria-hidden="true" />
          <span>Preview</span>
        </button>
        <div
          className="markdown-editor__preview"
          dangerouslySetInnerHTML={{ __html: previewHtml }}
        />
      </section>
    </div>
  )
}
