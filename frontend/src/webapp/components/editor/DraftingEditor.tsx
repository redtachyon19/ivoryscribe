import { useEffect, useMemo, useState, useRef, type CSSProperties } from "react"
import { useEditor, EditorContent, type Editor as TiptapEditor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Highlight from "@tiptap/extension-highlight"
import Underline from "@tiptap/extension-underline"
import { DiffAddMark, DiffRemoveMark } from "../ai/diffMarks"
import { withEmojiFontFallback } from "../../../core/utils/appearance"
import { FlagRail } from "./components/FlagRail"
import { EditorDocumentTitle } from "./components/EditorDocumentTitle"
import { useFlagRail } from "./hooks/useFlagRail"
import { useTypingCaret } from "./hooks/useTypingCaret"
import { useTypingState } from "./hooks/useTypingState"
import { useEditorContentSync, useEditorReadOnly, useEditorReady } from "./hooks/useEditorLifecycle"
import { useEditorFontEvents } from "./hooks/useEditorFontEvents"
import { useEditorCommandBus } from "./hooks/useEditorCommandBus"
import { useEditorFocusJumps } from "./hooks/useEditorFocusJumps"
import { normalizePastedFormatting } from "./utils/pasteNormalization"
import { emitTipTapWordCounts } from "./utils/wordCount"
import "./DraftingEditor.css"

const MIN_FONT_SIZE = 10
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
  onEditorReady?: (editor: TiptapEditor | null) => void
  readOnly?: boolean
}

