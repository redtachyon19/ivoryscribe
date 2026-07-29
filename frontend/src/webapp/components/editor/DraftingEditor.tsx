import { useEffect, useMemo, useState, type CSSProperties } from "react"
import { EditorContent, type Editor as TiptapEditor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Highlight from "@tiptap/extension-highlight"
import Underline from "@tiptap/extension-underline"
import { DiffAddMark, DiffRemoveMark } from "../ai/diffMarks"
import { withEmojiFontFallback } from "../../../core/utils/appearance"
import { FlagRail } from "./components/FlagRail"
import { EditorDocumentTitle } from "./components/EditorDocumentTitle"
import { useFlagRail } from "./hooks/useFlagRail"
import { useProseEditorBase } from "./hooks/useProseEditorBase"
import { useEditorZoom } from "./hooks/useEditorZoom"
import { useEditorFontEvents } from "./hooks/useEditorFontEvents"
import { useEditorCommandBus } from "./hooks/useEditorCommandBus"
import { useEditorFocusJumps } from "./hooks/useEditorFocusJumps"
import { useEditorSearchHighlight } from "./hooks/useEditorSearchHighlight"
import { SearchHighlightExtension } from "./extensions/searchHighlight"
import { sharedProseFormattingExtensions } from "./extensions/sharedProseExtensions"
import { emitTipTapWordCounts } from "./utils/wordCount"
import "./DraftingEditor.css"
import "./extensions/searchHighlight.css"

const MIN_FONT_SIZE = 10
const MAX_FONT_SIZE = 84
const DEFAULT_FONT_SIZE = 32
const DEFAULT_FONT_FAMILY = '"Times", "Times New Roman", serif'
const DEFAULT_DOCUMENT_CONTENT = "<p></p>"
const BODY_PLACEHOLDER = "Start your epic..."

function isBodyPlaceholderVisible(currentEditor: TiptapEditor): boolean {
  if (!currentEditor.isEmpty) return false
  const firstBlock = currentEditor.state.doc.firstChild
  return !!firstBlock && firstBlock.type.name === "paragraph"
}

function syncEmptyState(currentEditor: TiptapEditor) {
  try {
    const editorDom = currentEditor.view?.dom
    if (!editorDom) return
    editorDom.setAttribute("data-empty", isBodyPlaceholderVisible(currentEditor) ? "true" : "false")
  } catch {
  }
}

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
  const [fontSize, setFontSize] = useState(() =>
    Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, editorFontSize || DEFAULT_FONT_SIZE)),
  )
  const [fontFamily, setFontFamily] = useState(() => withEmojiFontFallback(DEFAULT_FONT_FAMILY))

  const { editor, editorSurfaceRef, caretRef, isUiTyping, markUiTypingActivity } = useProseEditorBase({
    documentId,
    content,
    readOnly,
    placeholder: BODY_PLACEHOLDER,
    extensions: [
      StarterKit.configure({ heading: false, horizontalRule: false }),
      Highlight.configure({ multicolor: true }),
      Underline,
      ...sharedProseFormattingExtensions({ interactiveImages: false }),
      SearchHighlightExtension,
      DiffAddMark,
      DiffRemoveMark,
    ],
    defaultContent: DEFAULT_DOCUMENT_CONTENT,
    onContentChange,
    onWordCountChange,
    onTypingStateChange,
    onEditorReady,
    onUpdateSideEffect: syncEmptyState,
    onContentSync: (currentEditor) => {
      syncEmptyState(currentEditor)
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

  useEditorZoom({ contentRef: editorSurfaceRef, enabledKey: documentId, fluidContentWidth: true })

  useEffect(() => {
    if (!editor) return
    syncEmptyState(editor)
    emitTipTapWordCounts(editor, onWordCountChange)
  }, [editor])

  useEffect(() => {
    setFontSize(Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, editorFontSize || DEFAULT_FONT_SIZE)))
  }, [editorFontSize])

  useEditorFontEvents({ setFontSize, setFontFamily, minFontSize: MIN_FONT_SIZE, maxFontSize: MAX_FONT_SIZE })
  useEditorCommandBus(editor)
  useEditorFocusJumps({ editor, documentId, documentType: "text" })
  useEditorSearchHighlight({ editor, documentId })

  useEffect(() => {
    window.dispatchEvent(new Event("resize"))
  }, [fontSize, fontFamily])

  const hideFirstBlockAsDuplicate = useMemo(() => {
    if (hideDocumentTitle) return false
    const trimmedTitle = documentTitle.trim()
    if (!trimmedTitle || !content || typeof window === "undefined") return false
    const parsed = new DOMParser().parseFromString(content, "text/html")
    const firstBlock = parsed.body.firstElementChild
    const firstText = firstBlock?.textContent?.trim() ?? ""
    return firstText === trimmedTitle
  }, [content, documentTitle, hideDocumentTitle])

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
