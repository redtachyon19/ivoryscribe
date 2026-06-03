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

import { useCallback, useEffect, useRef, useState, type CSSProperties, type RefObject } from "react"
import { createPortal } from "react-dom"
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
  Image as ImageIcon,
  Italic,
  PaintRoller,
  Underline as UnderlineIcon,
} from "lucide-react"
import { ColorPicker } from "./ColorPicker"
import {
  DEFAULT_FONT_SIZE_PT,
  FONT_OPTIONS,
  FONT_SIZE_PRESETS,
  ptToPx,
  pxToPt,
} from "../utils/typewriterPrefs"
type AlignMode = "left" | "center" | "right"
type ColumnCount = 2 | 3 | 4

/* Curated colour palettes for the text + highlight pickers. Using an in-app
   swatch popover (instead of the OS colour dialog) keeps these controls in
   line with the rest of the toolbar's design; "Custom…" still opens a full
   picker for anything off-palette. */
const TEXT_SWATCHES = [
  "#000000", "#434343", "#666666", "#999999", "#b7b7b7", "#cccccc",
  "#cc0000", "#e06666", "#e69138", "#f1c232", "#6aa84f", "#45818e",
  "#3d85c6", "#3c4fae", "#674ea7", "#a64d79", "#85200c",
]
const HIGHLIGHT_SWATCHES = [
  "#fff475", "#fbbc04", "#f28b82", "#fdcfe8", "#d7aefb",
  "#aecbfa", "#a7ffeb", "#ccff90", "#e6c9a8", "#e8eaed",
]

