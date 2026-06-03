// Find & Replace search highlight. A ProseMirror decoration plugin (same
// pattern as pageBreak.ts) that paints every match of the active query and
// emphasises the one the user is currently navigating to.
//
// Why decorations and not a native selection or a mark:
//   • A `window.getSelection()` range (the old approach) vanishes the moment
//     focus returns to the Find box, and ProseMirror can reclaim it — so the
//     highlight flickered out and only ever marked one match.
//   • A real mark would mutate the document and pollute undo history.
// Decorations are view-only, survive focus changes, cover ALL matches, and
// never touch the document.

import { Extension } from "@tiptap/react"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"
import type { Node as ProseMirrorNode } from "@tiptap/pm/model"

export const searchHighlightKey = new PluginKey<DecorationSet>("searchHighlight")

type SearchHighlightMeta = { query: string; active: number } | "clear"

/** Walk the doc in document order, highlight every (case-insensitive)
 *  occurrence of `query`, and add the active class to the `active`-th one.
 *  Occurrences are counted per text node in document order, which matches the
 *  order useFindReplaceModal assigns occurrence indices for prose docs. */
function buildDecorations(doc: ProseMirrorNode, query: string, active: number): DecorationSet {
  const needle = query.trim().toLowerCase()
  if (!needle) return DecorationSet.empty

  const decorations: Decoration[] = []
  let occurrence = 0

  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return
    const haystack = node.text.toLowerCase()
    let fromIndex = 0

    while (fromIndex <= haystack.length - needle.length) {
      const index = haystack.indexOf(needle, fromIndex)
      if (index === -1) break

      const start = pos + index
      const end = start + needle.length
      const className = occurrence === active ? "search-hit search-hit--active" : "search-hit"
      decorations.push(Decoration.inline(start, end, { class: className }))

      occurrence += 1
      fromIndex = index + Math.max(1, needle.length)
    }
  })

  return DecorationSet.create(doc, decorations)
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    searchHighlight: {
      /** Paint all matches of `query` and emphasise occurrence `active`. */
      setSearchHighlight: (options: { query: string; active: number }) => ReturnType
      /** Remove all search-highlight decorations. */
      clearSearchHighlight: () => ReturnType
    }
  }
}

export const SearchHighlightExtension = Extension.create({
  name: "searchHighlight",

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: searchHighlightKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, old) {
            const meta = tr.getMeta(searchHighlightKey) as SearchHighlightMeta | undefined
            if (meta === "clear") return DecorationSet.empty
            if (meta) return buildDecorations(tr.doc, meta.query, meta.active)
            // No search meta: just keep decorations aligned across edits.
            return old.map(tr.mapping, tr.doc)
          },
        },
        props: {
          decorations(state) {
            return searchHighlightKey.getState(state)
          },
        },
      }),
    ]
  },

  addCommands() {
    return {
      setSearchHighlight:
        ({ query, active }) =>
        ({ tr, dispatch }) => {
          // addToHistory:false keeps search navigation out of the undo stack.
          if (dispatch) {
            dispatch(tr.setMeta(searchHighlightKey, { query, active }).setMeta("addToHistory", false))
          }
          return true
        },
      clearSearchHighlight:
        () =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            dispatch(tr.setMeta(searchHighlightKey, "clear").setMeta("addToHistory", false))
          }
          return true
        },
    }
  },
})
