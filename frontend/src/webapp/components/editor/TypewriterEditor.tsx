import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react"
import { useEditor, EditorContent, Extension, type Editor as TiptapEditor } from "@tiptap/react"
import { Node as TipTapNode } from "@tiptap/core"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view"
import StarterKit from "@tiptap/starter-kit"
import Highlight from "@tiptap/extension-highlight"
import TextAlign from "@tiptap/extension-text-align"
import { TextStyle } from "@tiptap/extension-text-style"
import FontFamily from "@tiptap/extension-font-family"
import Color from "@tiptap/extension-color"
import Underline from "@tiptap/extension-underline"
import { DiffAddMark, DiffRemoveMark } from "../ai/diffMarks"
import { Bold, Italic, Underline as UnderlineIcon, AlignLeft, AlignCenter, AlignRight, ChevronDown, Columns2, Columns3, Columns4, GripVertical, Highlighter, PaintRoller, RulerDimensionLine, ToolCase, X } from "lucide-react"
import { FONT_OPTIONS as APP_FONT_OPTIONS } from "../../../core/appearance"
import { useTypingCaret } from "./hooks/useTypingCaret"
import { useTypingState } from "./hooks/useTypingState"
import "./TypewriterEditor.css"

/* ── Page geometry ── */
const PAGE_W_PX = 816   // 8.5in x 96 dpi
const PAGE_H_PX = 1056  // 11in  x 96 dpi
const PAGE_GAP_PX = 40

/* ── Font ── */
// Pull the typewriter's font list from the global FONT_OPTIONS so it stays in
// sync with the rest of the app (Global Settings dropdown, font family menus).
const FONT_OPTIONS = APP_FONT_OPTIONS
const DEFAULT_FONT_FAMILY = APP_FONT_OPTIONS[0]?.value ?? '"Times", "Times New Roman", serif'
// User-facing default in points (Google Docs default), with the matching px
// value derived from the 96 DPI canvas. The toolbar surfaces pt; the document
// stores px on the textStyle mark so existing renderers and the page-break
// engine keep working unchanged.
const DEFAULT_FONT_SIZE_PT = 11
const DEFAULT_FONT_SIZE_PX = ptToPx(DEFAULT_FONT_SIZE_PT)
// Google Docs "Single" line spacing, used both in the editor's inline style
// and in the Cmd+Enter line-fill heuristic.
const DEFAULT_LINE_HEIGHT = 1.15

// Google Docs' actual font size dropdown values, in points.
const FONT_SIZE_PRESETS = [8, 9, 10, 11, 12, 14, 16, 18, 24, 30, 36, 48, 60, 72, 96]

/* ── Margins ── */
const MIN_MARGIN_IN = 0.25
const MAX_MARGIN_IN = 3.0
const STORAGE_KEY = "ivoryscribe:typewriter-margins:"

type Margins = { top: number; bottom: number; left: number; right: number }

const DEFAULT_MARGINS: Margins = { top: 1, bottom: 1, left: 1.25, right: 1.25 }

function inToPx(inches: number) { return Math.round(inches * 96) }
function clamp(v: number, lo: number, hi: number) { return Math.min(hi, Math.max(lo, v)) }
// 1pt = 96/72 px at 96 DPI. Kept as floats — fractional CSS pixels render fine
// and rounding accumulates visible drift.
function ptToPx(pt: number) { return (pt * 96) / 72 }
function pxToPt(px: number) { return (px * 72) / 96 }

// Persisted UI preferences — global to the user, applied to every typewriter
// document (across tabs and projects). Default to OFF so the writing surface
// is uncluttered until the user opts in.
const SHOW_RULERS_KEY  = "ivoryscribe:typewriter-show-rulers"
const SHOW_TOOLBAR_KEY = "ivoryscribe:typewriter-show-toolbar"

function loadBoolPref(key: string): boolean {
  if (typeof window === "undefined") return false
  try {
    return window.localStorage.getItem(key) === "true"
  } catch {
    return false
  }
}
function saveBoolPref(key: string, value: boolean) {
  if (typeof window === "undefined") return
  try { window.localStorage.setItem(key, String(value)) } catch { /* ignore */ }
}

