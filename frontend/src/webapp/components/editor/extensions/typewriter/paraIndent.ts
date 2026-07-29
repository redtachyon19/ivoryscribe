import { Extension } from "@tiptap/react"

export const TAB_INDENT_PX = 48

export const ParaIndentExtension = Extension.create({
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
    const stepForward = (il: number, fli: number) =>
      fli === 0
        ? { indentLeft: il, firstLineIndent: TAB_INDENT_PX }
        : { indentLeft: il + TAB_INDENT_PX, firstLineIndent: 0 }
    const stepBack = (il: number, fli: number) => {
      if (fli > 0) return { indentLeft: il, firstLineIndent: 0 }
      if (il > 0) return { indentLeft: Math.max(0, il - TAB_INDENT_PX), firstLineIndent: TAB_INDENT_PX }
      return null
    }

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