export default function DraftingEditor({
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
  onEditorReady,
  readOnly = false,
}: EditorProps) {
  const editorSurfaceRef = useRef<HTMLDivElement | null>(null)
  const [fontSize, setFontSize] = useState(() =>
    Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, editorFontSize || DEFAULT_FONT_SIZE)),
  )
  const [fontFamily, setFontFamily] = useState(() => withEmojiFontFallback(DEFAULT_FONT_FAMILY))

  const { isUiTyping, markUiTypingActivity } = useTypingState({ onTypingStateChange })

  const editor = useEditor({
    extensions: [
      StarterKit,
      Highlight.configure({ multicolor: true }),
      Underline,
      DiffAddMark,
      DiffRemoveMark,
    ],
    editorProps: {
      attributes: {
        "data-placeholder": BODY_PLACEHOLDER,
        spellcheck: "true",
        autocorrect: "on",
        autocapitalize: "sentences",
      },
      // Drafting is plain prose: promote inline-styled bold/italic/underline
      // to structural marks, then strip residual styles + unwrap font wrappers
      // so the writer doesn't drag Google Docs / Word formatting in.
      transformPastedHTML: (html: string) => normalizePastedFormatting(html, { stripInlineStyles: true }),
    },
    content: content || DEFAULT_DOCUMENT_CONTENT,
    onUpdate: ({ editor: currentEditor }) => {
      syncEmptyState(currentEditor)
      onContentChange(currentEditor.getHTML())
      emitTipTapWordCounts(currentEditor, onWordCountChange)
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
    setIsFlagRailHovered,
    clearHoverState,
    updateHoverLineFromPointer,
    handleCreateFlag,
    handleRemoveFlag,
  } = useFlagRail({ editor, flagsEnabled, documentId, editorSurfaceRef })

  const { caretRef } = useTypingCaret({ editor, editorSurfaceRef, markUiTypingActivity })

  /* ── Empty-state attribute on the editor DOM (drives the placeholder text) ── */
  const syncEmptyState = (currentEditor: TiptapEditor) => {
    try {
      const editorDom = currentEditor.view?.dom
      if (!editorDom) return
      editorDom.setAttribute("data-empty", currentEditor.isEmpty ? "true" : "false")
    } catch {
      // TipTap can momentarily expose an editor instance before internals are fully ready.
    }
  }

  /* ── Editor lifecycle ── */
  useEditorContentSync(editor, content, documentId, DEFAULT_DOCUMENT_CONTENT, (currentEditor) => {
    syncEmptyState(currentEditor)
    emitTipTapWordCounts(currentEditor, onWordCountChange)
  })
  useEditorReadOnly(editor, readOnly)
  useEditorReady(editor, onEditorReady)

  /* ── Initial empty-state + word count ── */
  useEffect(() => {
    if (!editor) return
    syncEmptyState(editor)
    emitTipTapWordCounts(editor, onWordCountChange)
  }, [editor])

  /* ── Word count on selection change ── */
  useEffect(() => {
    if (!editor) return
    const onSelectionUpdate = () => emitTipTapWordCounts(editor, onWordCountChange)
    editor.on("selectionUpdate", onSelectionUpdate)
    return () => { editor.off("selectionUpdate", onSelectionUpdate) }
  }, [editor, onWordCountChange])

  /* ── Font-size prop sync ── */
  useEffect(() => {
    setFontSize(Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, editorFontSize || DEFAULT_FONT_SIZE)))
  }, [editorFontSize])

  /* ── Global menu wiring (font controls, command bus, search/spellcheck focus jumps) ── */
  useEditorFontEvents({ setFontSize, setFontFamily, minFontSize: MIN_FONT_SIZE, maxFontSize: MAX_FONT_SIZE })
  useEditorCommandBus(editor)
  useEditorFocusJumps({ editor, documentId, documentType: "text" })

  /* ── Recompute caret position when typography changes alter layout ── */
  useEffect(() => {
    window.dispatchEvent(new Event("resize"))
  }, [fontSize, fontFamily])

  /* ── Hide the body's first block when it duplicates the tab title ──
     Common when the document was authored in Typewriter mode, where the
     first line naturally serves as the title. */
  const hideFirstBlockAsDuplicate = useMemo(() => {
    if (hideDocumentTitle) return false
    const trimmedTitle = documentTitle.trim()
    if (!trimmedTitle || !content || typeof window === "undefined") return false
    const parsed = new DOMParser().parseFromString(content, "text/html")
    const firstBlock = parsed.body.firstElementChild
    const firstText = firstBlock?.textContent?.trim() ?? ""
    return firstText === trimmedTitle
  }, [content, documentTitle, hideDocumentTitle])

  /* ── Derived flag-rail UI state ── */
  const showFlagRailUi = flagsEnabled && (isFlagRailHovered || hoverLineTop !== null)
  const shouldShowCreateFlag =
    showFlagRailUi &&
    !isUiTyping &&
    hoverLineTop !== null &&
    hoverLineAnchor !== null &&
    !flaggedAnchors.has(hoverLineAnchor)

  return (
    <div
      className={`editor-container${hideFirstBlockAsDuplicate ? " editor-container--hide-first-block" : ""}`}
      ref={editorSurfaceRef}
      style={{ fontSize: `${fontSize}px`, "--editor-body-font": fontFamily } as CSSProperties}
      onMouseMove={(event) => {
        if (!flagsEnabled) return
        const foundLine = updateHoverLineFromPointer(event.clientY)
        if (!foundLine) clearHoverState()
      }}
      onMouseLeave={() => {
        if (!flagsEnabled) return
        setIsFlagRailHovered(false)
        clearHoverState()
      }}
    >
      {!hideDocumentTitle ? (
        <EditorDocumentTitle
          documentTitle={documentTitle}
          documentId={documentId}
          onChange={onDocumentTitleChange}
          onTypingActivity={markUiTypingActivity}
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
        currentLineTop={hoverLineTop}
        currentLineAnchor={hoverLineAnchor}
        flaggedAnchors={flaggedAnchors}
        setIsFlagRailHovered={setIsFlagRailHovered}
        clearHoverState={clearHoverState}
        updateHoverLineFromPointer={updateHoverLineFromPointer}
        onRemoveFlag={handleRemoveFlag}
        onCreateFlag={handleCreateFlag}
      />

      <div className="typing-caret typing-caret--hidden" ref={caretRef} aria-hidden="true" />
    </div>
  )
}