function loadMargins(id: string | null): Margins {
  if (!id) return DEFAULT_MARGINS
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}${id}`)
    if (!raw) return DEFAULT_MARGINS
    const p = JSON.parse(raw) as Partial<Margins>
    return {
      top:    typeof p.top    === "number" ? p.top    : DEFAULT_MARGINS.top,
      bottom: typeof p.bottom === "number" ? p.bottom : DEFAULT_MARGINS.bottom,
      left:   typeof p.left   === "number" ? p.left   : DEFAULT_MARGINS.left,
      right:  typeof p.right  === "number" ? p.right  : DEFAULT_MARGINS.right,
    }
  } catch { return DEFAULT_MARGINS }
}

function saveMargins(id: string | null, m: Margins) {
  if (!id) return
  try { localStorage.setItem(`${STORAGE_KEY}${id}`, JSON.stringify(m)) } catch { /* ignore */ }
}

/* ── Custom FontSize extension (adds fontSize attribute to textStyle mark) ── */
const FontSizeExtension = Extension.create({
  name: "fontSize",
  addGlobalAttributes() {
    return [
      {
        types: ["textStyle"],
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (el: HTMLElement) => el.style.fontSize || null,
            renderHTML: (attrs: Record<string, unknown>) =>
              attrs.fontSize ? { style: `font-size: ${attrs.fontSize as string}` } : {},
          },
        },
      },
    ]
  },
})

/* ── Per-paragraph indent extension ──
   Three indent attributes ride on every paragraph/heading:
     • firstLineIndent — CSS `text-indent`, just the first line
     • indentLeft      — CSS `margin-left`, the whole block
     • indentRight     — CSS `margin-right`, the whole block

   Tab / Shift-Tab cycle each selected paragraph through alternating
   first-line vs. block indents:
       0  →  first-line  →  block  →  block + first-line  →  2× block  →  …
   so the first press behaves like a typographic paragraph indent and the
   next press promotes it to a full block indent (and keeps stepping forward
   from there). Shift-Tab walks the same ladder back down. */
const TAB_INDENT_PX = 48
const ParaIndentExtension = Extension.create({
  name: "paraIndent",
  addGlobalAttributes() {
    return [
      {
        types: ["paragraph", "heading"],
        attributes: {
          indentLeft: {
            default: 0,
            parseHTML: (el: HTMLElement) => { const v = parseInt(el.style.marginLeft || "0", 10); return isNaN(v) ? 0 : v },
            renderHTML: (attrs: Record<string, unknown>) => {
              const v = attrs.indentLeft as number
              return v ? { style: `margin-left: ${v}px` } : {}
            },
          },
          indentRight: {
            default: 0,
            parseHTML: (el: HTMLElement) => { const v = parseInt(el.style.marginRight || "0", 10); return isNaN(v) ? 0 : v },
            renderHTML: (attrs: Record<string, unknown>) => {
              const v = attrs.indentRight as number
              return v ? { style: `margin-right: ${v}px` } : {}
            },
          },
          firstLineIndent: {
            default: 0,
            parseHTML: (el: HTMLElement) => { const v = parseInt(el.style.textIndent || "0", 10); return isNaN(v) ? 0 : v },
            renderHTML: (attrs: Record<string, unknown>) => {
              const v = attrs.firstLineIndent as number
              return v ? { style: `text-indent: ${v}px` } : {}
            },
          },
        },
      },
    ]
  },
  addKeyboardShortcuts() {
    // Forward one rung on the ladder. (N*TAB, 0) → (N*TAB, TAB); (N*TAB, TAB) → ((N+1)*TAB, 0).
    const stepForward = (il: number, fli: number) =>
      fli === 0
        ? { indentLeft: il, firstLineIndent: TAB_INDENT_PX }
        : { indentLeft: il + TAB_INDENT_PX, firstLineIndent: 0 }
    // Reverse: (N*TAB, TAB) → (N*TAB, 0); (N*TAB, 0) → ((N-1)*TAB, TAB).
    const stepBack = (il: number, fli: number) => {
      if (fli > 0) return { indentLeft: il, firstLineIndent: 0 }
      if (il > 0) return { indentLeft: Math.max(0, il - TAB_INDENT_PX), firstLineIndent: TAB_INDENT_PX }
      return null
    }

    // Tab steps every selected paragraph forward.
    const handleTab = () => {
      const editor = this.editor
      if (!editor) return false
      const { state, view } = editor
      const { from, to } = state.selection
      const tr = state.tr
      let changed = false
      state.doc.nodesBetween(from, to, (node, pos) => {
        if (node.type.name !== "paragraph" && node.type.name !== "heading") return
        const il = (node.attrs.indentLeft as number) || 0
        const fli = (node.attrs.firstLineIndent as number) || 0
        const next = stepForward(il, fli)
        if (next.indentLeft === il && next.firstLineIndent === fli) return
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...next })
        changed = true
      })
      if (!changed) return false
      view.dispatch(tr)
      return true
    }

    // Backspace at the very start of an indented paragraph walks one rung
    // back instead of merging into the previous block. If the cursor is
    // anywhere else — or the current paragraph has no indent — fall through
    // to the editor's default Backspace handling.
    const handleBackspace = () => {
      const editor = this.editor
      if (!editor) return false
      const { state, view } = editor
      const { selection } = state
      if (!selection.empty) return false
      const $from = selection.$from
      if ($from.parentOffset !== 0) return false
      const node = $from.parent
      if (node.type.name !== "paragraph" && node.type.name !== "heading") return false
      const il = (node.attrs.indentLeft as number) || 0
      const fli = (node.attrs.firstLineIndent as number) || 0
      const next = stepBack(il, fli)
      if (!next) return false
      const tr = state.tr.setNodeMarkup($from.before(), undefined, { ...node.attrs, ...next })
      view.dispatch(tr)
      return true
    }

    return {
      Tab: handleTab,
      Backspace: handleBackspace,
    }
  },
})

/* ── Multi-column block extension ──
   Wraps a block range in a `<div data-column-count="N">` rendered with CSS
   `column-count`. The wrapper is a node so it survives serialization and
   round-trips through TipTap. Counts are clamped to 2–4. */
const ColumnsExtension = TipTapNode.create({
  name: "columns",
  group: "block",
  content: "block+",
  defining: true,
  addAttributes() {
    return {
      count: {
        default: 2,
        parseHTML: (el: HTMLElement) => {
          const v = parseInt(el.getAttribute("data-column-count") || "2", 10)
          return Math.max(2, Math.min(4, isNaN(v) ? 2 : v))
        },
        renderHTML: (attrs: Record<string, unknown>) => {
          const c = (attrs.count as number) || 2
          return {
            "data-column-count": String(c),
            style: `column-count: ${c}; column-gap: 24px;`,
          }
        },
      },
    }
  },
  parseHTML() {
    return [{ tag: "div[data-column-count]" }]
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", { ...HTMLAttributes, class: "tw-columns" }, 0]
  },
})

/* ── Paste normalization ──
   Pasted HTML from Google Docs / Word / browsers often encodes bold, italic,
   and underline as inline `style` declarations on a `<span>` rather than as
   `<strong>` / `<em>` / `<u>` tags. Once the textStyle mark claims that span
   for font-family/size/color, TipTap's Bold/Italic/Underline parsers never
   get a turn — so the visual styling sticks but no real mark is applied,
   leaving the writer unable to toggle it off with Cmd+B/I/U.

   Normalize before TipTap parses: any element carrying `font-weight: bold`
   (or 500+), `font-style: italic`, or a `text-decoration: underline` gets
   its content wrapped in the matching standard tag. The original element /
   span is left in place so other style-driven marks (font-family, color,
   highlight) still parse normally. */
function normalizePastedFormatting(html: string): string {
  if (!html || typeof document === "undefined") return html
  const tmp = document.createElement("div")
  tmp.innerHTML = html

  const isBold = (style: string) => {
    const m = style.match(/(?:^|;)\s*font-weight\s*:\s*([^;]+)/i)
    if (!m) return false
    const v = m[1].trim().toLowerCase()
    return v === "bold" || v === "bolder" || /^[5-9]\d{2,}$/.test(v)
  }
  const isItalic = (style: string) => {
    const m = style.match(/(?:^|;)\s*font-style\s*:\s*([^;]+)/i)
    if (!m) return false
    const v = m[1].trim().toLowerCase()
    return v === "italic" || v === "oblique"
  }
  const isUnderline = (style: string) => {
    const m = style.match(/(?:^|;)\s*text-decoration(?:-line)?\s*:\s*([^;]+)/i)
    if (!m) return false
    return m[1].toLowerCase().includes("underline")
  }

  for (const el of Array.from(tmp.querySelectorAll<HTMLElement>("[style]"))) {
    const style = el.getAttribute("style") || ""
    const wrappers: string[] = []
    if (isBold(style))      wrappers.push("strong")
    if (isItalic(style))    wrappers.push("em")
    if (isUnderline(style)) wrappers.push("u")
    if (wrappers.length === 0) continue
    // Build nested wrapper chain (e.g. <strong><em><u>…</u></em></strong>) and
    // move the element's existing children inside the innermost wrapper.
    const root = document.createElement(wrappers[0])
    let leaf: HTMLElement = root
    for (let i = 1; i < wrappers.length; i++) {
      const next = document.createElement(wrappers[i])
      leaf.appendChild(next)
      leaf = next
    }
    while (el.firstChild) leaf.appendChild(el.firstChild)
    el.appendChild(root)
  }

  return tmp.innerHTML
}

/* ── Word count helper ── */
function countWords(text: string) {
  return text.trim().split(/\s+/).filter((w) => w.length > 0).length
}

/* ── Page break extension ──────────────────────────────────────────
   Walks each visible line box (via Range.getClientRects) inside every
   text-bearing block. For each line whose vertical position would fall in
   a "bad zone" (bottom-margin of one page, the inter-page gap, or the
   top-margin of the next page) we inject a *block-level inline widget
   decoration* at the document position of that line's first character.
   The widget is an empty span with a fixed pixel height — equal to the
   distance needed to clear the bad zone — that ProseMirror renders into
   the text flow, forcing the rest of the paragraph onto the next page.

   This works for the typewriter case where a paragraph grows past the
   bottom margin while the user types: the offending line jumps cleanly
   to the next page on every keystroke.
   ── */

type PageBreakStorage = {
  mTopPx:     number
  mBottomPx:  number
  pageHPx:    number
  gapPx:      number
  /** Bumped from React when margins/page geometry change — forces a recompute. */
  remeasure:  number
  /** Direct recompute trigger registered by the plugin view; called from React. */
  requestRecompute?: () => void
}

/** Binary-search for the first character offset inside `textNode` whose
 *  bounding rect sits on the same line as `lineRect`. Returns -1 if not
 *  found (shouldn't happen for a non-empty text node). */
function findFirstCharOnLine(textNode: Text, lineRect: DOMRect): number {
  const len = textNode.length
  if (len === 0) return -1
  let lo = 0
  let hi = len - 1
  const probe = document.createRange()
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    probe.setStart(textNode, mid)
    probe.setEnd(textNode, mid + 1)
    const r = probe.getBoundingClientRect()
    if (r.top >= lineRect.top - 0.5) {
      hi = mid
    } else {
      lo = mid + 1
    }
  }
  return lo
}

const pageBreakKey = new PluginKey<DecorationSet>("twPageBreaks")

const PageBreakExtension = Extension.create<unknown, PageBreakStorage>({
  name: "twPageBreaks",
  addStorage() {
    return {
      mTopPx:    96,
      mBottomPx: 96,
      pageHPx:   PAGE_H_PX,
      gapPx:     PAGE_GAP_PX,
      remeasure: 0,
    }
  },
  addProseMirrorPlugins() {
    const ext = this
    return [
      new Plugin<DecorationSet>({
        key: pageBreakKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, old) {
            const meta = tr.getMeta(pageBreakKey) as { set?: DecorationSet } | undefined
            if (meta && meta.set) return meta.set
            return old.map(tr.mapping, tr.doc)
          },
        },
        props: {
          decorations(state) { return pageBreakKey.getState(state) },
        },
        view(view: EditorView) {
          let raf = 0
          let lastSig = ""
          let suppressOnce = false

          const recompute = () => {
            raf = 0
            if (suppressOnce) { suppressOnce = false; return }

            const storage = ext.storage as PageBreakStorage
            const mTop    = storage.mTopPx
            const mBot    = storage.mBottomPx
            const pageH   = storage.pageHPx
            const gap     = storage.gapPx
            const stride  = pageH + gap
            const contentBotInPage = pageH - mBot   // posInPage threshold for bottom

            const dom = view.dom as HTMLElement
            if (!dom.isConnected) return

            // Hide our own spacer widgets so we read NATURAL line positions.
            // The base `.tw-page-spacer` rule uses `display: block !important`
            // (so nothing collapses the spacer height in normal flow), so we
            // must override that with an `!important` inline display:none here
            // and remove the property afterwards to restore.
            const existing = dom.querySelectorAll<HTMLElement>(".tw-page-spacer")
            existing.forEach((s) => { s.style.setProperty("display", "none", "important") })
            // Force a synchronous reflow so subsequent rect reads are post-hide.
            void dom.offsetHeight

            const pmRect = dom.getBoundingClientRect()
            type Push = { pos: number; pushPx: number }
            const pushes: Push[] = []
            let cumPush = 0  // total pushes accumulated above the current line

            const blocks = Array.from(dom.children) as HTMLElement[]

            for (const block of blocks) {
              // Skip our own spacer placeholders if any leaked to top level
              if (block.classList.contains("tw-page-spacer")) continue

              const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT)
              let n: Node | null
              const textNodes: Text[] = []
              while ((n = walker.nextNode())) {
                textNodes.push(n as Text)
              }

              // Empty block (no text): treat the block element itself as a single line
              if (textNodes.length === 0 || textNodes.every((t) => !t.length)) {
                const r = block.getBoundingClientRect()
                if (r.height < 1) continue
                const stackY = (r.top - pmRect.top) + mTop + cumPush
                const pageIdx = Math.floor(stackY / stride)
                const posInPage = stackY - pageIdx * stride
                const lineH = r.height
                const overflowsBot = posInPage + lineH > contentBotInPage + 0.5
                const inTopMargin  = pageIdx > 0 && posInPage < mTop - 0.5
                if (!(overflowsBot || inTopMargin)) continue
                // Bottom-overflow → start of next page; top-margin → start of current page.
                const targetStackY = overflowsBot
                  ? (pageIdx + 1) * stride + mTop
                  : pageIdx * stride + mTop
                const pushPx = Math.round(targetStackY - stackY)
                if (pushPx <= 0) continue
                let docPos: number
                try { docPos = view.posAtDOM(block, 0, -1) } catch { continue }
                pushes.push({ pos: docPos, pushPx })
                cumPush += pushPx
                continue
              }

              for (const textNode of textNodes) {
                if (!textNode.length) continue
                const range = document.createRange()
                range.selectNodeContents(textNode)
                const rects = Array.from(range.getClientRects())
                for (const rect of rects) {
                  if (rect.height < 1 || rect.width < 1) continue
                  const stackY = (rect.top - pmRect.top) + mTop + cumPush
                  const pageIdx = Math.floor(stackY / stride)
                  const posInPage = stackY - pageIdx * stride
                  const lineH = rect.height
                  const overflowsBot = posInPage + lineH > contentBotInPage + 0.5
                  const inTopMargin  = pageIdx > 0 && posInPage < mTop - 0.5
                  if (!(overflowsBot || inTopMargin)) continue
                  // Bottom-overflow → start of next page; top-margin → start of current page.
                  const targetStackY = overflowsBot
                    ? (pageIdx + 1) * stride + mTop
                    : pageIdx * stride + mTop
                  const pushPx = Math.round(targetStackY - stackY)
                  if (pushPx <= 0) continue
                  const charIdx = findFirstCharOnLine(textNode, rect)
                  if (charIdx < 0) continue
                  let docPos: number
                  try { docPos = view.posAtDOM(textNode, charIdx, -1) } catch { continue }
                  // Avoid duplicate decorations at the same doc position
                  if (pushes.length > 0 && pushes[pushes.length - 1].pos === docPos) continue
                  pushes.push({ pos: docPos, pushPx })
                  cumPush += pushPx
                  // Continue checking remaining rects in this text node — long
                  // paragraphs may have multiple bad lines spanning many pages.
                }
              }
            }

            // Restore our spacer widgets (they'll be replaced below if changed)
            existing.forEach((s) => { s.style.removeProperty("display") })

            // Build a stable signature; bail if nothing changed.
            const sig = pushes.map((p) => `${p.pos}:${p.pushPx}`).join(",")
            if (sig === lastSig) return
            lastSig = sig

            const decos = pushes.map((p) =>
              Decoration.widget(p.pos, () => {
                const div = document.createElement("div")
                div.className = "tw-page-spacer"
                div.style.cssText = [
                  "display:block",
                  "width:100%",
                  `height:${p.pushPx}px`,
                  "pointer-events:none",
                  "user-select:none",
                  "margin:0",
                  "padding:0",
                  "flex-shrink:0",
                ].join(";")
                return div
              }, { side: -1, ignoreSelection: true, key: `tw-pb-${p.pos}-${p.pushPx}` })
            )
            const set = DecorationSet.create(view.state.doc, decos)

            // Avoid recursing on the transaction we're about to dispatch.
            suppressOnce = true
            view.dispatch(view.state.tr.setMeta(pageBreakKey, { set }))
            // Re-position the typing caret in the same frame — its RAF runs
            // before this dispatch so it would otherwise target stale coords.
            window.dispatchEvent(new CustomEvent("tw:pagebreak"))
            // After dispatch, schedule one more pass — the new layout may
            // surface additional bad lines that became visible.
            schedule()
          }

          const schedule = () => {
            if (raf) return
            raf = requestAnimationFrame(recompute)
          }

          // Initial measure once layout settles
          schedule()

          // Recompute on window resize / scroll (line widths can change)
          const onResize = () => schedule()
          window.addEventListener("resize", onResize)

          // Direct trigger from React (margins changed). Bypasses both polling
          // latency and the lastSig short-circuit.
          ;(ext.storage as PageBreakStorage).requestRecompute = () => {
            lastSig = "__force__"
            schedule()
          }

          // Watch storage.remeasure for margin changes from React (fallback)
          let lastRemeasure = (ext.storage as PageBreakStorage).remeasure
          const pollId = window.setInterval(() => {
            const r = (ext.storage as PageBreakStorage).remeasure
            if (r !== lastRemeasure) {
              lastRemeasure = r
              lastSig = "__force__"  // invalidate cache
              schedule()
            }
          }, 80)

          return {
            update: () => schedule(),
            destroy: () => {
              if (raf) cancelAnimationFrame(raf)
              window.removeEventListener("resize", onResize)
              window.clearInterval(pollId)
              ;(ext.storage as PageBreakStorage).requestRecompute = undefined
            },
          }
        },
      }),
    ]
  },
})

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
  const toolbarRef = useRef<HTMLDivElement | null>(null)
  const [toolbarPos, setToolbarPos] = useState<{ x: number; y: number } | null>(null)
  const [isDraggingToolbar, setIsDraggingToolbar] = useState(false)
  const toolbarDragStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 })

  /* ── Ruler drag ── */
  type RulerSide = "left" | "right" | "top" | "bottom"
  type RulerDrag = {
    side: RulerSide
    pageTop: number
    /** True when drag started with a non-empty selection — changes paragraph indent, not global margin. */
    indentMode: boolean
    /** Selection captured at drag-start; used throughout the drag so clearing focus can't break it. */
    selFrom: number
    selTo: number
    /** Indent of the opposite axis captured at drag-start so the other side is preserved. */
    snapIndentLeft: number
    snapIndentRight: number
  }
  const [rulerDrag, setRulerDrag] = useState<RulerDrag | null>(null)

  /* ── Typing state ── */
  const { isUiTyping, markUiTypingActivity } = useTypingState({ onTypingStateChange })

  /* ── Ruler visibility (persisted globally; default off) ── */
  const [showRulers, setShowRulers] = useState<boolean>(() => loadBoolPref(SHOW_RULERS_KEY))
  useEffect(() => { saveBoolPref(SHOW_RULERS_KEY, showRulers) }, [showRulers])

  /* ── Toolbar visibility (persisted globally; default off) ── */
  const [showToolbar, setShowToolbar] = useState<boolean>(() => loadBoolPref(SHOW_TOOLBAR_KEY))
  useEffect(() => { saveBoolPref(SHOW_TOOLBAR_KEY, showToolbar) }, [showToolbar])

  /* ── Local font-size input state (free text typing, commits on Enter/blur).
       Toolbar value is in points; the document still stores px on textStyle. */
  const [fontSizeInput, setFontSizeInput] = useState<string>(String(DEFAULT_FONT_SIZE_PT))
  const [fontSizeMenuOpen, setFontSizeMenuOpen] = useState(false)
  const fontSizeComboRef = useRef<HTMLDivElement | null>(null)

  /* ── Font family dropdown (custom popup matching the global settings style) ── */
  const [fontFamilyMenuOpen, setFontFamilyMenuOpen] = useState(false)
  const fontFamilyComboRef = useRef<HTMLDivElement | null>(null)

  /* ── Align combo: collapsed into a single button that remembers the most
       recently chosen alignment. Hover reveals the other options above the
       toolbar; clicking the button itself reapplies the remembered choice. */
  type AlignMode = "left" | "center" | "right"
  const [alignMenuOpen, setAlignMenuOpen] = useState(false)
  const [defaultAlign, setDefaultAlign] = useState<AlignMode>("left")

  /* ── Columns combo: same hover-submenu pattern. Submenu offers 1 (remove),
       2, 3, 4 columns; the trigger remembers the last applied count. */
  type ColumnCount = 2 | 3 | 4
  const [columnsMenuOpen, setColumnsMenuOpen] = useState(false)
  const [defaultColumns, setDefaultColumns] = useState<ColumnCount>(2)

  /* Hover menus close on a short delay rather than instantly so a brief
     mouse excursion (e.g. crossing the gap between trigger and menu, or
     a wobble on the way to a menu item) doesn't dismiss the popup. The
     CSS bridge below the menu already buffers the gap, but the timer
     covers any remaining off-axis cursor paths. */
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

  /* ── Format painter ── */
  type PaintFormat = {
    bold: boolean
    italic: boolean
    underline: boolean
    fontFamily: string | null
    fontSize: string | null
    color: string | null
    highlight: string | null
    textAlign: string
    indentLeft: number
    indentRight: number
  }
  const [paintFormat, setPaintFormat] = useState<PaintFormat | null>(null)

  /* ── Force re-render on selection/transaction for active state display ── */
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
      transformPastedHTML: normalizePastedFormatting,
    },
    content: content || "<p></p>",
    onUpdate: ({ editor: ed }) => {
      const html = ed.getHTML()
      onContentChange(html)

      const docWords = countWords(ed.getText())
      const { from, to } = ed.state.selection
      const selWords = from === to ? null : countWords(ed.state.doc.textBetween(from, to, " "))
      onWordCountChange?.({ documentWordCount: docWords, selectedWordCount: selWords })

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

  /* ── Sync content on document switch ── */
  useEffect(() => {
    if (!editor) return
    const next = content || "<p></p>"
    if (editor.getHTML() === next) return
    editor.commands.setContent(next, { emitUpdate: false })
  }, [editor, content, documentId])

  /* ── Read-only toggle (used during AI diff review) ── */
  useEffect(() => {
    if (!editor) return
    if ((editor as { isDestroyed?: boolean }).isDestroyed) return
    try {
      editor.setEditable(!readOnly)
    } catch {
      /* editor may have been torn down between render and effect */
    }
  }, [editor, readOnly])

  /* ── Expose editor instance to parent (for diff command dispatching) ── */
  useEffect(() => {
    if (!onEditorReady) return
    try {
      onEditorReady(editor)
    } catch {
      /* parent handler unmounted */
    }
    return () => {
      try {
        onEditorReady(null)
      } catch {
        /* parent handler unmounted */
      }
    }
  }, [editor, onEditorReady])

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
    const onSel = () => {
      const docWords = countWords(editor.getText())
      const { from, to } = editor.state.selection
      const selWords = from === to ? null : countWords(editor.state.doc.textBetween(from, to, " "))
      onWordCountChange?.({ documentWordCount: docWords, selectedWordCount: selWords })
    }
    editor.on("selectionUpdate", onSel)
    return () => { editor.off("selectionUpdate", onSel) }
  }, [editor, onWordCountChange])

  /* ── Toolbar drag ──
     The toolbar uses `position: fixed`, so its `left`/`top` are in viewport
     coords. Capture the drag origin in viewport coords too so toggling/resizing
     a rail mid-session can't shift the dragged toolbar. */
  const handleToolbarGripDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const rect = toolbarRef.current?.getBoundingClientRect()
    if (!rect) return
    setIsDraggingToolbar(true)
    toolbarDragStart.current = {
      x: e.clientX, y: e.clientY,
      ox: rect.left,
      oy: rect.top,
    }
  }, [])

  useEffect(() => {
    if (!isDraggingToolbar) return
    const onMove = (e: MouseEvent) => {
      const s = toolbarDragStart.current
      setToolbarPos({ x: s.ox + (e.clientX - s.x), y: s.oy + (e.clientY - s.y) })
    }
    const onUp = () => setIsDraggingToolbar(false)
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup",   onUp)
    return () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup",   onUp)
    }
  }, [isDraggingToolbar])

  /* ── Ruler drag ── */
  const handleRulerDown = useCallback(
    (side: RulerSide, pageTop = 0) => (e: React.MouseEvent) => {
      e.preventDefault()
      const sel = editor?.state.selection
      const hasSelection = !!(sel && !sel.empty)
      // Capture the current paragraph's indents so the opposite side is preserved during drag.
      let snapIndentLeft = 0
      let snapIndentRight = 0
      let selFrom = 0
      let selTo = 0
      if (hasSelection && editor && sel) {
        selFrom = sel.from
        selTo   = sel.to
        editor.state.doc.nodesBetween(selFrom, Math.min(selTo, selFrom + 1), (node) => {
          if (node.type.name === "paragraph" || node.type.name === "heading") {
            snapIndentLeft  = (node.attrs.indentLeft  as number) || 0
            snapIndentRight = (node.attrs.indentRight as number) || 0
            return false
          }
        })
      }
      setRulerDrag({ side, pageTop, indentMode: hasSelection, selFrom, selTo, snapIndentLeft, snapIndentRight })
    },
    [editor],
  )

  useEffect(() => {
    if (!rulerDrag) return
    const onMove = (e: MouseEvent) => {
      const { side, pageTop } = rulerDrag
      if (side === "left" || side === "right") {
        const rect = rulerXRef.current?.getBoundingClientRect()
        if (!rect) return
        const xInRuler = e.clientX - rect.left
        if (rulerDrag.indentMode) {
          // Indent mode: adjust the paragraph indent of selected nodes.
          // The handle lives inside the content zone (between global margins),
          // so indent = cursor position − global left margin edge.
          const maxIndent = PAGE_W_PX - mLeftPx - mRightPx - 96 // leave ≥1in content width
          const newLeft  = side === "left"  ? clamp(Math.round(xInRuler - mLeftPx), 0, maxIndent) : rulerDrag.snapIndentLeft
          const newRight = side === "right" ? clamp(Math.round((PAGE_W_PX - mRightPx) - xInRuler), 0, maxIndent) : rulerDrag.snapIndentRight
          if (!editor) return
          // Use the selection captured at drag-start so focus loss can't break the drag.
          const { selFrom, selTo } = rulerDrag
          const tr = editor.state.tr
          let changed = false
          editor.state.doc.nodesBetween(selFrom, selTo, (node, pos) => {
            if (node.type.name === "paragraph" || node.type.name === "heading") {
              tr.setNodeMarkup(pos, undefined, { ...node.attrs, indentLeft: newLeft, indentRight: newRight })
              changed = true
            }
          })
          if (changed) editor.view.dispatch(tr)
          // Keep snapIndent values in sync with the live paragraph values so the
          // handle tracks the text correctly while dragging.
          setRulerDrag((prev) => prev
            ? { ...prev, snapIndentLeft: newLeft, snapIndentRight: newRight }
            : prev)
        } else if (side === "left") {
          setMargins((p) => ({ ...p, left: clamp(xInRuler / 96, MIN_MARGIN_IN, MAX_MARGIN_IN) }))
        } else {
          setMargins((p) => ({ ...p, right: clamp((PAGE_W_PX - xInRuler) / 96, MIN_MARGIN_IN, MAX_MARGIN_IN) }))
        }
      } else {
        const rect = rulerYRef.current?.getBoundingClientRect()
        if (!rect) return
        // Translate the cursor into the page-local coordinate space so
        // dragging top/bottom handles on any page works (not just page 0).
        const yInPage = e.clientY - rect.top - pageTop
        if (side === "top") {
          setMargins((p) => ({ ...p, top: clamp(yInPage / 96, MIN_MARGIN_IN, MAX_MARGIN_IN) }))
        } else {
          setMargins((p) => ({ ...p, bottom: clamp((PAGE_H_PX - yInPage) / 96, MIN_MARGIN_IN, MAX_MARGIN_IN) }))
        }
      }
    }
    const onUp = () => setRulerDrag(null)
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup",   onUp)
    return () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup",   onUp)
    }
  }, [rulerDrag])

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

  /* ── Toolbar active states ── */
  const isBold       = editor?.isActive("bold")                  ?? false
  const isItalic     = editor?.isActive("italic")                ?? false
  const isUnderline  = editor?.isActive("underline")             ?? false
  const isAlignLeft  = editor?.isActive({ textAlign: "left" })   ?? false
  const isAlignCtr   = editor?.isActive({ textAlign: "center" }) ?? false
  const isAlignRight = editor?.isActive({ textAlign: "right" })  ?? false

  /* Walk up the selection's ancestors to spot a `columns` wrapper so the
     toolbar button can flip between "wrap selection" and "update count." */
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

  const curFontFamily  = (editor?.getAttributes("textStyle").fontFamily as string | null) ?? ""
  const curColorRaw    = (editor?.getAttributes("textStyle").color as string | null) ?? ""
  // Resolve default text color from the app palette CSS variable (lives on .app element)
  const paletteTextColor = typeof document !== "undefined"
    ? getComputedStyle(document.querySelector(".app") ?? document.documentElement)
        .getPropertyValue("--editor-text").trim() || "#000000"
    : "#000000"
  const curColor       = curColorRaw && /^#[0-9a-fA-F]{3,6}$/.test(curColorRaw) ? curColorRaw : paletteTextColor

  /* Highlight color — read from the active highlight mark if any, else fall
     back to the last color the user picked from the toolbar (yellow on first
     load). Picking a new color via the swatch both applies the highlight to
     the current selection and remembers the choice for future clicks. */
  const curHighlightRaw = (editor?.getAttributes("highlight").color as string | null) ?? ""
  const isHighlightActive = !!curHighlightRaw
  const [lastHighlightColor, setLastHighlightColor] = useState<string>("#ffffff")
  const curHighlight = curHighlightRaw && /^#[0-9a-fA-F]{3,6}$/.test(curHighlightRaw) ? curHighlightRaw : lastHighlightColor
  // The textStyle mark stores font-size as a CSS string. Older docs used px;
  // new docs may use pt. Detect the unit and convert to points for the toolbar.
  const curFontSizeStr = (editor?.getAttributes("textStyle").fontSize as string | null) ?? ""
  const curFontSizePt = (() => {
    if (!curFontSizeStr) return DEFAULT_FONT_SIZE_PT
    const num = parseFloat(curFontSizeStr)
    if (Number.isNaN(num)) return DEFAULT_FONT_SIZE_PT
    if (curFontSizeStr.trim().endsWith("pt")) return Math.round(num)
    // assume px otherwise
    return Math.round(pxToPt(num))
  })()
  const curFontSize    = curFontSizePt   // toolbar display value, in pt
  const selFontVal     = FONT_OPTIONS.find((f) => f.value === curFontFamily)?.value ?? ""

  /* Mirror the editor's current font size into the input whenever the editor
     reports a different value (e.g., user moved the cursor into a span with a
     different size). */
  useEffect(() => {
    setFontSizeInput(String(curFontSize))
  }, [curFontSize])

  const commitFontSize = useCallback(() => {
    // User typed a value in points — convert to px for storage. Range follows
    // Google Docs (6pt – 96pt).
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
    // Preset list is in points; convert to px for storage.
    setFontSizeInput(String(pt))
    const px = ptToPx(pt)
    editor?.chain().focus().setMark("textStyle", { fontSize: `${px}px` }).run()
    setFontSizeMenuOpen(false)
  }, [editor])

  /* ── Format painter: capture the current selection's formatting; the next
     non-empty selection completed in the editor will receive these attributes. */
  const handlePaintRollerClick = useCallback(() => {
    if (!editor) return
    if (paintFormat) {
      // Already armed — clicking again cancels the operation.
      setPaintFormat(null)
      return
    }
    const sel = editor.state.selection
    if (sel.empty) return
    const ts = editor.getAttributes("textStyle") as Record<string, unknown>
    const para = editor.getAttributes("paragraph") as Record<string, unknown>
    const heading = editor.getAttributes("heading") as Record<string, unknown>
    setPaintFormat({
      bold: editor.isActive("bold"),
      italic: editor.isActive("italic"),
      underline: editor.isActive("underline"),
      fontFamily: (ts.fontFamily as string | null | undefined) ?? null,
      fontSize:   (ts.fontSize   as string | null | undefined) ?? null,
      color:      (ts.color      as string | null | undefined) ?? null,
      highlight:  ((editor.getAttributes("highlight") as Record<string, unknown>).color as string | null | undefined) ?? null,
      textAlign:  ((para.textAlign ?? heading.textAlign ?? "left") as string),
      indentLeft:  ((para.indentLeft  ?? heading.indentLeft  ?? 0) as number),
      indentRight: ((para.indentRight ?? heading.indentRight ?? 0) as number),
    })
  }, [editor, paintFormat])

  /* When armed, apply the captured format on the next mouseup that ends with a
     non-empty selection inside the editor. Then disarm. */
  useEffect(() => {
    if (!editor || !paintFormat) return
    let dom: HTMLElement
    try {
      dom = editor.view.dom as HTMLElement
    } catch {
      return
    }

    const handleMouseUp = () => {
      // Defer one tick so ProseMirror's selection state has settled.
      window.setTimeout(() => {
        const sel = editor.state.selection
        if (sel.empty) return

        let chain = editor.chain().focus()

        // Inline marks (bold / italic / underline)
        chain = paintFormat.bold      ? chain.setBold()      : chain.unsetBold()
        chain = paintFormat.italic    ? chain.setItalic()    : chain.unsetItalic()
        chain = paintFormat.underline ? chain.setUnderline() : chain.unsetUnderline()

        // textStyle mark — apply font family / size / color together
        chain = chain.setMark("textStyle", {
          fontFamily: paintFormat.fontFamily,
          fontSize:   paintFormat.fontSize,
          color:      paintFormat.color,
        })

        // Highlight
        if (paintFormat.highlight) {
          chain = chain.setHighlight({ color: paintFormat.highlight })
        } else {
          chain = chain.unsetHighlight()
        }

        // Paragraph / heading text-align
        chain = chain.setTextAlign(paintFormat.textAlign)

        chain.run()

        // Block-level paragraph/heading indent attrs (custom — direct tr)
        const tr = editor.state.tr
        let changed = false
        const from = sel.from
        const to = sel.to
        editor.state.doc.nodesBetween(from, to, (node, pos) => {
          if (node.type.name === "paragraph" || node.type.name === "heading") {
            tr.setNodeMarkup(pos, undefined, {
              ...node.attrs,
              indentLeft:  paintFormat.indentLeft,
              indentRight: paintFormat.indentRight,
            })
            changed = true
          }
        })
        if (changed) editor.view.dispatch(tr)

        setPaintFormat(null)
      }, 0)
    }

    dom.addEventListener("mouseup", handleMouseUp)
    return () => dom.removeEventListener("mouseup", handleMouseUp)
  }, [editor, paintFormat])

  /* Esc cancels the armed format painter */
  useEffect(() => {
    if (!paintFormat) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPaintFormat(null)
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [paintFormat])

  /* ── Selection-aware ruler values ── */
  // During an active indent drag we stay in indent mode even if the editor lost focus.
  const hasNonEmptySelection = rulerDrag?.indentMode || (editor ? !editor.state.selection.empty : false)
  // Read current paragraph/heading indent at the selection head for ruler handle positioning.
  let selIndentLeftPx  = 0
  let selIndentRightPx = 0
  if (hasNonEmptySelection && editor) {
    // Prefer the captured drag-start snaps when a drag is active (selection may be gone).
    if (rulerDrag?.indentMode) {
      selIndentLeftPx  = rulerDrag.snapIndentLeft
      selIndentRightPx = rulerDrag.snapIndentRight
    } else {
      const head = editor.state.selection.head
      editor.state.doc.nodesBetween(Math.max(0, head - 1), head, (node) => {
        if (node.type.name === "paragraph" || node.type.name === "heading") {
          selIndentLeftPx  = (node.attrs.indentLeft  as number) || 0
          selIndentRightPx = (node.attrs.indentRight as number) || 0
          return false
        }
      })
    }
  }
  // Handle positions differ based on whether a selection is active.
  const leftHandleX  = hasNonEmptySelection ? mLeftPx  + selIndentLeftPx                : mLeftPx
  const rightHandleX = hasNonEmptySelection ? PAGE_W_PX - mRightPx - selIndentRightPx   : PAGE_W_PX - mRightPx

  /* ── Ruler tick arrays ── */
  const xTicks = Array.from({ length: 20 }, (_, i) => {
    const x = Math.round((i * 0.5) * 96)
    return x <= PAGE_W_PX ? { x, major: i % 2 === 0, label: i / 2 } : null
  }).filter(Boolean) as { x: number; major: boolean; label: number }[]

  const yTicks = Array.from({ length: 24 }, (_, i) => {
    const y = Math.round((i * 0.5) * 96)
    return y <= PAGE_H_PX ? { y, major: i % 2 === 0, label: i / 2 } : null
  }).filter(Boolean) as { y: number; major: boolean; label: number }[]

  // All ticks across every page, offset by each page's top position
  const allYTicks = Array.from({ length: numPages }, (_, pageIndex) => {
    const pageTop = pageIndex * (PAGE_H_PX + PAGE_GAP_PX)
    return yTicks.map((t) => ({ ...t, absY: pageTop + t.y, pageIndex }))
  }).flat()

  /* ── Render ── */
  return (
    <div className="tw-outer" ref={outerRef}>

      {/* scroll container */}
      <div className="tw-scroll">

        {/* ruler row: spacer (above y-ruler) + horizontal ruler + corner toggle button */}
        <div className="tw-ruler-row">
          <div className="tw-corner-bg" aria-hidden="true" />
          <div className="tw-corner-spacer" aria-hidden="true" />

          <div
            className={`tw-ruler-x${isUiTyping ? " tw-ruler-x--typing" : ""}${!showRulers ? " tw-ruler-x--hidden" : ""}`}
            ref={rulerXRef}
            style={{ width: PAGE_W_PX } as CSSProperties}
            aria-hidden="true"
          >
            {xTicks.map(({ x, major, label }) => (
              <div
                key={x}
                className={`tw-ruler__tick tw-ruler__tick--x${major ? " tw-ruler__tick--major" : " tw-ruler__tick--minor"}`}
                style={{ left: x }}
              >
                {major && x > 0 && x < PAGE_W_PX ? (
                  <span className="tw-ruler__label">{label}</span>
                ) : null}
              </div>
            ))}

            <div
              className={`tw-ruler__handle tw-ruler__handle--x${hasNonEmptySelection ? " tw-ruler__handle--indent" : ""}`}
              style={{ left: leftHandleX }}
              onMouseDown={handleRulerDown("left")}
              title={hasNonEmptySelection
                ? `Left indent: ${(selIndentLeftPx / 96).toFixed(2)} in`
                : `Left margin: ${margins.left.toFixed(2)} in`}
            />
            <div
              className={`tw-ruler__handle tw-ruler__handle--x${hasNonEmptySelection ? " tw-ruler__handle--indent" : ""}`}
              style={{ left: rightHandleX }}
              onMouseDown={handleRulerDown("right")}
              title={hasNonEmptySelection
                ? `Right indent: ${(selIndentRightPx / 96).toFixed(2)} in`
                : `Right margin: ${margins.right.toFixed(2)} in`}
            />
          </div>

          <button
            type="button"
            className="tw-corner-btn"
            onClick={() => setShowRulers((v) => !v)}
            title={showRulers ? "Hide rulers" : "Show rulers"}
            aria-label={showRulers ? "Hide rulers" : "Show rulers"}
          >
            <span className={`tw-corner-btn__icon${showRulers ? " tw-corner-btn__icon--visible" : ""}`} aria-hidden="true">
              <X size={14} />
            </span>
            <span className={`tw-corner-btn__icon${!showRulers ? " tw-corner-btn__icon--visible" : ""}`} aria-hidden="true">
              <RulerDimensionLine size={14} />
            </span>
          </button>
        </div>

        {/* body row: vertical ruler + pages */}
        <div className="tw-body-row">

          <div
            className={`tw-ruler-y${isUiTyping || !showRulers ? " tw-ruler-y--typing" : ""}`}
            ref={rulerYRef}
            style={{ height: totalH + 48 } as CSSProperties}
            aria-hidden="true"
          >
            {/* Per-page rails: bg + right border for each page; gaps stay empty */}
            {Array.from({ length: numPages }, (_, i) => (
              <div
                key={`rail-${i}`}
                className="tw-ruler-y-rail"
                style={{
                  top: i * (PAGE_H_PX + PAGE_GAP_PX),
                  height: PAGE_H_PX,
                } as CSSProperties}
              />
            ))}

            {/* Ticks for every page */}
            {allYTicks.map(({ absY, major, label, pageIndex }) => (
              <div
                key={`${pageIndex}-${absY}`}
                className={`tw-ruler__tick tw-ruler__tick--y${major ? " tw-ruler__tick--major" : " tw-ruler__tick--minor"}`}
                style={{ top: absY }}
              >
                {major && label > 0 && label < 11 ? (
                  <span className="tw-ruler__label tw-ruler__label--y">{label}</span>
                ) : null}
              </div>
            ))}

            {/* Margin handles repeated on every page */}
            {Array.from({ length: numPages }, (_, pageIndex) => {
              const pageTop = pageIndex * (PAGE_H_PX + PAGE_GAP_PX)
              return (
                <>
                  <div
                    key={`top-${pageIndex}`}
                    className="tw-ruler__handle tw-ruler__handle--y"
                    style={{ top: pageTop + mTopPx } as CSSProperties}
                    onMouseDown={handleRulerDown("top", pageTop)}
                    title={`Top margin: ${margins.top.toFixed(2)} in`}
                  />
                  <div
                    key={`bottom-${pageIndex}`}
                    className="tw-ruler__handle tw-ruler__handle--y"
                    style={{ top: pageTop + PAGE_H_PX - mBottomPx } as CSSProperties}
                    onMouseDown={handleRulerDown("bottom", pageTop)}
                    title={`Bottom margin: ${margins.bottom.toFixed(2)} in`}
                  />
                </>
              )
            })}
          </div>

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
              className={`tw-editor-surf${paintFormat ? " tw-editor-surf--paint-armed" : ""}`}
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

      {/* floating toolbar */}
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
          onMouseDown={handleToolbarGripDown}
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
              // Highlight existing value so the next keystroke replaces it.
              // rAF defers past the click that positions the caret.
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
                        // mousedown + preventDefault keeps the editor selection
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
          className={`tw-toolbar__btn${paintFormat ? " tw-toolbar__btn--active" : ""}`}
          onMouseDown={(e) => {
            // Use mousedown + preventDefault to keep the editor's selection intact
            // while we capture its formatting.
            e.preventDefault()
            handlePaintRollerClick()
          }}
          title={paintFormat
            ? "Format painter armed — select target text (Esc to cancel)"
            : "Format painter — select source text first, then click"}
          aria-label="Format painter"
          aria-pressed={!!paintFormat}
        >
          <PaintRoller size={15} />
        </button>
      </div>
    </div>
  )
}
