import { useEffect, useMemo, useRef, useState } from "react"
import { useEditor, EditorContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Highlight from "@tiptap/extension-highlight"
import { Flag, FlagOff } from "lucide-react"
import {
  EDITOR_COMMAND_EVENT,
  EDITOR_FONT_FAMILY_CHANGE_EVENT,
  EDITOR_FONT_SIZE_CHANGE_EVENT,
  EDITOR_FONT_SIZE_SET_EVENT,
  type EditorCommand,
} from "./core/editorEvents"
import { countWords } from "./core/markdown"
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

type HighlightRange = {
  from: number
  to: number
}

const MIN_FONT_SIZE = 20
const MAX_FONT_SIZE = 84
const DEFAULT_FONT_SIZE = 32
const DEFAULT_FONT_FAMILY = '"Times", "Times New Roman", serif'
const DEFAULT_DOCUMENT_CONTENT = "<p></p>"
const BODY_PLACEHOLDER = "Start your epic..."
const FLAG_HIGHLIGHT_COLOR = "rgba(239, 68, 68, 0.3)"

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
  const caretRef = useRef<HTMLDivElement | null>(null)
  const typingUiTimeoutRef = useRef<number | null>(null)
  const [hoverLineTop, setHoverLineTop] = useState<number | null>(null)
  const [hoverLineAnchor, setHoverLineAnchor] = useState<number | null>(null)
  const [isFlagRailHovered, setIsFlagRailHovered] = useState(false)
  const [isUiTyping, setIsUiTyping] = useState(false)
  const [flaggedAnchorsByDocument, setFlaggedAnchorsByDocument] = useState<Record<string, number[]>>({})
  const [highlightRangesByDocument, setHighlightRangesByDocument] = useState<Record<string, Record<number, HighlightRange>>>({})
  const [flaggedLineTops, setFlaggedLineTops] = useState<Record<number, number>>({})
  const [fontSize, setFontSize] = useState(() =>
    Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, editorFontSize || DEFAULT_FONT_SIZE)),
  )
  const [fontFamily, setFontFamily] = useState(DEFAULT_FONT_FAMILY)
  const [titleDraft, setTitleDraft] = useState(documentTitle)
  const activeDocumentKey = documentId ?? "__default_document__"
  const flaggedAnchors = useMemo(
    () => new Set(flaggedAnchorsByDocument[activeDocumentKey] ?? []),
    [flaggedAnchorsByDocument, activeDocumentKey],
  )

  const emitWordCounts = (currentEditor: NonNullable<typeof editor>) => {
    const documentWordCount = countWords(currentEditor.getText())
    const { from, to } = currentEditor.state.selection
    const selectedWordCount =
      from === to ? null : countWords(currentEditor.state.doc.textBetween(from, to, " "))

    onWordCountChange?.({
      documentWordCount,
      selectedWordCount,
    })
  }

  const highlightSelectionIfPresent = () => {
    if (!editor) {
      return null
    }

    const { from, to } = editor.state.selection
    if (from === to) {
      return null
    }

    editor.chain().focus().setHighlight({ color: FLAG_HIGHLIGHT_COLOR }).run()
    return { from, to }
  }

  const removeHighlightForAnchor = (anchor: number) => {
    if (!editor) {
      return
    }

    const range = highlightRangesByDocument[activeDocumentKey]?.[anchor]
    if (!range) {
      return
    }

    const { from, to } = range
    if (from >= to) {
      return
    }

    const previousSelection = editor.state.selection

    try {
      editor
        .chain()
        .focus()
        .setTextSelection({ from, to })
        .unsetHighlight()
        .setTextSelection({ from: previousSelection.from, to: previousSelection.to })
        .run()
    } catch {
      // no-op when mapped positions are no longer valid
    }
  }

  const markUiTypingActivity = () => {
    setIsUiTyping(true)
    onTypingStateChange?.(true)

    if (typingUiTimeoutRef.current) {
      window.clearTimeout(typingUiTimeoutRef.current)
    }

    typingUiTimeoutRef.current = window.setTimeout(() => {
      setIsUiTyping(false)
      onTypingStateChange?.(false)
      typingUiTimeoutRef.current = null
    }, 450)
  }

  const syncEmptyState = (currentEditor: Parameters<NonNullable<Parameters<typeof useEditor>[0]["onUpdate"]>>[0]["editor"]) => {
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
    // Hide transient UI while switching active documents.
    setHoverLineAnchor(null)
    setHoverLineTop(null)
    setIsFlagRailHovered(false)
    setFlaggedLineTops({})
  }, [documentId])

  useEffect(() => {
    if (flagsEnabled) {
      return
    }

    // Immediately clear hover-only flag affordances when feature is turned off.
    setIsFlagRailHovered(false)
    setHoverLineTop(null)
    setHoverLineAnchor(null)
  }, [flagsEnabled])

  const updateHoverLineFromPointer = (clientY: number) => {
    if (!editor || !flagsEnabled) {
      return false
    }

    const editorSurface = editorSurfaceRef.current
    if (!editorSurface) {
      return false
    }

    const contentRect = editor.view.dom.getBoundingClientRect()
    const surfaceRect = editorSurface.getBoundingClientRect()
    const probeX = contentRect.left + 8
    const target = editor.view.posAtCoords({
      left: probeX,
      top: clientY,
    })

    if (!target) {
      return false
    }

    try {
      const coords = editor.view.coordsAtPos(target.pos)

      // Ignore paragraph spacing gaps so the create flag only appears on real line boxes.
      const verticalPadding = 2
      if (clientY < coords.top - verticalPadding || clientY > coords.bottom + verticalPadding) {
        return false
      }

      const top = coords.top - surfaceRect.top
      setHoverLineTop((previous) => (previous === top ? previous : top))
      setHoverLineAnchor((previous) => (previous === target.pos ? previous : target.pos))
      return true
    } catch {
      return false
    }
  }

  useEffect(() => {
    return () => {
      if (typingUiTimeoutRef.current) {
        window.clearTimeout(typingUiTimeoutRef.current)
      }
      setIsUiTyping(false)
      onTypingStateChange?.(false)
    }
  }, [onTypingStateChange])

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

  useEffect(() => {
    if (!editor) {
      return
    }

    const editorSurface = editorSurfaceRef.current
    const caret = caretRef.current

    if (!editorSurface || !caret) {
      return
    }

    const getEditorView = () => {
      try {
        const view = editor.view
        if (!view?.dom) {
          return null
        }

        return view
      } catch {
        return null
      }
    }

    let frameId = 0
    let followFrameId = 0
    let typingTimeoutId = 0

    const CARET_FOLLOW_FACTOR = 0.22
    const CARET_FOLLOW_SNAP_DISTANCE = 0.35
    const caretMotion = {
      currentLeft: 0,
      currentTop: 0,
      currentHeight: 26,
      targetLeft: 0,
      targetTop: 0,
      targetHeight: 26,
      initialized: false,
    }

    const applyCaretPosition = () => {
      caret.style.transform = `translate3d(${caretMotion.currentLeft}px, ${caretMotion.currentTop}px, 0)`
      caret.style.height = `${caretMotion.currentHeight}px`
    }

    const followCaretMotion = () => {
      followFrameId = 0

      const leftDelta = caretMotion.targetLeft - caretMotion.currentLeft
      const topDelta = caretMotion.targetTop - caretMotion.currentTop
      const heightDelta = caretMotion.targetHeight - caretMotion.currentHeight

      caretMotion.currentLeft += leftDelta * CARET_FOLLOW_FACTOR
      caretMotion.currentTop += topDelta * CARET_FOLLOW_FACTOR
      caretMotion.currentHeight += heightDelta * CARET_FOLLOW_FACTOR

      applyCaretPosition()

      const isCloseEnough =
        Math.abs(leftDelta) < CARET_FOLLOW_SNAP_DISTANCE &&
        Math.abs(topDelta) < CARET_FOLLOW_SNAP_DISTANCE &&
        Math.abs(heightDelta) < CARET_FOLLOW_SNAP_DISTANCE

      if (isCloseEnough) {
        caretMotion.currentLeft = caretMotion.targetLeft
        caretMotion.currentTop = caretMotion.targetTop
        caretMotion.currentHeight = caretMotion.targetHeight
        applyCaretPosition()
        return
      }

      followFrameId = window.requestAnimationFrame(followCaretMotion)
    }

    const scheduleCaretFollow = () => {
      if (followFrameId) {
        return
      }

      followFrameId = window.requestAnimationFrame(followCaretMotion)
    }

    const stopTypingState = () => {
      caret.classList.remove("typing-caret--typing")
    }

    const markCaretTypingActivity = () => {
      caret.classList.add("typing-caret--typing")

      if (typingTimeoutId) {
        window.clearTimeout(typingTimeoutId)
      }

      typingTimeoutId = window.setTimeout(() => {
        stopTypingState()
      }, 450)
    }

    const hideCaret = () => {
      caret.classList.add("typing-caret--hidden")
      stopTypingState()
    }

    const showCaret = () => {
      caret.classList.remove("typing-caret--hidden")
    }

    const updateFlaggedLineTops = (surfaceRect: DOMRect) => {
      const view = getEditorView()
      if (!view) {
        return
      }

      const anchors = flaggedAnchorsByDocument[activeDocumentKey] ?? []

      if (anchors.length === 0) {
        setFlaggedLineTops((previous) => (Object.keys(previous).length === 0 ? previous : {}))
        return
      }

      const next: Record<number, number> = {}
      for (const anchor of anchors) {
        try {
          const coords = view.coordsAtPos(anchor)
          next[anchor] = coords.top - surfaceRect.top
        } catch {
          // Skip anchors that no longer resolve after document changes.
        }
      }

      setFlaggedLineTops((previous) => {
        const prevKeys = Object.keys(previous)
        const nextKeys = Object.keys(next)
        const unchanged =
          prevKeys.length === nextKeys.length &&
          nextKeys.every((key) => previous[Number(key)] === next[Number(key)])

        return unchanged ? previous : next
      })
    }

    // Draw a custom blinking caret that follows the editor selection.
    const updateCaret = () => {
      frameId = 0

      const view = getEditorView()
      if (!view) {
        hideCaret()
        return
      }

      const surfaceRect = editorSurface.getBoundingClientRect()
      updateFlaggedLineTops(surfaceRect)

      let from = 0
      let to = 0
      try {
        from = view.state.selection.from
        to = view.state.selection.to
      } catch {
        hideCaret()
        return
      }

      if (!view.hasFocus() || from !== to) {
        hideCaret()
        return
      }

      let coords: { left: number; top: number; bottom: number }
      try {
        coords = view.coordsAtPos(from)
      } catch {
        hideCaret()
        return
      }

      const left = coords.left - surfaceRect.left
      const top = coords.top - surfaceRect.top
      const height = Math.max(coords.bottom - coords.top, 26)

      caretMotion.targetLeft = left
      caretMotion.targetTop = top
      caretMotion.targetHeight = height

      if (!caretMotion.initialized) {
        caretMotion.currentLeft = left
        caretMotion.currentTop = top
        caretMotion.currentHeight = height
        caretMotion.initialized = true
        applyCaretPosition()
      } else {
        scheduleCaretFollow()
      }

      showCaret()
    }

    const scheduleCaretUpdate = () => {
      if (frameId) {
        return
      }
      frameId = window.requestAnimationFrame(updateCaret)
    }

    const onSelectionUpdate = () => scheduleCaretUpdate()
    const onTransaction = ({ transaction }: { transaction: { docChanged: boolean; mapping: { map: (pos: number, assoc?: number) => number } } }) => {
      if (transaction.docChanged) {
        setFlaggedAnchorsByDocument((current) => {
          const existing = current[activeDocumentKey]
          if (!existing || existing.length === 0) {
            return current
          }

          const mapped = Array.from(new Set(existing.map((anchor) => transaction.mapping.map(anchor, 1))))
          const unchanged = mapped.length === existing.length && mapped.every((value, index) => value === existing[index])
          if (unchanged) {
            return current
          }

          return {
            ...current,
            [activeDocumentKey]: mapped,
          }
        })

        setHighlightRangesByDocument((current) => {
          const existing = current[activeDocumentKey]
          if (!existing) {
            return current
          }

          const mappedEntries = Object.entries(existing)
            .map(([anchorKey, range]) => {
              const mappedAnchor = transaction.mapping.map(Number(anchorKey), 1)
              const mappedFrom = transaction.mapping.map(range.from, 1)
              const mappedTo = transaction.mapping.map(range.to, -1)

              if (mappedFrom >= mappedTo) {
                return null
              }

              return [mappedAnchor, { from: mappedFrom, to: mappedTo }] as const
            })
            .filter((entry): entry is readonly [number, HighlightRange] => entry !== null)

          const next: Record<number, HighlightRange> = {}
          for (const [anchor, range] of mappedEntries) {
            next[anchor] = range
          }

          const prevSerialized = JSON.stringify(existing)
          const nextSerialized = JSON.stringify(next)
          if (prevSerialized === nextSerialized) {
            return current
          }

          return {
            ...current,
            [activeDocumentKey]: next,
          }
        })
      }

      scheduleCaretUpdate()
    }
    const onEditorFocus = () => scheduleCaretUpdate()
    const onEditorBlur = () => hideCaret()
    const onWindowResize = () => scheduleCaretUpdate()
    const onWindowScroll = () => scheduleCaretUpdate()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return
      }

      const isCharacter = event.key.length === 1
      const isEditingKey = event.key === "Backspace" || event.key === "Delete" || event.key === "Enter"

      if (isCharacter || isEditingKey) {
        markCaretTypingActivity()
        markUiTypingActivity()
      }
    }

    editor.on("selectionUpdate", onSelectionUpdate)
    editor.on("transaction", onTransaction)
    editor.on("focus", onEditorFocus)
    editor.on("blur", onEditorBlur)

    window.addEventListener("resize", onWindowResize)
    window.addEventListener("scroll", onWindowScroll, true)

    const editorDom = getEditorView()?.dom ?? null
    editorDom?.addEventListener("keydown", onKeyDown)

    scheduleCaretUpdate()

    return () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId)
      }
      if (followFrameId) {
        window.cancelAnimationFrame(followFrameId)
      }
      if (typingTimeoutId) {
        window.clearTimeout(typingTimeoutId)
      }
      editor.off("selectionUpdate", onSelectionUpdate)
      editor.off("transaction", onTransaction)
      editor.off("focus", onEditorFocus)
      editor.off("blur", onEditorBlur)
      window.removeEventListener("resize", onWindowResize)
      window.removeEventListener("scroll", onWindowScroll, true)
      editorDom?.removeEventListener("keydown", onKeyDown)
    }
  }, [editor, onTypingStateChange, flaggedAnchorsByDocument, activeDocumentKey])

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
      style={{ fontSize: `${fontSize}px`, fontFamily }}
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

            if (!event.metaKey && !event.ctrlKey && !event.altKey && (event.key.length === 1 || event.key === "Backspace" || event.key === "Delete")) {
              markUiTypingActivity()
            }
          }}
          aria-label="Document title"
        />
      ) : null}
      <EditorContent editor={editor} />
      {flagsEnabled ? (
        <div
          className={`editor-flag-rail ${showFlagRailUi ? "editor-flag-rail--active" : ""} ${isUiTyping ? "editor-flag-rail--typing" : ""}`.trim()}
          onMouseEnter={(event) => {
            setIsFlagRailHovered(true)
            const foundLine = updateHoverLineFromPointer(event.clientY)
            if (!foundLine) {
              setHoverLineTop(null)
              setHoverLineAnchor(null)
            }
          }}
          onMouseMove={(event) => {
            const foundLine = updateHoverLineFromPointer(event.clientY)
            if (!foundLine) {
              setHoverLineTop(null)
              setHoverLineAnchor(null)
            }
          }}
          onMouseLeave={() => {
            setIsFlagRailHovered(false)
            setHoverLineTop(null)
            setHoverLineAnchor(null)
          }}
          aria-hidden="true"
        />
      ) : null}
      {flagsEnabled
        ? (flaggedAnchorsByDocument[activeDocumentKey] ?? []).map((anchor) => {
        const top = flaggedLineTops[anchor]

        if (typeof top !== "number") {
          return null
        }

        return (
          <button
            key={anchor}
            type="button"
            className={`editor-line-flag editor-line-flag--flagged editor-line-flag--persistent ${isUiTyping ? "editor-line-flag--typing" : ""}`.trim()}
            style={{ transform: `translate3d(0, ${top}px, 0)` }}
            onMouseDown={(event) => {
              event.preventDefault()
            }}
            onClick={() => {
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
            aria-label="Unflag line"
          >
            <span className="editor-line-flag__icon editor-line-flag__icon--default" aria-hidden="true">
              <Flag size={15} strokeWidth={2.2} aria-hidden="true" />
            </span>
            <span className="editor-line-flag__icon editor-line-flag__icon--hover" aria-hidden="true">
              <FlagOff size={15} strokeWidth={2.2} aria-hidden="true" />
            </span>
          </button>
        )
      })
        : null}
      {shouldShowCreateFlag ? (
        <button
          type="button"
          className={`editor-line-flag editor-line-flag--create ${showFlagRailUi ? "editor-line-flag--revealed" : ""}`.trim()}
          style={{ transform: `translate3d(0, ${currentLineTop}px, 0)` }}
          onMouseDown={(event) => {
            // Keep editor focus so caret/line tracking does not jump on click.
            event.preventDefault()
          }}
          onMouseEnter={() => {
            setIsFlagRailHovered(true)
          }}
          onMouseLeave={() => {
            setIsFlagRailHovered(false)
          }}
          onClick={() => {
            if (currentLineAnchor === null) {
              return
            }

            const highlightedRange = highlightSelectionIfPresent()

            setFlaggedAnchorsByDocument((current) => {
              const existing = current[activeDocumentKey] ?? []
              if (existing.includes(currentLineAnchor)) {
                return current
              }

              return {
                ...current,
                [activeDocumentKey]: [...existing, currentLineAnchor],
              }
            })

            if (highlightedRange) {
              setHighlightRangesByDocument((current) => {
                const existing = current[activeDocumentKey] ?? {}

                return {
                  ...current,
                  [activeDocumentKey]: {
                    ...existing,
                    [currentLineAnchor]: highlightedRange,
                  },
                }
              })
            }
          }}
          aria-label="Flag hovered line"
          aria-pressed={currentLineAnchor !== null && flaggedAnchors.has(currentLineAnchor)}
        >
          <Flag size={15} strokeWidth={2.2} aria-hidden="true" />
        </button>
      ) : null}
      <div className="typing-caret typing-caret--hidden" ref={caretRef} aria-hidden="true" />
    </div>
  )
}