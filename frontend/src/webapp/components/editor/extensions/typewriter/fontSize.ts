// Custom font-size mark: adds a `fontSize` attribute to TipTap's textStyle
// mark so the toolbar can set inline font sizes without owning a full
// extension.

import { Extension } from "@tiptap/react"

export const FontSizeExtension = Extension.create({
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