type TypewriterToolbarProps = {
  editor: TiptapEditor | null
  showToolbar: boolean
  /** Fade the toolbar out while the user is typing, in sync with the other
   *  auto-hiding editor chrome (settings button, toolbar toggle, rulers). */
  isUiTyping: boolean
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
  isUiTyping,
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
  const [textColorMenuOpen, setTextColorMenuOpen] = useState(false)
  const [highlightMenuOpen, setHighlightMenuOpen] = useState(false)
  const textColorCloseTimer = useRef<number | null>(null)
  const highlightCloseTimer = useRef<number | null>(null)
  // The in-app custom colour picker, opened from the "Custom…" swatch.
  const [customPicker, setCustomPicker] = useState<null | "text" | "highlight">(null)
  const textComboRef = useRef<HTMLDivElement | null>(null)
  const highlightComboRef = useRef<HTMLDivElement | null>(null)
  const pickerRef = useRef<HTMLDivElement | null>(null)

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

  /* Close the custom colour picker on outside click or Escape. */
  useEffect(() => {
    if (!customPicker) return
    const onMouseDown = (e: MouseEvent) => {
      const combo = customPicker === "text" ? textComboRef.current : highlightComboRef.current
      const target = e.target as Node
      // The picker is portaled to <body>, so it isn't inside the combo — check
      // both so clicks within the picker don't dismiss it.
      if (combo && !combo.contains(target) && !pickerRef.current?.contains(target)) {
        setCustomPicker(null)
      }
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCustomPicker(null)
    }
    // Attach the outside-click listener on the NEXT tick. The click that opens
    // the picker unmounts the swatch palette (detaching its "Custom…" button),
    // so if we listened immediately that same click would read as "outside"
    // (the detached target is in neither the combo nor the picker) and close
    // the picker instantly. Deferring lets the opening click finish first.
    let mouseAttached = false
    const armId = window.setTimeout(() => {
      mouseAttached = true
      document.addEventListener("mousedown", onMouseDown)
    }, 0)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      window.clearTimeout(armId)
      if (mouseAttached) document.removeEventListener("mousedown", onMouseDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [customPicker])

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

  const applyAlign = useCallback((mode: AlignMode) => {
    editor?.chain().focus().setTextAlign(mode).run()
  }, [editor])

  /* ── Insert image (file picker → data URL) ── */
  const imageInputRef = useRef<HTMLInputElement | null>(null)
  const onImageFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = "" // allow re-selecting the same file
    if (!file || !file.type.startsWith("image/") || !editor) return
    const reader = new FileReader()
    reader.onload = () => editor.chain().focus().setImage({ src: String(reader.result) }).run()
    reader.readAsDataURL(file)
  }, [editor])

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
      className={`tw-toolbar${isDraggingToolbar ? " tw-toolbar--dragging" : ""}${!showToolbar ? " tw-toolbar--hidden" : ""}${isUiTyping ? " tw-toolbar--typing" : ""}`}
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

      {/* Text colour — in-app swatch popover (matches the align/columns menus) */}
      <div
        ref={textComboRef}
        className="tw-toolbar__submenu-combo"
        onMouseEnter={openMenu(textColorCloseTimer, setTextColorMenuOpen)}
        onMouseLeave={closeMenu(textColorCloseTimer, setTextColorMenuOpen)}
      >
        <button
          type="button"
          className="tw-toolbar__btn tw-toolbar__color-btn"
          onClick={() => editor?.chain().focus().setColor(curColor).run()}
          title="Text color"
          aria-label="Text color"
          aria-haspopup="menu"
          aria-expanded={textColorMenuOpen}
        >
          <span className="tw-toolbar__color-letter" aria-hidden="true">A</span>
          <span className="tw-toolbar__color-bar" style={{ background: curColor }} aria-hidden="true" />
        </button>
        {textColorMenuOpen && customPicker !== "text" ? (
          <div className="tw-toolbar__palette" role="menu" aria-label="Text color">
            <button
              type="button"
              role="menuitem"
              className="tw-toolbar__palette-reset"
              onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().unsetColor().run(); setTextColorMenuOpen(false) }}
            >
              Default
            </button>
            <div className="tw-toolbar__swatch-grid">
              {TEXT_SWATCHES.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="menuitem"
                  className={`tw-toolbar__swatch${c.toLowerCase() === curColor.toLowerCase() ? " tw-toolbar__swatch--active" : ""}`}
                  style={{ background: c }}
                  title={c}
                  aria-label={c}
                  onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().setColor(c).run(); setTextColorMenuOpen(false) }}
                />
              ))}
              <button
                type="button"
                role="menuitem"
                className="tw-toolbar__swatch tw-toolbar__swatch--custom"
                title="Custom…"
                aria-label="Custom color"
                onMouseDown={(e) => { e.preventDefault(); setTextColorMenuOpen(false); setCustomPicker("text") }}
              />
            </div>
          </div>
        ) : null}
      </div>

      {/* Highlight colour — in-app swatch popover */}
      <div
        ref={highlightComboRef}
        className="tw-toolbar__submenu-combo"
        onMouseEnter={openMenu(highlightCloseTimer, setHighlightMenuOpen)}
        onMouseLeave={closeMenu(highlightCloseTimer, setHighlightMenuOpen)}
      >
        <button
          type="button"
          className={`tw-toolbar__btn tw-toolbar__color-btn${isHighlightActive ? " tw-toolbar__btn--active" : ""}`}
          onClick={() => { setLastHighlightColor(curHighlight); editor?.chain().focus().setHighlight({ color: curHighlight }).run() }}
          title={isHighlightActive ? "Highlight (Cmd+Shift+H to remove)" : "Highlight color"}
          aria-label="Highlight color"
          aria-haspopup="menu"
          aria-expanded={highlightMenuOpen}
        >
          <Highlighter size={15} aria-hidden="true" />
          <span className="tw-toolbar__color-bar" style={{ background: curHighlight }} aria-hidden="true" />
        </button>
        {highlightMenuOpen && customPicker !== "highlight" ? (
          <div className="tw-toolbar__palette" role="menu" aria-label="Highlight color">
            <button
              type="button"
              role="menuitem"
              className="tw-toolbar__palette-reset"
              onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().unsetHighlight().run(); setHighlightMenuOpen(false) }}
            >
              None
            </button>
            <div className="tw-toolbar__swatch-grid">
              {HIGHLIGHT_SWATCHES.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="menuitem"
                  className={`tw-toolbar__swatch${c.toLowerCase() === curHighlight.toLowerCase() ? " tw-toolbar__swatch--active" : ""}`}
                  style={{ background: c }}
                  title={c}
                  aria-label={c}
                  onMouseDown={(e) => { e.preventDefault(); setLastHighlightColor(c); editor?.chain().focus().setHighlight({ color: c }).run(); setHighlightMenuOpen(false) }}
                />
              ))}
              <button
                type="button"
                role="menuitem"
                className="tw-toolbar__swatch tw-toolbar__swatch--custom"
                title="Custom…"
                aria-label="Custom highlight color"
                onMouseDown={(e) => { e.preventDefault(); setHighlightMenuOpen(false); setCustomPicker("highlight") }}
              />
            </div>
          </div>
        ) : null}
      </div>

      <span className="tw-toolbar__sep" aria-hidden="true" />

      <div
        className="tw-toolbar__submenu-combo"
        onMouseEnter={openMenu(alignCloseTimer, setAlignMenuOpen)}
        onMouseLeave={closeMenu(alignCloseTimer, setAlignMenuOpen)}
      >
        <button
          type="button"
          className={`tw-toolbar__btn${isAlignLeft || isAlignCtr || isAlignRight ? " tw-toolbar__btn--active" : ""}`}
          onClick={() => applyAlign(defaultAlign)}
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
                      applyAlign(mode)
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

      <span className="tw-toolbar__sep" aria-hidden="true" />

      {/* Insert image — opens a file picker; the image embeds as a data URL.
          You can also paste or drag-and-drop an image straight into the page. */}
      <button
        type="button"
        className="tw-toolbar__btn"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => imageInputRef.current?.click()}
        title="Insert image"
        aria-label="Insert image"
      >
        <ImageIcon size={15} />
      </button>
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={onImageFileChange}
        aria-hidden="true"
        tabIndex={-1}
      />

      {/* Custom colour picker — portaled to <body> so it can't be clipped by
          the editor's overflow:hidden or mis-stacked behind page content.
          Positioned just above its trigger button. */}
      {customPicker && typeof document !== "undefined"
        ? createPortal(
            (() => {
              const anchor = customPicker === "text" ? textComboRef.current : highlightComboRef.current
              const rect = anchor?.getBoundingClientRect()
              const style: CSSProperties = rect
                ? {
                    position: "fixed",
                    left: rect.left + rect.width / 2,
                    bottom: window.innerHeight - rect.top + 6,
                    transform: "translateX(-50%)",
                    zIndex: 1000,
                  }
                : { display: "none" }
              return (
                <div
                  ref={pickerRef}
                  className="tw-colorpicker-popover"
                  style={style}
                  role="dialog"
                  aria-label={customPicker === "text" ? "Custom text color" : "Custom highlight color"}
                >
                  {customPicker === "text" ? (
                    <ColorPicker value={curColor} onChange={(hex) => editor?.chain().setColor(hex).run()} />
                  ) : (
                    <ColorPicker
                      value={curHighlight}
                      onChange={(hex) => { setLastHighlightColor(hex); editor?.chain().setHighlight({ color: hex }).run() }}
                    />
                  )}
                </div>
              )
            })(),
            document.body,
          )
        : null}
    </div>
  )
}
