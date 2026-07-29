import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react"
import { EditorContent, type Editor as TiptapEditor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Highlight from "@tiptap/extension-highlight"
import Underline from "@tiptap/extension-underline"
import { DiffAddMark, DiffRemoveMark } from "../ai/diffMarks"
import { ToolCase, X } from "lucide-react"
import { useProseEditorBase } from "./hooks/useProseEditorBase"
import { useEditorZoom } from "./hooks/useEditorZoom"
import { useEditorCommandBus } from "./hooks/useEditorCommandBus"
import { useEditorSearchHighlight } from "./hooks/useEditorSearchHighlight"
import { SearchHighlightExtension } from "./extensions/searchHighlight"
import { useRulerDrag } from "./hooks/useRulerDrag"
import { useFormatPainter } from "./hooks/useFormatPainter"
import { useToolbarDrag } from "./hooks/useToolbarDrag"
import { TypewriterToolbar } from "./components/TypewriterToolbar"
import { CropToolbar } from "./components/CropToolbar"
import type { ImageCropSession } from "./extensions/resizableImage"
import { TypewriterRulerRow, TypewriterRulerY } from "./components/TypewriterRulers"
import {
  PAGE_GAP_PX,
  PAGE_H_PX,
  PAGE_W_PX,
  inToPx,
  type Margins,
} from "./utils/typewriterMargins"
import { DEFAULT_MARGINS } from "../../../core/utils/projects"
import { PageBreakExtension, type PageBreakStorage } from "./extensions/typewriter/pageBreak"
import { sharedProseFormattingExtensions } from "./extensions/sharedProseExtensions"
import {
  DEFAULT_FONT_FAMILY,
  DEFAULT_FONT_SIZE_PX,
  DEFAULT_LINE_HEIGHT,
  SHOW_RULERS_KEY,
  SHOW_TOOLBAR_KEY,
  loadBoolPref,
  saveBoolPref,
} from "./utils/typewriterPrefs"
import "./TypewriterEditor.css"
import "./extensions/searchHighlight.css"

type TypewriterEditorProps = {
  documentId: string | null
  content: string
  onContentChange: (nextContent: string) => void
  margins?: Margins
  onMarginsChange?: (documentId: string | null, nextMargins: Margins) => void
  onWordCountChange?: (payload: { documentWordCount: number; selectedWordCount: number | null }) => void
  onTypingStateChange?: (isTyping: boolean) => void
  onEditorReady?: (editor: TiptapEditor | null) => void
  readOnly?: boolean
}

export default function TypewriterEditor({
  documentId,
  content,
  onContentChange,
  margins: projectMargins,
  onMarginsChange,
  onWordCountChange,
  onTypingStateChange,
  onEditorReady,
  readOnly = false,
}: TypewriterEditorProps) {
  const [margins, setMargins] = useState<Margins>(() => projectMargins ?? DEFAULT_MARGINS)

  const [numPages, setNumPages] = useState(1)

  const outerRef      = useRef<HTMLDivElement | null>(null)
  const scrollRef     = useRef<HTMLDivElement | null>(null)
  const pagesStackRef = useRef<HTMLDivElement | null>(null)
  const rulerXRef     = useRef<HTMLDivElement | null>(null)
  const rulerYRef     = useRef<HTMLDivElement | null>(null)

  const { toolbarRef, toolbarPos, isDragging: isDraggingToolbar, onGripMouseDown: handleToolbarGripDown } = useToolbarDrag({ useParentRelativeCoords: true })

  const [showRulers, setShowRulers] = useState<boolean>(() => loadBoolPref(SHOW_RULERS_KEY))
  useEffect(() => { saveBoolPref(SHOW_RULERS_KEY, showRulers) }, [showRulers])

  const [showToolbar, setShowToolbar] = useState<boolean>(() => loadBoolPref(SHOW_TOOLBAR_KEY))
  useEffect(() => { saveBoolPref(SHOW_TOOLBAR_KEY, showToolbar) }, [showToolbar])

  const [, setEditorVer] = useState(0)

  const [cropSession, setCropSession] = useState<ImageCropSession>(null)

  useEditorZoom({ scrollRef, contentRef: pagesStackRef, enabledKey: documentId, snapPageWidthPx: PAGE_W_PX, snapGutterPx: 56 })

  const { editor, editorSurfaceRef: editorSurfRef, caretRef, isUiTyping } = useProseEditorBase({
    documentId,
    content,
    readOnly,
    placeholder: "Start writing...",
    extensions: [
      StarterKit.configure({ heading: false, horizontalRule: false }),
      Highlight.configure({ multicolor: true }),
      Underline,
      ...sharedProseFormattingExtensions(),
      PageBreakExtension,
      SearchHighlightExtension,
      DiffAddMark,
      DiffRemoveMark,
    ],
    editorStyle: [
      `font-family: ${DEFAULT_FONT_FAMILY}`,
      `font-size: ${DEFAULT_FONT_SIZE_PX}px`,
      `line-height: ${DEFAULT_LINE_HEIGHT}`,
    ].join("; "),
    markTypingOnUpdate: true,
    onContentChange,
    onWordCountChange,
    onTypingStateChange,
    onEditorReady,
  })

  useEditorCommandBus(editor)
  useEditorSearchHighlight({ editor, documentId })

  useEffect(() => {
    if (!editor) return
    const bump = () => setEditorVer((v) => v + 1)
    editor.on("selectionUpdate", bump)
    editor.on("transaction", bump)
    return () => { editor.off("selectionUpdate", bump); editor.off("transaction", bump) }
  }, [editor])

  useEffect(() => {
    if (!editor) return
    let dom: HTMLElement
    try { dom = editor.view.dom as HTMLElement } catch { return }
    const sync = () => {
      const storage = (editor.storage as unknown as Record<string, unknown>).resizableImage as
        | { cropSession: ImageCropSession }
        | undefined
      setCropSession(storage?.cropSession ?? null)
    }
    dom.addEventListener("tw-image-crop", sync)
    sync()
    return () => dom.removeEventListener("tw-image-crop", sync)
  }, [editor])

  const marginsMountedRef = useRef(false)
  useEffect(() => {
    if (marginsMountedRef.current) {
      onMarginsChange?.(documentId, margins)
    }
    marginsMountedRef.current = true
    window.dispatchEvent(new Event("resize"))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [margins])

  const {
    hasNonEmptySelection,
    selIndentLeftPx,
    selIndentRightPx,
    leftHandleX,
    rightHandleX,
    handleRulerDown,
  } = useRulerDrag({ editor, margins, setMargins, rulerXRef, rulerYRef })

  const { isArmed: isPaintFormatArmed, handlePaintRollerClick } = useFormatPainter(editor)

  const mTopPx    = inToPx(margins.top)
  const mBottomPx = inToPx(margins.bottom)
  const mLeftPx   = inToPx(margins.left)
  const mRightPx  = inToPx(margins.right)
  const totalH    = numPages * PAGE_H_PX + (numPages - 1) * PAGE_GAP_PX

  useEffect(() => {
    const el = editorSurfRef.current
    if (!el) return
    const update = () => {
      const contentH = Math.max(0, el.scrollHeight - mBottomPx)
      const stride   = PAGE_H_PX + PAGE_GAP_PX
      setNumPages(Math.max(1, Math.ceil(contentH / stride)))
    }
    const ro = new ResizeObserver(update)
    ro.observe(el)
    update()
    return () => ro.disconnect()
  }, [editor, mTopPx, mBottomPx, editorSurfRef])

  useEffect(() => {
    if (!editor) return
    let dom: HTMLElement
    try {
      dom = editor.view.dom as HTMLElement
    } catch {
      return
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      const isModEnter =
        (e.metaKey || e.ctrlKey) && e.key === "Enter" && !e.shiftKey && !e.altKey
      if (!isModEnter) return
      e.preventDefault()
      e.stopPropagation()

      const view = editor.view
      const sel = view.state.selection
      let coords: { top: number; bottom: number; left: number; right: number }
      try { coords = view.coordsAtPos(sel.head) } catch { return }
      const surfEl = editorSurfRef.current
      if (!surfEl) return
      const surfRect = surfEl.getBoundingClientRect()

      const naturalSurfW = PAGE_W_PX - mLeftPx - mRightPx
      const renderScale = naturalSurfW > 0 && surfRect.width > 0 ? surfRect.width / naturalSurfW : 1

      const cursorStackY = (coords.top - surfRect.top) / renderScale + mTopPx
      const stride = PAGE_H_PX + PAGE_GAP_PX
      const pageIdx = Math.floor(cursorStackY / stride)
      const currentPageContentBot = pageIdx * stride + (PAGE_H_PX - mBottomPx)
      const remainingPx = Math.max(0, currentPageContentBot - cursorStackY)

      const lineHeight = DEFAULT_FONT_SIZE_PX * DEFAULT_LINE_HEIGHT
      const paraSpacingPx = DEFAULT_FONT_SIZE_PX * 1.25
      const paragraphHeight = lineHeight + paraSpacingPx
      const paragraphsNeeded = Math.ceil(remainingPx / paragraphHeight) + 1
      const html = "<p></p>".repeat(paragraphsNeeded)
      editor.chain().focus().insertContent(html).run()
    }

    dom.addEventListener("keydown", handleKeyDown, true)
    return () => dom.removeEventListener("keydown", handleKeyDown, true)
  }, [editor, mTopPx, mBottomPx, mLeftPx, mRightPx, editorSurfRef])

  useEffect(() => {
    if (!editor) return
    const storage = (editor.storage as unknown as Record<string, unknown>).twPageBreaks as PageBreakStorage | undefined
    if (!storage) return
    storage.mTopPx    = mTopPx
    storage.mBottomPx = mBottomPx
    storage.pageHPx   = PAGE_H_PX
    storage.gapPx     = PAGE_GAP_PX
    storage.remeasure = (storage.remeasure || 0) + 1
    storage.requestRecompute?.()
  }, [editor, mTopPx, mBottomPx])

  return (
    <div className="tw-outer" ref={outerRef}>

      <div className="tw-scroll" ref={scrollRef}>

        <div className="tw-zoom-wrap" ref={pagesStackRef}>

        <TypewriterRulerRow
          isUiTyping={isUiTyping}
          showRulers={showRulers}
          onToggleRulers={() => setShowRulers((v) => !v)}
          rulerXRef={rulerXRef}
          margins={margins}
          hasNonEmptySelection={hasNonEmptySelection}
          selIndentLeftPx={selIndentLeftPx}
          selIndentRightPx={selIndentRightPx}
          leftHandleX={leftHandleX}
          rightHandleX={rightHandleX}
          handleRulerDown={handleRulerDown}
        />

        <div className="tw-body-row">

          <TypewriterRulerY
            isUiTyping={isUiTyping}
            showRulers={showRulers}
            rulerYRef={rulerYRef}
            numPages={numPages}
            margins={margins}
            handleRulerDown={handleRulerDown}
          />

          <div
            className="tw-pages-stack"
            style={{ width: PAGE_W_PX, height: totalH } as CSSProperties}
          >
            {Array.from({ length: numPages }, (_, i) => (
              <div
                key={i}
                className="tw-page-card"
                style={{
                  top:    i * (PAGE_H_PX + PAGE_GAP_PX),
                  height: PAGE_H_PX,
                } as CSSProperties}
                aria-hidden="true"
              />
            ))}

            <div
              className={`tw-editor-surf${isPaintFormatArmed ? " tw-editor-surf--paint-armed" : ""}`}
              ref={editorSurfRef}
              style={{
                left:          mLeftPx,
                top:           mTopPx,
                width:         PAGE_W_PX - mLeftPx - mRightPx,
                paddingBottom: mBottomPx,
              } as CSSProperties}
            >
              <EditorContent editor={editor} />

              <div
                className="typing-caret typing-caret--hidden"
                ref={caretRef}
                aria-hidden="true"
                style={{ background: "var(--app-accent, #7ea8ff)" }}
              />
            </div>
          </div>
        </div>

        </div>

        <div className="tw-scroll-spacer" aria-hidden="true" />
      </div>

      <button
        type="button"
        className={`tw-toolcase-btn${!showToolbar ? " tw-toolcase-btn--off" : ""}${isUiTyping ? " tw-toolcase-btn--typing" : ""}`}
        onClick={() => setShowToolbar((v) => !v)}
        title={showToolbar ? "Hide toolbar" : "Show toolbar"}
        aria-label={showToolbar ? "Hide toolbar" : "Show toolbar"}
        aria-pressed={!showToolbar}
      >
        <span className={`tw-toolcase-btn__icon${showToolbar ? " tw-toolcase-btn__icon--visible" : ""}`} aria-hidden="true">
          <X size={14} />
        </span>
        <span className={`tw-toolcase-btn__icon${!showToolbar ? " tw-toolcase-btn__icon--visible" : ""}`} aria-hidden="true">
          <ToolCase size={14} />
        </span>
      </button>

      {cropSession ? (
        <CropToolbar
          shape={cropSession.shape}
          onSelectShape={cropSession.setShape}
          isUiTyping={isUiTyping}
          isDraggingToolbar={isDraggingToolbar}
          toolbarRef={toolbarRef}
          toolbarPos={toolbarPos}
          onGripMouseDown={handleToolbarGripDown}
        />
      ) : (
        <TypewriterToolbar
          editor={editor}
          showToolbar={showToolbar}
          isUiTyping={isUiTyping}
          isDraggingToolbar={isDraggingToolbar}
          toolbarRef={toolbarRef}
          toolbarPos={toolbarPos}
          onGripMouseDown={handleToolbarGripDown}
          isPaintFormatArmed={isPaintFormatArmed}
          onPaintRollerClick={handlePaintRollerClick}
        />
      )}
    </div>
  )
}
