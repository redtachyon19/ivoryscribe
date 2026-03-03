import { useEffect, useRef, useState } from "react"
import { useEditor, EditorContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import {
  EDITOR_COMMAND_EVENT,
  EDITOR_FONT_FAMILY_CHANGE_EVENT,
  EDITOR_FONT_SIZE_CHANGE_EVENT,
  type EditorCommand,
} from "./core/editorEvents"
import "./Editor.css"

type FontSizeChangeDetail = {
  delta: number
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
  content: string
  onDocumentTitleChange: (nextTitle: string) => void
  onContentChange: (nextContent: string) => void
}

export default function Editor({
  documentId,
  documentTitle,
  content,
  onDocumentTitleChange,
  onContentChange,
}: EditorProps) {
  const editorSurfaceRef = useRef<HTMLDivElement | null>(null)
  const caretRef = useRef<HTMLDivElement | null>(null)
  const [fontSize, setFontSize] = useState(DEFAULT_FONT_SIZE)
  const [fontFamily, setFontFamily] = useState(DEFAULT_FONT_FAMILY)
  const [titleDraft, setTitleDraft] = useState(documentTitle)

  const syncEmptyState = (currentEditor: Parameters<NonNullable<Parameters<typeof useEditor>[0]["onUpdate"]>>[0]["editor"]) => {
    currentEditor.view.dom.setAttribute("data-empty", currentEditor.isEmpty ? "true" : "false")
  }

  useEffect(() => {
    setTitleDraft(documentTitle)
  }, [documentTitle, documentId])

  const editor = useEditor({
    extensions: [StarterKit],
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
    },
  })

  useEffect(() => {
    if (!editor) {
      return
    }

    syncEmptyState(editor)
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
  }, [editor, content, documentId])

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
    window.addEventListener(EDITOR_FONT_FAMILY_CHANGE_EVENT, onFontFamilyChange as EventListener)
    window.addEventListener(EDITOR_COMMAND_EVENT, onEditorCommand as EventListener)

    return () => {
      window.removeEventListener(EDITOR_FONT_SIZE_CHANGE_EVENT, onFontSizeChange as EventListener)
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

    let frameId = 0
    let typingTimeoutId = 0

    const stopTypingState = () => {
      caret.classList.remove("typing-caret--typing")
    }

    const markTypingActivity = () => {
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

    // Draw a custom blinking caret that follows the editor selection.
    const updateCaret = () => {
      frameId = 0

      const view = editor.view
      const { from, to } = view.state.selection

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

      const surfaceRect = editorSurface.getBoundingClientRect()
      const left = coords.left - surfaceRect.left
      const top = coords.top - surfaceRect.top
      const height = Math.max(coords.bottom - coords.top, 26)

      caret.style.transform = `translate3d(${left}px, ${top}px, 0)`
      caret.style.height = `${height}px`
      showCaret()
    }

    const scheduleCaretUpdate = () => {
      if (frameId) {
        return
      }
      frameId = window.requestAnimationFrame(updateCaret)
    }

    const onSelectionUpdate = () => scheduleCaretUpdate()
    const onTransaction = () => scheduleCaretUpdate()
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
        markTypingActivity()
      }
    }

    editor.on("selectionUpdate", onSelectionUpdate)
    editor.on("transaction", onTransaction)
    editor.on("focus", onEditorFocus)
    editor.on("blur", onEditorBlur)

    window.addEventListener("resize", onWindowResize)
    window.addEventListener("scroll", onWindowScroll, true)
    editor.view.dom.addEventListener("keydown", onKeyDown)

    scheduleCaretUpdate()

    return () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId)
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
      editor.view.dom.removeEventListener("keydown", onKeyDown)
    }
  }, [editor])

  return (
    <div
      className="editor-container"
      ref={editorSurfaceRef}
      style={{ fontSize: `${fontSize}px`, fontFamily }}
    >
      <input
        className="editor-document-title"
        value={titleDraft}
        onChange={(event) => {
          setTitleDraft(event.target.value)
        }}
        onBlur={() => {
          onDocumentTitleChange(titleDraft)
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault()
            onDocumentTitleChange(titleDraft)
            event.currentTarget.blur()
          }

          if (event.key === "Escape") {
            event.preventDefault()
            setTitleDraft(documentTitle)
            event.currentTarget.blur()
          }
        }}
        aria-label="Document title"
      />
      <EditorContent editor={editor} />
      <div className="typing-caret typing-caret--hidden" ref={caretRef} aria-hidden="true" />
    </div>
  )
}