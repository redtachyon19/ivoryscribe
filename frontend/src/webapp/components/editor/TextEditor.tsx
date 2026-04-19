import { useEffect, useState, useRef, type CSSProperties } from "react"
import { useEditor, EditorContent, type Editor as TiptapEditor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Highlight from "@tiptap/extension-highlight"
import {
  APP_PROJECT_SEARCH_FOCUS_EVENT,
  APP_SPELL_CHECK_FOCUS_EVENT,
  EDITOR_COMMAND_EVENT,
  EDITOR_FONT_FAMILY_CHANGE_EVENT,
  EDITOR_FONT_SIZE_CHANGE_EVENT,
  EDITOR_FONT_SIZE_SET_EVENT,
  type EditorCommand,
  type ProjectSearchFocusDetail,
  type SpellCheckFocusDetail,
} from "../../../core/editorEvents"
import { countWords } from "../../../core/markdown"
import { FlagRail } from "./FlagRail"
import { useFlagRail } from "./hooks/useFlagRail"
import { useTypingCaret } from "./hooks/useTypingCaret"
import { useTypingState } from "./hooks/useTypingState"
import "./TextEditor.css"

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

const MIN_FONT_SIZE = 10
const MAX_FONT_SIZE = 84
const DEFAULT_FONT_SIZE = 32
const DEFAULT_FONT_FAMILY = '"Times", "Times New Roman", serif'
const DEFAULT_DOCUMENT_CONTENT = "<p></p>"
const BODY_PLACEHOLDER = "Start your epic..."
const SPELL_WORD_MATCHER = /[A-Za-z]+(?:['’][A-Za-z]+)*/g

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

type TextWordHit = {
  node: Text
  start: number
  end: number
}

function normalizeSpellWord(value: string) {
  return value.replace(/’/g, "'").toLowerCase()
}

function findTextWordHit(root: Node, normalizedWord: string, targetOccurrence: number): TextWordHit | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let currentNode = walker.nextNode()
  let currentOccurrence = 0

  while (currentNode) {
    const textNode = currentNode as Text
    const value = textNode.nodeValue ?? ""
    const matcher = new RegExp(SPELL_WORD_MATCHER.source, SPELL_WORD_MATCHER.flags)
    let next = matcher.exec(value)

    while (next) {
      const [word] = next
      const normalizedCandidate = normalizeSpellWord(word)

      if (normalizedCandidate === normalizedWord) {
        if (currentOccurrence === targetOccurrence) {
          const start = next.index
          return {
            node: textNode,
            start,
            end: start + word.length,
          }
        }

        currentOccurrence += 1
      }

      next = matcher.exec(value)
    }

    currentNode = walker.nextNode()
  }

  return null
}

function findTextQueryHit(root: Node, query: string, targetOccurrence: number): TextWordHit | null {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) {
    return null
  }

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let currentNode = walker.nextNode()
  let currentOccurrence = 0

  while (currentNode) {
    const textNode = currentNode as Text
    const value = textNode.nodeValue ?? ""
    const lowerValue = value.toLowerCase()
    let fromIndex = 0

    while (fromIndex < lowerValue.length) {
      const start = lowerValue.indexOf(normalizedQuery, fromIndex)
      if (start === -1) {
        break
      }

      if (currentOccurrence === targetOccurrence) {
        return {
          node: textNode,
          start,
          end: start + normalizedQuery.length,
        }
      }

      currentOccurrence += 1
      fromIndex = start + Math.max(1, normalizedQuery.length)
    }

    currentNode = walker.nextNode()
  }

  return null
}

export default function TextEditor({
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
        spellcheck: "true",
        autocorrect: "on",
        autocapitalize: "sentences",
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

    const onSpellCheckFocus = (event: Event) => {
      if (!editor || !documentId) {
        return
      }

      const customEvent = event as CustomEvent<SpellCheckFocusDetail>
      const detail = customEvent.detail
      if (!detail || detail.documentType !== "text" || detail.documentId !== documentId) {
        return
      }

      const editorDom = editor.view.dom
      const hit = findTextWordHit(editorDom, detail.normalizedWord, detail.occurrenceIndex)
      if (!hit) {
        return
      }

      editor.commands.focus()

      const selection = window.getSelection()
      if (!selection) {
        return
      }

      const range = document.createRange()
      range.setStart(hit.node, hit.start)
      range.setEnd(hit.node, hit.end)
      selection.removeAllRanges()
      selection.addRange(range)

      const anchor = hit.node.parentElement ?? editorDom
      anchor.scrollIntoView({ behavior: "smooth", block: "center" })
    }

    const onProjectSearchFocus = (event: Event) => {
      if (!editor || !documentId) {
        return
      }

      const customEvent = event as CustomEvent<ProjectSearchFocusDetail>
      const detail = customEvent.detail
      if (!detail || detail.documentType !== "text" || detail.documentId !== documentId) {
        return
      }

      const editorDom = editor.view.dom
      const hit = findTextQueryHit(editorDom, detail.query, detail.occurrenceIndex)
      if (!hit) {
        return
      }

      editor.commands.focus()

      const selection = window.getSelection()
      if (!selection) {
        return
      }

      const range = document.createRange()
      range.setStart(hit.node, hit.start)
      range.setEnd(hit.node, hit.end)
      selection.removeAllRanges()
      selection.addRange(range)

      const anchor = hit.node.parentElement ?? editorDom
      anchor.scrollIntoView({ behavior: "smooth", block: "center" })
    }

    window.addEventListener(EDITOR_FONT_SIZE_CHANGE_EVENT, onFontSizeChange as EventListener)
    window.addEventListener(EDITOR_FONT_SIZE_SET_EVENT, onFontSizeSet as EventListener)
    window.addEventListener(EDITOR_FONT_FAMILY_CHANGE_EVENT, onFontFamilyChange as EventListener)
    window.addEventListener(EDITOR_COMMAND_EVENT, onEditorCommand as EventListener)
    window.addEventListener(APP_SPELL_CHECK_FOCUS_EVENT, onSpellCheckFocus as EventListener)
    window.addEventListener(APP_PROJECT_SEARCH_FOCUS_EVENT, onProjectSearchFocus as EventListener)

    return () => {
      window.removeEventListener(EDITOR_FONT_SIZE_CHANGE_EVENT, onFontSizeChange as EventListener)
      window.removeEventListener(EDITOR_FONT_SIZE_SET_EVENT, onFontSizeSet as EventListener)
      window.removeEventListener(EDITOR_FONT_FAMILY_CHANGE_EVENT, onFontFamilyChange as EventListener)
      window.removeEventListener(EDITOR_COMMAND_EVENT, onEditorCommand as EventListener)
      window.removeEventListener(APP_SPELL_CHECK_FOCUS_EVENT, onSpellCheckFocus as EventListener)
      window.removeEventListener(APP_PROJECT_SEARCH_FOCUS_EVENT, onProjectSearchFocus as EventListener)
    }
  }, [editor, documentId])

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
