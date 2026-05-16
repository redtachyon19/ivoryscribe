import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react"
import { useEditor, EditorContent, type Editor as TiptapEditor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Highlight from "@tiptap/extension-highlight"
import TextAlign from "@tiptap/extension-text-align"
import { TextStyle } from "@tiptap/extension-text-style"
import FontFamily from "@tiptap/extension-font-family"
import Color from "@tiptap/extension-color"
import Underline from "@tiptap/extension-underline"
import { DiffAddMark, DiffRemoveMark } from "../ai/diffMarks"
import { ToolCase, X } from "lucide-react"
import { useTypingCaret } from "./hooks/useTypingCaret"
import { useTypingState } from "./hooks/useTypingState"
import { useRulerDrag } from "./hooks/useRulerDrag"
import { useFormatPainter } from "./hooks/useFormatPainter"
import { useToolbarDrag } from "./hooks/useToolbarDrag"
import { useEditorContentSync, useEditorReadOnly, useEditorReady } from "./hooks/useEditorLifecycle"
import { TypewriterToolbar } from "./components/TypewriterToolbar"
import { TypewriterRulerRow, TypewriterRulerY } from "./components/TypewriterRulers"
import { normalizePastedFormatting } from "./utils/pasteNormalization"
import { emitTipTapWordCounts } from "./utils/wordCount"
import {
  PAGE_GAP_PX,
  PAGE_H_PX,
  PAGE_W_PX,
  inToPx,
  loadMargins,
  saveMargins,
  type Margins,
} from "./utils/typewriterMargins"
import { FontSizeExtension } from "./extensions/typewriter/fontSize"
import { ParaIndentExtension } from "./extensions/typewriter/paraIndent"
import { ColumnsExtension } from "./extensions/typewriter/columns"
import { PageBreakExtension, type PageBreakStorage } from "./extensions/typewriter/pageBreak"
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


/* ── Props ── */
type TypewriterEditorProps = {
  documentId: string | null
  content: string
  onContentChange: (nextContent: string) => void
  onWordCountChange?: (payload: { documentWordCount: number; selectedWordCount: number | null }) => void
  onTypingStateChange?: (isTyping: boolean) => void
  onEditorReady?: (editor: TiptapEditor | null) => void
  readOnly?: boolean
}

/* ── Component ── */
export default function TypewriterEditor({
  documentId,
  content,
  onContentChange,
  onWordCountChange,
  onTypingStateChange,
  onEditorReady,
  readOnly = false,
}: TypewriterEditorProps) {
  /* ── Margins ── */
  const [margins, setMargins] = useState<Margins>(() => loadMargins(documentId))

  /* ── Page count (driven by ResizeObserver) ── */
  const [numPages, setNumPages] = useState(1)

  /* ── Refs ── */
  const outerRef      = useRef<HTMLDivElement | null>(null)
  const rulerXRef     = useRef<HTMLDivElement | null>(null)
  const rulerYRef     = useRef<HTMLDivElement | null>(null)
  const editorSurfRef = useRef<HTMLDivElement | null>(null)

  /* ── Toolbar drag ── */
  const { toolbarRef, toolbarPos, isDragging: isDraggingToolbar, onGripMouseDown: handleToolbarGripDown } = useToolbarDrag()

  /* ── Typing state ── */
  const { isUiTyping, markUiTypingActivity } = useTypingState({ onTypingStateChange })

  /* ── Ruler visibility (persisted globally; default off) ── */
  const [showRulers, setShowRulers] = useState<boolean>(() => loadBoolPref(SHOW_RULERS_KEY))
  useEffect(() => { saveBoolPref(SHOW_RULERS_KEY, showRulers) }, [showRulers])

  /* ── Toolbar visibility (persisted globally; default off) ── */
  const [showToolbar, setShowToolbar] = useState<boolean>(() => loadBoolPref(SHOW_TOOLBAR_KEY))
  useEffect(() => { saveBoolPref(SHOW_TOOLBAR_KEY, showToolbar) }, [showToolbar])

  /* ── Force re-render on selection/transaction so the toolbar's active-state
       highlights stay current. */
  const [, setEditorVer] = useState(0)

  /* ── TipTap editor ── */
  const editor = useEditor({
    extensions: [
      StarterKit,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TextStyle,
      FontFamily,
      Color,
      Underline,
      FontSizeExtension,
      ParaIndentExtension,
      ColumnsExtension,
      PageBreakExtension,
      DiffAddMark,
      DiffRemoveMark,
    ],
    editorProps: {
      attributes: {
        "data-placeholder": "Start writing...",
        spellcheck: "true",
        autocorrect: "on",
        autocapitalize: "sentences",
        style: [
          `font-family: ${DEFAULT_FONT_FAMILY}`,
          `font-size: ${DEFAULT_FONT_SIZE_PX}px`,
          `line-height: ${DEFAULT_LINE_HEIGHT}`,
        ].join("; "),
      },
      transformPastedHTML: (html: string) => normalizePastedFormatting(html),
    },
    content: content || "<p></p>",
    onUpdate: ({ editor: ed }) => {
      onContentChange(ed.getHTML())
      emitTipTapWordCounts(ed, onWordCountChange)
      markUiTypingActivity()
    },
  })

  /* ── Fancy spring-follow caret ── */
  const { caretRef } = useTypingCaret({ editor, editorSurfaceRef: editorSurfRef, markUiTypingActivity })

  /* ── Bump version for toolbar active states ── */
  useEffect(() => {
    if (!editor) return
    const bump = () => setEditorVer((v) => v + 1)
    editor.on("selectionUpdate", bump)
    editor.on("transaction", bump)
    return () => { editor.off("selectionUpdate", bump); editor.off("transaction", bump) }
  }, [editor])

  useEditorContentSync(editor, content, documentId, "<p></p>")
  useEditorReadOnly(editor, readOnly)
  useEditorReady(editor, onEditorReady)

  /* ── Load margins on document switch ── */
  useEffect(() => {
    setMargins(loadMargins(documentId))
  }, [documentId])

  /* ── Persist margins ── */
  useEffect(() => {
    saveMargins(documentId, margins)
    window.dispatchEvent(new Event("resize"))
  }, [documentId, margins])

  /* ── Word count on selection change ── */
  useEffect(() => {
    if (!editor) return
    const onSel = () => emitTipTapWordCounts(editor, onWordCountChange)
    editor.on("selectionUpdate", onSel)
    return () => { editor.off("selectionUpdate", onSel) }
  }, [editor, onWordCountChange])

  /* ── Ruler drag ── */
  const {
    hasNonEmptySelection,
    selIndentLeftPx,
    selIndentRightPx,
    leftHandleX,
    rightHandleX,
    handleRulerDown,
  } = useRulerDrag({ editor, margins, setMargins, rulerXRef, rulerYRef })

  /* ── Format painter ── */
  const { isArmed: isPaintFormatArmed, handlePaintRollerClick } = useFormatPainter(editor)

  /* ── Derived pixel values ── */
  const mTopPx    = inToPx(margins.top)
  const mBottomPx = inToPx(margins.bottom)
  const mLeftPx   = inToPx(margins.left)
  const mRightPx  = inToPx(margins.right)
  const totalH    = numPages * PAGE_H_PX + (numPages - 1) * PAGE_GAP_PX

  /* ── ResizeObserver: update page count as content grows ── */
  useEffect(() => {
    const el = editorSurfRef.current
    if (!el) return
    const update = () => {
      // scrollHeight includes the editor-surf's paddingBottom (= mBottomPx),
      // which is just the bottom margin reserved on the LAST page — it isn't
      // real content. Strip it so we count by actual content height.
      //
      // After the page-break extension settles, K pages means the surface's
      // content height satisfies contentH = (K-1)*stride + L, where L is the
      // last page's content (0 < L ≤ pageH-mTop-mBot < stride). So K is just
      // ceil(contentH / stride). No extra "badZone" term — adding mTop + gap
      // on top of contentH was crossing the next stride boundary one page early.
      const contentH = Math.max(0, el.scrollHeight - mBottomPx)
      const stride   = PAGE_H_PX + PAGE_GAP_PX
      setNumPages(Math.max(1, Math.ceil(contentH / stride)))
    }
    const ro = new ResizeObserver(update)
    ro.observe(el)
    update()
    return () => ro.disconnect()
  }, [editor, mTopPx, mBottomPx])

  /* ── Cmd/Ctrl+Enter: jump cursor to the next page ── */
  useEffect(() => {
    if (!editor) return
    // The view may not be mounted on the first render; defer side-effect
    // setup until the editor proxy is replaced with a real EditorView.
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

      const cursorStackY = (coords.top - surfRect.top) + mTopPx
      const stride = PAGE_H_PX + PAGE_GAP_PX
      const pageIdx = Math.floor(cursorStackY / stride)
      const currentPageContentBot = pageIdx * stride + (PAGE_H_PX - mBottomPx)
      const remainingPx = Math.max(0, currentPageContentBot - cursorStackY)

      // Each empty paragraph contributes one line of the editor's font height
      // PLUS the CSS margin-bottom (1em = the editor's font size in px).
      // Insert just enough to push past the current page's content area; the
      // page-break extension takes care of the actual page advance.
      const lineHeight = DEFAULT_FONT_SIZE_PX * DEFAULT_LINE_HEIGHT
      const paraSpacingPx = DEFAULT_FONT_SIZE_PX * 1.25 // matches CSS .ProseMirror p { margin-bottom: 1.25em }
      const paragraphHeight = lineHeight + paraSpacingPx
      const paragraphsNeeded = Math.ceil(remainingPx / paragraphHeight) + 1
      const html = "<p></p>".repeat(paragraphsNeeded)
      editor.chain().focus().insertContent(html).run()
    }

    dom.addEventListener("keydown", handleKeyDown, true)
    return () => dom.removeEventListener("keydown", handleKeyDown, true)
  }, [editor, mTopPx, mBottomPx])

  /* ── Page breaks: push overflowing lines to the next page (via PM decorations) ── */
  useEffect(() => {
    if (!editor) return
    const storage = (editor.storage as unknown as Record<string, unknown>).twPageBreaks as PageBreakStorage | undefined
    if (!storage) return
    storage.mTopPx    = mTopPx
    storage.mBottomPx = mBottomPx
    storage.pageHPx   = PAGE_H_PX
    storage.gapPx     = PAGE_GAP_PX
    storage.remeasure = (storage.remeasure || 0) + 1
    // Direct trigger so the recompute fires this frame instead of waiting on
    // the 80ms storage poll.
    storage.requestRecompute?.()
  }, [editor, mTopPx, mBottomPx])

  /* ── Render ── */
  return (
    <div className="tw-outer" ref={outerRef}>

      {/* scroll container */}
      <div className="tw-scroll">

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

        {/* body row: vertical ruler + pages */}
        <div className="tw-body-row">

          <TypewriterRulerY
            isUiTyping={isUiTyping}
            showRulers={showRulers}
            rulerYRef={rulerYRef}
            numPages={numPages}
            margins={margins}
            handleRulerDown={handleRulerDown}
          />

          {/* pages stack */}
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
                paddingBottom: mBottomPx,  // enforces visible bottom margin on every page
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

        <div className="tw-scroll-spacer" aria-hidden="true" />
      </div>

      {/* bottom-left toolbar toggle (mirrors the corner ruler toggle) */}
      <button
        type="button"
        className={`tw-toolcase-btn${!showToolbar ? " tw-toolcase-btn--off" : ""}`}
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

      <TypewriterToolbar
        editor={editor}
        showToolbar={showToolbar}
        isDraggingToolbar={isDraggingToolbar}
        toolbarRef={toolbarRef}
        toolbarPos={toolbarPos}
        onGripMouseDown={handleToolbarGripDown}
        isPaintFormatArmed={isPaintFormatArmed}
        onPaintRollerClick={handlePaintRollerClick}
      />
    </div>
  )
}
