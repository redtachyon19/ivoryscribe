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

  useEffect(() => {
    if (!editor || !paintFormat) return
    let dom: HTMLElement
    try {
      dom = editor.view.dom as HTMLElement
    } catch {
      return
    }

    const handleMouseUp = () => {
      window.setTimeout(() => {
        const sel = editor.state.selection
        if (sel.empty) return

        let chain = editor.chain().focus()

        chain = paintFormat.bold ? chain.setBold() : chain.unsetBold()
        chain = paintFormat.italic ? chain.setItalic() : chain.unsetItalic()
        chain = paintFormat.underline ? chain.setUnderline() : chain.unsetUnderline()

        chain = chain.setMark("textStyle", {
          fontFamily: paintFormat.fontFamily,
          fontSize: paintFormat.fontSize,
          color: paintFormat.color,
        })

        if (paintFormat.highlight) {
          chain = chain.setHighlight({ color: paintFormat.highlight })
        } else {
          chain = chain.unsetHighlight()
        }

        chain = chain.setTextAlign(paintFormat.textAlign)

        chain.run()

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

  useEffect(() => {
    if (!paintFormat) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPaintFormat(null)
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [paintFormat])

  return {
    isArmed: paintFormat !== null,
    handlePaintRollerClick,
  }
}
