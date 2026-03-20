import { useEffect, useState, useRef, type CSSProperties } from "react"
import { useEditor, EditorContent, type Editor as TiptapEditor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Highlight from "@tiptap/extension-highlight"
import {
  EDITOR_COMMAND_EVENT,
  EDITOR_FONT_FAMILY_CHANGE_EVENT,
  EDITOR_FONT_SIZE_CHANGE_EVENT,
  EDITOR_FONT_SIZE_SET_EVENT,
  type EditorCommand,
} from "../../../core/editorEvents"
import { countWords } from "../../../core/markdown"
import { FlagRail } from "./FlagRail"
import { useFlagRail } from "./hooks/useFlagRail"
import { useTypingCaret } from "./hooks/useTypingCaret"
import { useTypingState } from "./hooks/useTypingState"
import "./Editor.css"

type FontSizeChangeDetail = {
  delta: number
}

type FontSizeSetDetail = {
  value: number
}

type FontFamilyChangeDetail = {
  fontFamily: string
}

type EditorCommandDetail = {
  command: EditorCommand
}

const MIN_FONT_SIZE = 20
const MAX_FONT_SIZE = 84
const DEFAULT_FONT_SIZE = 32
const DEFAULT_FONT_FAMILY = '"Times", "Times New Roman", serif'
const DEFAULT_DOCUMENT_CONTENT = "<p></p>"
const BODY_PLACEHOLDER = "Start your epic..."

type EditorProps = {
  documentId: string | null
  documentTitle: string
  hideDocumentTitle?: boolean
  editorFontSize: number
  content: string
  flagsEnabled: boolean
  onDocumentTitleChange: (nextTitle: string) => void
  onContentChange: (nextContent: string) => void
  onWordCountChange?: (payload: { documentWordCount: number; selectedWordCount: number | null }) => void
  onTypingStateChange?: (isTyping: boolean) => void
}

export default function Editor({
  documentId,
  documentTitle,
  hideDocumentTitle = false,
  editorFontSize,
  content,
  flagsEnabled,
  onDocumentTitleChange,
  onContentChange,
  onWordCountChange,
  onTypingStateChange,
}: EditorProps) {
  const editorSurfaceRef = useRef<HTMLDivElement | null>(null)
  const [fontSize, setFontSize] = useState(() =>
    Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, editorFontSize || DEFAULT_FONT_SIZE)),
  )
  const [fontFamily, setFontFamily] = useState(DEFAULT_FONT_FAMILY)
  const [titleDraft, setTitleDraft] = useState(documentTitle)

  const { isUiTyping, markUiTypingActivity } = useTypingState({ onTypingStateChange })

  const editor = useEditor({
    extensions: [
      StarterKit,
      Highlight.configure({
        multicolor: true,
      }),
    ],
    editorProps: {
      attributes: {
        "data-placeholder": BODY_PLACEHOLDER,
      },
    },
    content: content || DEFAULT_DOCUMENT_CONTENT,
    // Pushes updates up so App can persist text per tab/project.
    onUpdate: ({ editor: currentEditor }) => {
      syncEmptyState(currentEditor)
      onContentChange(currentEditor.getHTML())
      emitWordCounts(currentEditor)
    },
  })

  const {
    activeDocumentKey,
    flaggedAnchors,
    flaggedAnchorsByDocument,
    flaggedLineTops,
    hoverLineTop,
    hoverLineAnchor,
    isFlagRailHovered,
    setFlaggedAnchorsByDocument,
    setHighlightRangesByDocument,
    setIsFlagRailHovered,
    setHoverLineTop,
    setHoverLineAnchor,
    updateHoverLineFromPointer,
    highlightSelectionIfPresent,
    removeHighlightForAnchor,
  } = useFlagRail({
    editor,
    flagsEnabled,
    documentId,
    editorSurfaceRef,
  })

  const { caretRef } = useTypingCaret({
    editor,
    editorSurfaceRef,
    markUiTypingActivity,
  })

  const emitWordCounts = (currentEditor: TiptapEditor) => {
    const documentWordCount = countWords(currentEditor.getText())
    const { from, to } = currentEditor.state.selection
    const selectedWordCount =
      from === to ? null : countWords(currentEditor.state.doc.textBetween(from, to, " "))

    onWordCountChange?.({
      documentWordCount,
      selectedWordCount,
    })
  }

  const syncEmptyState = (currentEditor: TiptapEditor) => {
    try {
      const editorView = currentEditor.view
      const editorDom = editorView?.dom

      if (!editorDom) {
        return
      }

      editorDom.setAttribute("data-empty", currentEditor.isEmpty ? "true" : "false")
    } catch {
      // TipTap can momentarily expose an editor instance before internals are fully ready.
    }
  }

  useEffect(() => {
    setTitleDraft(documentTitle)
  }, [documentTitle, documentId])

  useEffect(() => {
    if (!editor) {
      return
    }

    syncEmptyState(editor)
    emitWordCounts(editor)
  }, [editor])

  useEffect(() => {
    if (!editor) {
      return
    }

    // Keep TipTap in sync when active tab/project changes.
    const nextContent = content || DEFAULT_DOCUMENT_CONTENT
    if (editor.getHTML() === nextContent) {
      return
    }

    // Avoid re-triggering onUpdate during controlled content sync.
    editor.commands.setContent(nextContent, { emitUpdate: false })
    syncEmptyState(editor)
    emitWordCounts(editor)
  }, [editor, content, documentId])

  useEffect(() => {
    if (!editor) {
      return
    }

    const onSelectionUpdate = () => {
      emitWordCounts(editor)
    }

    editor.on("selectionUpdate", onSelectionUpdate)
    return () => {
      editor.off("selectionUpdate", onSelectionUpdate)
    }
  }, [editor, onWordCountChange])

  useEffect(() => {
    setFontSize(Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, editorFontSize || DEFAULT_FONT_SIZE)))
  }, [editorFontSize])

  useEffect(() => {
    // Global menu controls dispatch these events from outside this component.
    const onFontSizeChange = (event: Event) => {
      const customEvent = event as CustomEvent<FontSizeChangeDetail>
      const delta = customEvent.detail?.delta ?? 0

      if (!delta) {
        return
      }

      setFontSize((currentSize) => {
        const nextSize = currentSize + delta
        return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, nextSize))
      })
    }

    const onFontSizeSet = (event: Event) => {
      const customEvent = event as CustomEvent<FontSizeSetDetail>
      const value = customEvent.detail?.value

      if (typeof value !== "number" || Number.isNaN(value)) {
        return
      }

      setFontSize(Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, value)))
    }

    const onFontFamilyChange = (event: Event) => {
      const customEvent = event as CustomEvent<FontFamilyChangeDetail>
      const nextFontFamily = customEvent.detail?.fontFamily

      if (!nextFontFamily) {
        return
      }

      setFontFamily(nextFontFamily)
    }

    const onEditorCommand = async (event: Event) => {
      if (!editor) {
        return
      }

      const customEvent = event as CustomEvent<EditorCommandDetail>
      const command = customEvent.detail?.command
      if (!command) {
        return
      }

      editor.commands.focus()

      if (command === "undo") {
        editor.chain().focus().undo().run()
        return
      }

      if (command === "redo") {
        editor.chain().focus().redo().run()
        return
      }

      if (command === "bold") {
        editor.chain().focus().toggleBold().run()
        return
      }

      if (command === "italic") {
        editor.chain().focus().toggleItalic().run()
        return
      }

      if (command === "underline") {
        if (typeof document !== "undefined") {
          document.execCommand("underline")
        }
        return
      }

      if (command === "copy") {
        if (typeof document !== "undefined") {
          document.execCommand("copy")
        }
        return
      }

      if (command === "cut") {
        if (typeof document !== "undefined") {
          document.execCommand("cut")
        }
        return
      }

      if (command === "select-all") {
        editor.commands.selectAll()
        return
      }

      if (command === "delete") {
        editor.commands.deleteSelection()
        return
      }

      if (command === "paste") {
        if (typeof document !== "undefined") {
          const pasted = document.execCommand("paste")
          if (pasted) {
            return
          }
        }

        if (typeof navigator !== "undefined" && navigator.clipboard?.readText) {
          try {
            const text = await navigator.clipboard.readText()
            if (text) {
              editor.chain().focus().insertContent(text).run()
            }
          } catch {
            // no-op when clipboard permission is unavailable
          }
        }
      }
    }

    window.addEventListener(EDITOR_FONT_SIZE_CHANGE_EVENT, onFontSizeChange as EventListener)
    window.addEventListener(EDITOR_FONT_SIZE_SET_EVENT, onFontSizeSet as EventListener)
    window.addEventListener(EDITOR_FONT_FAMILY_CHANGE_EVENT, onFontFamilyChange as EventListener)
    window.addEventListener(EDITOR_COMMAND_EVENT, onEditorCommand as EventListener)

    return () => {
      window.removeEventListener(EDITOR_FONT_SIZE_CHANGE_EVENT, onFontSizeChange as EventListener)
      window.removeEventListener(EDITOR_FONT_SIZE_SET_EVENT, onFontSizeSet as EventListener)
      window.removeEventListener(EDITOR_FONT_FAMILY_CHANGE_EVENT, onFontFamilyChange as EventListener)
      window.removeEventListener(EDITOR_COMMAND_EVENT, onEditorCommand as EventListener)
    }
  }, [editor])

  useEffect(() => {
    // Recompute caret position when typography changes alter layout.
    window.dispatchEvent(new Event("resize"))
  }, [fontSize, fontFamily])

  const currentLineTop = hoverLineTop
  const currentLineAnchor = hoverLineAnchor
  const showFlagRailUi = flagsEnabled && (isFlagRailHovered || hoverLineTop !== null)
  const shouldShowCreateFlag =
    showFlagRailUi &&
    !isUiTyping &&
    currentLineTop !== null &&
    currentLineAnchor !== null &&
    !flaggedAnchors.has(currentLineAnchor)

  return (
    <div
      className="editor-container"
      ref={editorSurfaceRef}
      style={{ fontSize: `${fontSize}px`, "--editor-body-font": fontFamily } as CSSProperties}
      onMouseMove={(event) => {
        if (!flagsEnabled) {
          return
        }

        const foundLine = updateHoverLineFromPointer(event.clientY)
        if (!foundLine) {
          setHoverLineTop(null)
          setHoverLineAnchor(null)
        }
      }}
      onMouseLeave={() => {
        if (!flagsEnabled) {
          return
        }

        setIsFlagRailHovered(false)
        setHoverLineTop(null)
        setHoverLineAnchor(null)
      }}
    >
      {!hideDocumentTitle ? (
        <input
          className="editor-document-title"
          value={titleDraft}
          onChange={(event) => {
            setTitleDraft(event.target.value)
            markUiTypingActivity()
          }}
          onBlur={() => {
            onDocumentTitleChange(titleDraft)
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
              onDocumentTitleChange(titleDraft)
              event.currentTarget.blur()
              return
            }

            if (event.key === "Escape") {
              event.preventDefault()
              setTitleDraft(documentTitle)
              event.currentTarget.blur()
              return
            }

            if (
              !event.metaKey &&
              !event.ctrlKey &&
              !event.altKey &&
              (event.key.length === 1 || event.key === "Backspace" || event.key === "Delete")
            ) {
              markUiTypingActivity()
            }
          }}
          aria-label="Document title"
        />
      ) : null}
      <EditorContent editor={editor} />
      <FlagRail
        flagsEnabled={flagsEnabled}
        activeDocumentKey={activeDocumentKey}
        flaggedAnchorsByDocument={flaggedAnchorsByDocument}
        flaggedLineTops={flaggedLineTops}
        showFlagRailUi={showFlagRailUi}
        isUiTyping={isUiTyping}
        shouldShowCreateFlag={shouldShowCreateFlag}
        currentLineTop={currentLineTop}
        currentLineAnchor={currentLineAnchor}
        flaggedAnchors={flaggedAnchors}
        setIsFlagRailHovered={setIsFlagRailHovered}
        clearHoverState={() => {
          setHoverLineTop(null)
          setHoverLineAnchor(null)
        }}
        updateHoverLineFromPointer={updateHoverLineFromPointer}
        onRemoveFlag={(anchor) => {
          removeHighlightForAnchor(anchor)

          setFlaggedAnchorsByDocument((current) => {
            const existing = current[activeDocumentKey] ?? []
            const next = existing.filter((value) => value !== anchor)

            if (next.length === existing.length) {
              return current
            }

            return {
              ...current,
              [activeDocumentKey]: next,
            }
          })

          setHighlightRangesByDocument((current) => {
            const existing = current[activeDocumentKey]
            if (!existing || !existing[anchor]) {
              return current
            }

            const next = { ...existing }
            delete next[anchor]

            return {
              ...current,
              [activeDocumentKey]: next,
            }
          })
        }}
        onCreateFlag={(anchor) => {
          const highlightedRange = highlightSelectionIfPresent()

          setFlaggedAnchorsByDocument((current) => {
            const existing = current[activeDocumentKey] ?? []
            if (existing.includes(anchor)) {
              return current
            }

            return {
              ...current,
              [activeDocumentKey]: [...existing, anchor],
            }
          })

          if (highlightedRange) {
            setHighlightRangesByDocument((current) => {
              const existing = current[activeDocumentKey] ?? {}

              return {
                ...current,
                [activeDocumentKey]: {
                  ...existing,
                  [anchor]: highlightedRange,
                },
              }
            })
          }
        }}
      />
      <div className="typing-caret typing-caret--hidden" ref={caretRef} aria-hidden="true" />
    </div>
  )
}
