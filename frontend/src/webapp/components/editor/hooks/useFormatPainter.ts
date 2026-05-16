// Format painter for TypewriterEditor.
//
// Click the paint-roller toolbar button to capture the current selection's
// formatting (bold/italic/underline, font family/size/color, highlight,
// text-align, left/right paragraph indents). The next non-empty selection
// the user completes inside the editor receives those attributes, then the
// painter disarms. Click the button again — or press Escape — to cancel.

import { useCallback, useEffect, useState } from "react"
import type { Editor as TiptapEditor } from "@tiptap/react"

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

export function useFormatPainter(editor: TiptapEditor | null) {
  const [paintFormat, setPaintFormat] = useState<PaintFormat | null>(null)

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
      fontSize: (ts.fontSize as string | null | undefined) ?? null,
      color: (ts.color as string | null | undefined) ?? null,
      highlight: ((editor.getAttributes("highlight") as Record<string, unknown>).color as string | null | undefined) ?? null,
      textAlign: ((para.textAlign ?? heading.textAlign ?? "left") as string),
      indentLeft: ((para.indentLeft ?? heading.indentLeft ?? 0) as number),
      indentRight: ((para.indentRight ?? heading.indentRight ?? 0) as number),
    })
  }, [editor, paintFormat])

  // When armed, apply the captured format on the next mouseup that ends with
  // a non-empty selection inside the editor. Then disarm.
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
        chain = paintFormat.bold ? chain.setBold() : chain.unsetBold()
        chain = paintFormat.italic ? chain.setItalic() : chain.unsetItalic()
        chain = paintFormat.underline ? chain.setUnderline() : chain.unsetUnderline()

        // textStyle mark — font family / size / color together
        chain = chain.setMark("textStyle", {
          fontFamily: paintFormat.fontFamily,
          fontSize: paintFormat.fontSize,
          color: paintFormat.color,
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
              indentLeft: paintFormat.indentLeft,
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

  // Escape cancels the armed format painter.
  useEffect(() => {
    if (!paintFormat) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPaintFormat(null)
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [paintFormat])

  return {
    /** True when the painter is armed (toolbar button should show active state). */
    isArmed: paintFormat !== null,
    handlePaintRollerClick,
  }
}
