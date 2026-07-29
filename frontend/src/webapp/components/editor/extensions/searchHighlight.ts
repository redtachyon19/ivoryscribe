import { Extension } from "@tiptap/react"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"
import type { Node as ProseMirrorNode } from "@tiptap/pm/model"

export const searchHighlightKey = new PluginKey<DecorationSet>("searchHighlight")

type SearchHighlightMeta = { query: string; active: number } | "clear"

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
      setSearchHighlight: (options: { query: string; active: number }) => ReturnType
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
