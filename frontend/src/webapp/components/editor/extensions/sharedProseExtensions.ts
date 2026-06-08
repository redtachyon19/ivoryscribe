// Formatting extensions that BOTH prose editors (Drafting + Typewriter) must
// register, because they edit the SAME underlying prose document.
//
// Why this exists: a TipTap/ProseMirror editor silently drops any mark, node,
// or attribute its schema doesn't know about, on both parse and serialize. The
// Typewriter view added font size / family / colour / alignment / indent /
// multi-column formatting, but the Drafting view's schema didn't include those
// extensions — so the moment a Typewriter-formatted document was opened or
// edited in Drafting view (the default view), every one of those styles was
// stripped and never made it back to disk. Sharing one list keeps the two
// editors' schemas identical so formatting round-trips losslessly regardless of
// which view touches the document.
//
// Returned as a factory because TextAlign.configure() builds a fresh extension
// instance; reusing one instance across two editors is asking for trouble.

import { TextStyle } from "@tiptap/extension-text-style"
import FontFamily from "@tiptap/extension-font-family"
import Color from "@tiptap/extension-color"
import TextAlign from "@tiptap/extension-text-align"
import type { Extensions } from "@tiptap/react"
import { FontSizeExtension } from "./typewriter/fontSize"
import { ParaIndentExtension } from "./typewriter/paraIndent"
import { ColumnsExtension } from "./typewriter/columns"
import { ResizableImage } from "./resizableImage"

export function sharedProseFormattingExtensions(
  options?: { interactiveImages?: boolean },
): Extensions {
  const interactiveImages = options?.interactiveImages ?? true
  return [
    // textStyle is the carrier mark; fontSize/fontFamily/colour ride on it.
    TextStyle,
    FontSizeExtension,
    FontFamily,
    Color,
    TextAlign.configure({ types: ["heading", "paragraph"] }),
    ParaIndentExtension,
    ColumnsExtension,
    // Inline images (data-URL src), resizable + alignable. Shared so neither
    // view strips images from the document. The Drafting view passes
    // interactiveImages:false so images render passive there — the free-float
    // drag/resize/crop is a Typewriter (page-layout) feature; see ImageNodeView.
    ResizableImage.configure({ interactive: interactiveImages }),
  ]
}
