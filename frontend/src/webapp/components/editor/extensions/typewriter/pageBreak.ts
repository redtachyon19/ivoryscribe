// Page-break extension. Walks each visible line box (via Range.getClientRects)
// inside every text-bearing block. For each line whose vertical position would
// fall in a "bad zone" (bottom-margin of one page, the inter-page gap, or the
// top-margin of the next page) we inject a block-level inline widget
// decoration at the document position of that line's first character. The
// widget is an empty span with a fixed pixel height — equal to the distance
// needed to clear the bad zone — that ProseMirror renders into the text flow,
// forcing the rest of the paragraph onto the next page.
//
// This works for the typewriter case where a paragraph grows past the bottom
// margin while the user types: the offending line jumps cleanly to the next
// page on every keystroke.

import { Extension } from "@tiptap/react"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view"
import { PAGE_GAP_PX, PAGE_H_PX } from "../../utils/typewriterMargins"

export type PageBreakStorage = {
  mTopPx: number
  mBottomPx: number
  pageHPx: number
  gapPx: number
  /** Bumped from React when margins/page geometry change — forces a recompute. */
  remeasure: number
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

export const pageBreakKey = new PluginKey<DecorationSet>("twPageBreaks")

export const PageBreakExtension = Extension.create<unknown, PageBreakStorage>({
  name: "twPageBreaks",
  addStorage() {
    return {
      mTopPx: 96,
      mBottomPx: 96,
      pageHPx: PAGE_H_PX,
      gapPx: PAGE_GAP_PX,
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
            const mTop = storage.mTopPx
            const mBot = storage.mBottomPx
            const pageH = storage.pageHPx
            const gap = storage.gapPx
            const stride = pageH + gap
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

            // The page stack is CSS-`zoom`ed (snap-to-fit), so getClientRects()
            // returns RENDERED (zoomed) px while the page geometry below
            // (pageH / mTop / stride / contentBotInPage) is in NATURAL px.
            // Divide every measured offset by the live scale so all the
            // comparisons happen in natural px. Without this, any zoom != 100%
            // makes pages break early (zoomed in) or lets text spill past the
            // bottom margin (zoomed out). Mirrors the renderScale calibration
            // in TypewriterEditor's Cmd+Enter handler. No-op at 100% zoom.
            const surfEl = dom.closest(".tw-editor-surf") as HTMLElement | null
            let renderScale = 1
            if (surfEl) {
              const naturalW = parseFloat(surfEl.style.width || "")
              const renderedW = surfEl.getBoundingClientRect().width
              if (Number.isFinite(naturalW) && naturalW > 0 && renderedW > 0) {
                renderScale = renderedW / naturalW
              }
            }

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
                const stackY = (r.top - pmRect.top) / renderScale + mTop + cumPush
                const pageIdx = Math.floor(stackY / stride)
                const posInPage = stackY - pageIdx * stride
                const lineH = r.height / renderScale
                const overflowsBot = posInPage + lineH > contentBotInPage + 0.5
                const inTopMargin = pageIdx > 0 && posInPage < mTop - 0.5
                if (!(overflowsBot || inTopMargin)) continue
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
                  const stackY = (rect.top - pmRect.top) / renderScale + mTop + cumPush
                  const pageIdx = Math.floor(stackY / stride)
                  const posInPage = stackY - pageIdx * stride
                  const lineH = rect.height / renderScale
                  const overflowsBot = posInPage + lineH > contentBotInPage + 0.5
                  const inTopMargin = pageIdx > 0 && posInPage < mTop - 0.5
                  if (!(overflowsBot || inTopMargin)) continue
                  const targetStackY = overflowsBot
                    ? (pageIdx + 1) * stride + mTop
                    : pageIdx * stride + mTop
                  const pushPx = Math.round(targetStackY - stackY)
                  if (pushPx <= 0) continue
                  const charIdx = findFirstCharOnLine(textNode, rect)
                  if (charIdx < 0) continue
                  let docPos: number
                  try { docPos = view.posAtDOM(textNode, charIdx, -1) } catch { continue }
                  if (pushes.length > 0 && pushes[pushes.length - 1].pos === docPos) continue
                  pushes.push({ pos: docPos, pushPx })
                  cumPush += pushPx
                  // Continue checking remaining rects — long paragraphs may
                  // have multiple bad lines spanning many pages.
                }
              }
            }

            existing.forEach((s) => { s.style.removeProperty("display") })

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

            suppressOnce = true
            view.dispatch(view.state.tr.setMeta(pageBreakKey, { set }))
            // Re-position the typing caret in the same frame — its RAF runs
            // before this dispatch so it would otherwise target stale coords.
            window.dispatchEvent(new CustomEvent("tw:pagebreak"))
            schedule()
          }

          const schedule = () => {
            if (raf) return
            raf = requestAnimationFrame(recompute)
          }

          // Initial measure once layout settles
          schedule()

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
              lastSig = "__force__"
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
