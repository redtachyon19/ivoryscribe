import { Node as TipTapNode } from "@tiptap/core"

export const ColumnsExtension = TipTapNode.create({
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
