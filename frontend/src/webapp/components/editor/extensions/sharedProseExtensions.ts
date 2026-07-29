import { TextStyle } from "@tiptap/extension-text-style"
import FontFamily from "@tiptap/extension-font-family"
import Color from "@tiptap/extension-color"
import TextAlign from "@tiptap/extension-text-align"
import type { Extensions } from "@tiptap/react"
import { FontSizeExtension } from "./typewriter/fontSize"
import { ParaIndentExtension } from "./typewriter/paraIndent"
import { ColumnsExtension } from "./typewriter/columns"
import { ResizableImage } from "./resizableImage"
import { SmartTypographyExtension, HorizontalRuleSixDashes } from "./smartTypography"

export function sharedProseFormattingExtensions(
  options?: { interactiveImages?: boolean },
): Extensions {
  const interactiveImages = options?.interactiveImages ?? true
  return [
    TextStyle,
    FontSizeExtension,
    FontFamily,
    Color,
    TextAlign.configure({ types: ["paragraph"] }),
    ParaIndentExtension,
    ColumnsExtension,
    ResizableImage.configure({ interactive: interactiveImages }),
    HorizontalRuleSixDashes,
    SmartTypographyExtension,
  ]
}
