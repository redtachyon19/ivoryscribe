import { Mark } from "@tiptap/core"

export const DiffAddMark = Mark.create({
  name: "diffAdd",
  parseHTML() {
    return [{ tag: "mark[data-diff-add]", priority: 1000 }]
  },
  addAttributes() {
    return {
      hunkId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-hunk-id"),
        renderHTML: (attributes) => {
          const value = (attributes as { hunkId?: string | null }).hunkId
          if (!value) return {}
          return { "data-hunk-id": value }
        },
      },
    }
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "mark",
      { ...HTMLAttributes, "data-diff-add": "true", class: "diff-add" },
      0,
    ]
  },
})

export const DiffRemoveMark = Mark.create({
  name: "diffRemove",
  parseHTML() {
    return [{ tag: "s[data-diff-remove]", priority: 1000 }]
  },
  addAttributes() {
    return {
      hunkId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-hunk-id"),
        renderHTML: (attributes) => {
          const value = (attributes as { hunkId?: string | null }).hunkId
          if (!value) return {}
          return { "data-hunk-id": value }
        },
      },
    }
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "s",
      { ...HTMLAttributes, "data-diff-remove": "true", class: "diff-remove" },
      0,
    ]
  },
})
