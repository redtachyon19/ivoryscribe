// Floating text-formatting toolbar for TypewriterEditor.
//
// Owns all of its own UI state (open/close for the four submenus, default
// alignment/column choice memory, format painter armed state) and reads its
// active-state highlights directly off the passed-in TipTap editor. The
// parent only owns the toolbar's drag position and visibility toggle.
//
// The parent must re-render on the editor's `selectionUpdate` / `transaction`
// events for the active-state highlights to stay current — TypewriterEditor
// already bumps a counter to force this.

import { useCallback, useEffect, useRef, useState, type RefObject } from "react"
import type { Editor as TiptapEditor } from "@tiptap/react"
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronDown,
  Columns2,
  Columns3,
  Columns4,
  GripVertical,
  Highlighter,
  Italic,
  PaintRoller,
  Underline as UnderlineIcon,
} from "lucide-react"
import {
  DEFAULT_FONT_SIZE_PT,
  FONT_OPTIONS,
  FONT_SIZE_PRESETS,
  ptToPx,
  pxToPt,
} from "../utils/typewriterPrefs"
type AlignMode = "left" | "center" | "right"
type ColumnCount = 2 | 3 | 4

type TypewriterToolbarProps = {
  editor: TiptapEditor | null
  showToolbar: boolean
  isDraggingToolbar: boolean
  toolbarRef: RefObject<HTMLDivElement | null>
  toolbarPos: { x: number; y: number } | null
  onGripMouseDown: (event: React.MouseEvent) => void
  /** Format painter armed state — owned by parent so the editor-surface
   *  cursor styling can react too. */
  isPaintFormatArmed: boolean
  onPaintRollerClick: () => void
}

export function TypewriterToolbar({
  editor,
  showToolbar,
  isDraggingToolbar,
  toolbarRef,
  toolbarPos,
  onGripMouseDown,
  isPaintFormatArmed,
  onPaintRollerClick,
}: TypewriterToolbarProps) {
  /* ── Submenu state ── */
  const [fontSizeMenuOpen, setFontSizeMenuOpen] = useState(false)
  const fontSizeComboRef = useRef<HTMLDivElement | null>(null)
  const [fontFamilyMenuOpen, setFontFamilyMenuOpen] = useState(false)
  const fontFamilyComboRef = useRef<HTMLDivElement | null>(null)
  const [alignMenuOpen, setAlignMenuOpen] = useState(false)
  const [columnsMenuOpen, setColumnsMenuOpen] = useState(false)

  /* ── Remembered defaults for the collapsed combo buttons ── */
  const [defaultAlign, setDefaultAlign] = useState<AlignMode>("left")
  const [defaultColumns, setDefaultColumns] = useState<ColumnCount>(2)

  /* ── Hover-submenu close timers ──
     Close on a short delay rather than instantly so a brief mouse excursion
     (gap between trigger and menu, wobble on the way to a menu item) doesn't
     dismiss the popup. The CSS bridge below the menu buffers the gap; the
     timer covers any remaining off-axis paths. */
  const alignCloseTimer = useRef<number | null>(null)
  const columnsCloseTimer = useRef<number | null>(null)
  const openMenu = (timer: typeof alignCloseTimer, set: (v: boolean) => void) => () => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current)
      timer.current = null
    }
    set(true)
  }
  const closeMenu = (timer: typeof alignCloseTimer, set: (v: boolean) => void) => () => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      set(false)
      timer.current = null
    }, 180)
  }

  /* ── Local font-size input (commits on Enter / blur) ── */
  const [fontSizeInput, setFontSizeInput] = useState<string>(String(DEFAULT_FONT_SIZE_PT))

  /* ── Active-state derivations ── */
  const isBold = editor?.isActive("bold") ?? false
  const isItalic = editor?.isActive("italic") ?? false
  const isUnderline = editor?.isActive("underline") ?? false
  const isAlignLeft = editor?.isActive({ textAlign: "left" }) ?? false
  const isAlignCtr = editor?.isActive({ textAlign: "center" }) ?? false
  const isAlignRight = editor?.isActive({ textAlign: "right" }) ?? false

  // Walk up the selection's ancestors to spot a `columns` wrapper so the
  // toolbar button can flip between "wrap selection" and "update count."
  let isInColumns = false
  let currentColumns: ColumnCount | null = null
  let columnsWrapperPos = -1
  if (editor) {
    const $from = editor.state.selection.$from
    for (let depth = $from.depth; depth >= 0; depth--) {
      const node = $from.node(depth)
      if (node.type.name === "columns") {
        isInColumns = true
        currentColumns = ((node.attrs.count as number) || 2) as ColumnCount
        columnsWrapperPos = $from.before(depth)
        break
      }
    }
  }

  const applyColumns = useCallback((count: ColumnCount) => {
    if (!editor) return
    if (isInColumns && columnsWrapperPos >= 0) {
      // Already inside a columns block — just update its count.
      const tr = editor.state.tr
      const node = editor.state.doc.nodeAt(columnsWrapperPos)
      if (!node) return
      tr.setNodeMarkup(columnsWrapperPos, undefined, { ...node.attrs, count })
      editor.view.dispatch(tr)
      return
    }
    // Wrap the current block range in a fresh columns node.
    editor.chain().focus().wrapIn("columns", { count }).run()
  }, [editor, isInColumns, columnsWrapperPos])

  const curFontFamily = (editor?.getAttributes("textStyle").fontFamily as string | null) ?? ""
  const curColorRaw = (editor?.getAttributes("textStyle").color as string | null) ?? ""
  // Resolve default text color from the app palette CSS variable.
  const paletteTextColor = typeof document !== "undefined"
    ? getComputedStyle(document.querySelector(".app") ?? document.documentElement)
        .getPropertyValue("--editor-text").trim() || "#000000"
    : "#000000"
  const curColor = curColorRaw && /^#[0-9a-fA-F]{3,6}$/.test(curColorRaw) ? curColorRaw : paletteTextColor

  /* Highlight color — read from the active highlight mark if any, else fall
     back to the last color the user picked from the toolbar. Picking a new
     color via the swatch both applies the highlight to the current selection
     and remembers the choice for future clicks. */
  const curHighlightRaw = (editor?.getAttributes("highlight").color as string | null) ?? ""
  const isHighlightActive = !!curHighlightRaw
  const [lastHighlightColor, setLastHighlightColor] = useState<string>("#ffffff")
  const curHighlight = curHighlightRaw && /^#[0-9a-fA-F]{3,6}$/.test(curHighlightRaw) ? curHighlightRaw : lastHighlightColor

  // The textStyle mark stores font-size as a CSS string. Older docs used px;
  // new docs may use pt. Detect the unit and convert to points for the toolbar.
  const curFontSizeStr = (editor?.getAttributes("textStyle").fontSize as string | null) ?? ""
  const curFontSize = (() => {
    if (!curFontSizeStr) return DEFAULT_FONT_SIZE_PT
    const num = parseFloat(curFontSizeStr)
    if (Number.isNaN(num)) return DEFAULT_FONT_SIZE_PT
    if (curFontSizeStr.trim().endsWith("pt")) return Math.round(num)
    return Math.round(pxToPt(num))
  })()
  const selFontVal = FONT_OPTIONS.find((f) => f.value === curFontFamily)?.value ?? ""

  /* Mirror the editor's current font size into the input whenever the editor
     reports a different value (e.g., user moved the cursor into a span with a
     different size). */
  useEffect(() => {
    setFontSizeInput(String(curFontSize))
  }, [curFontSize])

  const commitFontSize = useCallback(() => {
    // Input is in points — convert to px for storage. Range follows Google
    // Docs (6pt – 96pt).
    const pt = parseInt(fontSizeInput, 10)
    if (!Number.isNaN(pt) && pt >= 6 && pt <= 96) {
      const px = ptToPx(pt)
      editor?.chain().focus().setMark("textStyle", { fontSize: `${px}px` }).run()
    } else {
      setFontSizeInput(String(curFontSize))
    }
  }, [editor, fontSizeInput, curFontSize])

  /* Close font-size preset menu on outside click */
  useEffect(() => {
    if (!fontSizeMenuOpen) return
    const onMouseDown = (e: MouseEvent) => {
      if (!fontSizeComboRef.current?.contains(e.target as Node)) {
        setFontSizeMenuOpen(false)
      }
    }
    document.addEventListener("mousedown", onMouseDown)
    return () => document.removeEventListener("mousedown", onMouseDown)
  }, [fontSizeMenuOpen])

  /* Close font-family menu on outside click */
  useEffect(() => {
    if (!fontFamilyMenuOpen) return
    const onMouseDown = (e: MouseEvent) => {
      if (!fontFamilyComboRef.current?.contains(e.target as Node)) {
        setFontFamilyMenuOpen(false)
      }
    }
    document.addEventListener("mousedown", onMouseDown)
    return () => document.removeEventListener("mousedown", onMouseDown)
  }, [fontFamilyMenuOpen])

  const applyFontFamily = useCallback((value: string) => {
    if (!editor) return
    if (value) {
      editor.chain().focus().setFontFamily(value).run()
    } else {
      editor.chain().focus().unsetFontFamily().run()
    }
    setFontFamilyMenuOpen(false)
  }, [editor])

  const applyFontSizePreset = useCallback((pt: number) => {
    setFontSizeInput(String(pt))
    const px = ptToPx(pt)
    editor?.chain().focus().setMark("textStyle", { fontSize: `${px}px` }).run()
    setFontSizeMenuOpen(false)
  }, [editor])

  return (
    <div
      ref={toolbarRef}
      className={`tw-toolbar${isDraggingToolbar ? " tw-toolbar--dragging" : ""}${!showToolbar ? " tw-toolbar--hidden" : ""}`}
      style={
        toolbarPos
          ? { left: toolbarPos.x, top: toolbarPos.y, bottom: "auto", transform: "none" }
          : undefined
      }
      role="toolbar"
      aria-label="Text formatting"
    >
      <div
        className="tw-toolbar__grip"
        onMouseDown={onGripMouseDown}
        title="Drag to reposition"
        aria-hidden="true"
      >
        <GripVertical size={14} />
      </div>

      <div className="tw-toolbar__font-combo" ref={fontFamilyComboRef}>
        <button
          type="button"
          className="tw-toolbar__font-trigger"
          onClick={() => setFontFamilyMenuOpen((o) => !o)}
          title="Font family"
          aria-label="Font family"
          aria-haspopup="listbox"
          aria-expanded={fontFamilyMenuOpen}
        >
          <span className="tw-toolbar__font-trigger-label">
            {FONT_OPTIONS.find((f) => f.value === selFontVal)?.label ?? "Default"}
          </span>
          <ChevronDown size={14} strokeWidth={2} aria-hidden="true" />
        </button>
        {fontFamilyMenuOpen ? (
          <ul className="tw-toolbar__font-menu" role="listbox" aria-label="Font family">
            {FONT_OPTIONS.map((option) => (
              <li key={option.value} role="option" aria-selected={option.value === selFontVal}>
                <button
                  type="button"
                  className={`tw-toolbar__font-menu-item${option.value === selFontVal ? " tw-toolbar__font-menu-item--active" : ""}`}
                  style={{ fontFamily: option.value }}
                  onMouseDown={(e) => {
                    // mousedown so this fires before any blur on the editor
                    e.preventDefault()
                    applyFontFamily(option.value)
                  }}
                >
                  {option.label}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="tw-toolbar__size-combo" ref={fontSizeComboRef}>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          className="tw-toolbar__size-input"
          value={fontSizeInput}
          title="Font size (pt) — type a value or pick from the menu"
          aria-label="Font size"
          aria-haspopup="listbox"
          aria-expanded={fontSizeMenuOpen}
          onFocus={(e) => {
            setFontSizeMenuOpen(true)
            const input = e.currentTarget
            requestAnimationFrame(() => input.select())
          }}
          onMouseDown={() => setFontSizeMenuOpen(true)}
          onMouseUp={(e) => e.preventDefault()}
          onChange={(e) => setFontSizeInput(e.target.value.replace(/[^0-9]/g, ""))}
          onBlur={commitFontSize}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              setFontSizeMenuOpen(false)
              e.currentTarget.blur()
            } else if (e.key === "Escape") {
              setFontSizeInput(String(curFontSize))
              setFontSizeMenuOpen(false)
              e.currentTarget.blur()
            } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              setFontSizeMenuOpen(true)
            }
          }}
        />
        {fontSizeMenuOpen ? (
          <ul className="tw-toolbar__size-menu" role="listbox">
            {FONT_SIZE_PRESETS.map((sz) => (
              <li key={sz} role="option" aria-selected={curFontSize === sz}>
                <button
                  type="button"
                  className={`tw-toolbar__size-menu-item${curFontSize === sz ? " tw-toolbar__size-menu-item--active" : ""}`}
                  onMouseDown={(e) => {
                    // mousedown so this fires before the input's blur
                    e.preventDefault()
                    applyFontSizePreset(sz)
                  }}
                >
                  {sz}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <span className="tw-toolbar__sep" aria-hidden="true" />

      <button
        type="button"
        className={`tw-toolbar__btn${isBold ? " tw-toolbar__btn--active" : ""}`}
        onClick={() => editor?.chain().focus().toggleBold().run()}
        title="Bold"
        aria-label="Bold"
        aria-pressed={isBold}
      >
        <Bold size={15} />
      </button>

      <button
        type="button"
        className={`tw-toolbar__btn${isItalic ? " tw-toolbar__btn--active" : ""}`}
        onClick={() => editor?.chain().focus().toggleItalic().run()}
        title="Italic"
        aria-label="Italic"
        aria-pressed={isItalic}
      >
        <Italic size={15} />
      </button>

      <button
        type="button"
        className={`tw-toolbar__btn${isUnderline ? " tw-toolbar__btn--active" : ""}`}
        onClick={() => editor?.chain().focus().toggleUnderline().run()}
        title="Underline"
        aria-label="Underline"
        aria-pressed={isUnderline}
      >
        <UnderlineIcon size={15} />
      </button>

      <label className="tw-toolbar__color-wrap" title="Text color">
        <span
          className="tw-toolbar__color-icon"
          style={{ color: curColor }}
          aria-hidden="true"
        >
          A
        </span>
        <input
          type="color"
          className="tw-toolbar__color-input"
          value={curColor}
          onChange={(e) => editor?.chain().focus().setColor(e.target.value).run()}
          aria-label="Text color"
        />
      </label>

      <label
        className={`tw-toolbar__color-wrap${isHighlightActive ? " tw-toolbar__color-wrap--active" : ""}`}
        title={isHighlightActive ? "Highlight (Cmd+Shift+H to remove)" : "Highlight color"}
      >
        <span
          className="tw-toolbar__highlight-icon"
          style={{ color: curHighlight }}
          aria-hidden="true"
        >
          <Highlighter size={15} />
        </span>
        <input
          type="color"
          className="tw-toolbar__color-input"
          value={curHighlight}
          onChange={(e) => {
            const next = e.target.value
            setLastHighlightColor(next)
            editor?.chain().focus().setHighlight({ color: next }).run()
          }}
          aria-label="Highlight color"
        />
      </label>

      <span className="tw-toolbar__sep" aria-hidden="true" />

      <div
        className="tw-toolbar__submenu-combo"
        onMouseEnter={openMenu(alignCloseTimer, setAlignMenuOpen)}
        onMouseLeave={closeMenu(alignCloseTimer, setAlignMenuOpen)}
      >
        <button
          type="button"
          className={`tw-toolbar__btn${isAlignLeft || isAlignCtr || isAlignRight ? " tw-toolbar__btn--active" : ""}`}
          onClick={() => editor?.chain().focus().setTextAlign(defaultAlign).run()}
          title={`Align ${defaultAlign} (hover for options)`}
          aria-label={`Align ${defaultAlign}`}
          aria-haspopup="menu"
          aria-expanded={alignMenuOpen}
        >
          {defaultAlign === "left" ? <AlignLeft size={15} />
            : defaultAlign === "center" ? <AlignCenter size={15} />
            : <AlignRight size={15} />}
        </button>
        {alignMenuOpen ? (
          <ul className="tw-toolbar__submenu" role="menu" aria-label="Text alignment">
            {(["left", "center", "right"] as AlignMode[]).map((mode) => {
              const Icon = mode === "left" ? AlignLeft : mode === "center" ? AlignCenter : AlignRight
              const active = mode === "left" ? isAlignLeft : mode === "center" ? isAlignCtr : isAlignRight
              return (
                <li key={mode} role="none">
                  <button
                    type="button"
                    role="menuitem"
                    className={`tw-toolbar__submenu-item${active ? " tw-toolbar__submenu-item--active" : ""}`}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      editor?.chain().focus().setTextAlign(mode).run()
                      setDefaultAlign(mode)
                      setAlignMenuOpen(false)
                    }}
                    title={`Align ${mode}`}
                    aria-label={`Align ${mode}`}
                  >
                    <Icon size={15} />
                  </button>
                </li>
              )
            })}
          </ul>
        ) : null}
      </div>

      <span className="tw-toolbar__sep" aria-hidden="true" />

      <div
        className="tw-toolbar__submenu-combo"
        onMouseEnter={openMenu(columnsCloseTimer, setColumnsMenuOpen)}
        onMouseLeave={closeMenu(columnsCloseTimer, setColumnsMenuOpen)}
      >
        <button
          type="button"
          className={`tw-toolbar__btn${isInColumns ? " tw-toolbar__btn--active" : ""}`}
          onClick={() => applyColumns(defaultColumns)}
          title={`${defaultColumns} columns (hover for options)`}
          aria-label={`${defaultColumns} columns`}
          aria-haspopup="menu"
          aria-expanded={columnsMenuOpen}
        >
          {defaultColumns === 2 ? <Columns2 size={15} />
            : defaultColumns === 3 ? <Columns3 size={15} />
            : <Columns4 size={15} />}
        </button>
        {columnsMenuOpen ? (
          <ul className="tw-toolbar__submenu" role="menu" aria-label="Columns">
            {([2, 3, 4] as ColumnCount[]).map((c) => {
              const Icon = c === 2 ? Columns2 : c === 3 ? Columns3 : Columns4
              const active = isInColumns && currentColumns === c
              return (
                <li key={c} role="none">
                  <button
                    type="button"
                    role="menuitem"
                    className={`tw-toolbar__submenu-item${active ? " tw-toolbar__submenu-item--active" : ""}`}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      applyColumns(c)
                      setDefaultColumns(c)
                      setColumnsMenuOpen(false)
                    }}
                    title={`${c} columns`}
                    aria-label={`${c} columns`}
                  >
                    <Icon size={15} />
                  </button>
                </li>
              )
            })}
          </ul>
        ) : null}
      </div>

      <span className="tw-toolbar__sep" aria-hidden="true" />

      <button
        type="button"
        className={`tw-toolbar__btn${isPaintFormatArmed ? " tw-toolbar__btn--active" : ""}`}
        onMouseDown={(e) => {
          // Use mousedown + preventDefault to keep the editor's selection intact
          // while we capture its formatting.
          e.preventDefault()
          onPaintRollerClick()
        }}
        title={isPaintFormatArmed
          ? "Format painter armed — select target text (Esc to cancel)"
          : "Format painter — select source text first, then click"}
        aria-label="Format painter"
        aria-pressed={isPaintFormatArmed}
      >
        <PaintRoller size={15} />
      </button>
    </div>
  )
}
