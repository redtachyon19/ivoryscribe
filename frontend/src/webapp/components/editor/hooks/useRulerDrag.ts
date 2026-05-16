// Ruler-handle drag for TypewriterEditor.
//
// The horizontal ruler (rulerXRef) has left/right handles that adjust either:
//   • the global left/right margin (no selection) — sets `margins` state, OR
//   • the per-paragraph indent of the selected paragraphs (with selection) —
//     updates `indentLeft`/`indentRight` attributes via the ParaIndent
//     extension.
//
// The vertical ruler (rulerYRef) handles only adjust top/bottom margins;
// indent has no vertical analogue.
//
// The hook returns handle positions and a hasNonEmptySelection flag so the
// component can render handles in the right spots and style them as
// indent-vs-margin handles.

import { useCallback, useEffect, useState, type Dispatch, type RefObject, type SetStateAction } from "react"
import type { Editor as TiptapEditor } from "@tiptap/react"
import { MAX_MARGIN_IN, MIN_MARGIN_IN, PAGE_H_PX, PAGE_W_PX, inToPx, type Margins } from "../utils/typewriterMargins"
import { clamp } from "../utils/typewriterPrefs"

export type RulerSide = "left" | "right" | "top" | "bottom"

type RulerDrag = {
  side: RulerSide
  pageTop: number
  /** True when drag started with a non-empty selection — changes paragraph indent, not global margin. */
  indentMode: boolean
  /** Selection captured at drag-start; used throughout the drag so clearing focus can't break it. */
  selFrom: number
  selTo: number
  /** Indent of the opposite axis captured at drag-start so the other side is preserved. */
  snapIndentLeft: number
  snapIndentRight: number
}

type UseRulerDragParams = {
  editor: TiptapEditor | null
  margins: Margins
  setMargins: Dispatch<SetStateAction<Margins>>
  rulerXRef: RefObject<HTMLDivElement | null>
  rulerYRef: RefObject<HTMLDivElement | null>
}

export function useRulerDrag({ editor, margins, setMargins, rulerXRef, rulerYRef }: UseRulerDragParams) {
  const [rulerDrag, setRulerDrag] = useState<RulerDrag | null>(null)

  const mLeftPx = inToPx(margins.left)
  const mRightPx = inToPx(margins.right)

  const handleRulerDown = useCallback(
    (side: RulerSide, pageTop = 0) => (e: React.MouseEvent) => {
      e.preventDefault()
      const sel = editor?.state.selection
      const hasSelection = !!(sel && !sel.empty)
      // Capture the current paragraph's indents so the opposite side is
      // preserved during drag.
      let snapIndentLeft = 0
      let snapIndentRight = 0
      let selFrom = 0
      let selTo = 0
      if (hasSelection && editor && sel) {
        selFrom = sel.from
        selTo = sel.to
        editor.state.doc.nodesBetween(selFrom, Math.min(selTo, selFrom + 1), (node) => {
          if (node.type.name === "paragraph" || node.type.name === "heading") {
            snapIndentLeft = (node.attrs.indentLeft as number) || 0
            snapIndentRight = (node.attrs.indentRight as number) || 0
            return false
          }
        })
      }
      setRulerDrag({ side, pageTop, indentMode: hasSelection, selFrom, selTo, snapIndentLeft, snapIndentRight })
    },
    [editor],
  )

  useEffect(() => {
    if (!rulerDrag) return
    const onMove = (e: MouseEvent) => {
      const { side, pageTop } = rulerDrag
      if (side === "left" || side === "right") {
        const rect = rulerXRef.current?.getBoundingClientRect()
        if (!rect) return
        const xInRuler = e.clientX - rect.left
        if (rulerDrag.indentMode) {
          // Indent mode: adjust the paragraph indent of selected nodes. The
          // handle lives inside the content zone (between global margins), so
          // indent = cursor position − global left margin edge.
          const maxIndent = PAGE_W_PX - mLeftPx - mRightPx - 96 // leave ≥1in content width
          const newLeft = side === "left" ? clamp(Math.round(xInRuler - mLeftPx), 0, maxIndent) : rulerDrag.snapIndentLeft
          const newRight = side === "right" ? clamp(Math.round((PAGE_W_PX - mRightPx) - xInRuler), 0, maxIndent) : rulerDrag.snapIndentRight
          if (!editor) return
          // Use the selection captured at drag-start so focus loss can't
          // break the drag.
          const { selFrom, selTo } = rulerDrag
          const tr = editor.state.tr
          let changed = false
          editor.state.doc.nodesBetween(selFrom, selTo, (node, pos) => {
            if (node.type.name === "paragraph" || node.type.name === "heading") {
              tr.setNodeMarkup(pos, undefined, { ...node.attrs, indentLeft: newLeft, indentRight: newRight })
              changed = true
            }
          })
          if (changed) editor.view.dispatch(tr)
          // Keep snapIndent values in sync with the live paragraph values so
          // the handle tracks the text correctly while dragging.
          setRulerDrag((prev) => prev
            ? { ...prev, snapIndentLeft: newLeft, snapIndentRight: newRight }
            : prev)
        } else if (side === "left") {
          setMargins((p) => ({ ...p, left: clamp(xInRuler / 96, MIN_MARGIN_IN, MAX_MARGIN_IN) }))
        } else {
          setMargins((p) => ({ ...p, right: clamp((PAGE_W_PX - xInRuler) / 96, MIN_MARGIN_IN, MAX_MARGIN_IN) }))
        }
      } else {
        const rect = rulerYRef.current?.getBoundingClientRect()
        if (!rect) return
        // Translate the cursor into the page-local coordinate space so
        // dragging top/bottom handles on any page works (not just page 0).
        const yInPage = e.clientY - rect.top - pageTop
        if (side === "top") {
          setMargins((p) => ({ ...p, top: clamp(yInPage / 96, MIN_MARGIN_IN, MAX_MARGIN_IN) }))
        } else {
          setMargins((p) => ({ ...p, bottom: clamp((PAGE_H_PX - yInPage) / 96, MIN_MARGIN_IN, MAX_MARGIN_IN) }))
        }
      }
    }
    const onUp = () => setRulerDrag(null)
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
    return () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }
  }, [rulerDrag, editor, mLeftPx, mRightPx, rulerXRef, rulerYRef, setMargins])

  // During an active indent drag we stay in indent mode even if the editor
  // lost focus.
  const hasNonEmptySelection = rulerDrag?.indentMode || (editor ? !editor.state.selection.empty : false)

  // Read current paragraph/heading indent at the selection head for ruler
  // handle positioning.
  let selIndentLeftPx = 0
  let selIndentRightPx = 0
  if (hasNonEmptySelection && editor) {
    // Prefer the captured drag-start snaps when a drag is active (selection
    // may be gone).
    if (rulerDrag?.indentMode) {
      selIndentLeftPx = rulerDrag.snapIndentLeft
      selIndentRightPx = rulerDrag.snapIndentRight
    } else {
      const head = editor.state.selection.head
      editor.state.doc.nodesBetween(Math.max(0, head - 1), head, (node) => {
        if (node.type.name === "paragraph" || node.type.name === "heading") {
          selIndentLeftPx = (node.attrs.indentLeft as number) || 0
          selIndentRightPx = (node.attrs.indentRight as number) || 0
          return false
        }
      })
    }
  }

  const leftHandleX = hasNonEmptySelection ? mLeftPx + selIndentLeftPx : mLeftPx
  const rightHandleX = hasNonEmptySelection ? PAGE_W_PX - mRightPx - selIndentRightPx : PAGE_W_PX - mRightPx

  return {
    hasNonEmptySelection,
    selIndentLeftPx,
    selIndentRightPx,
    leftHandleX,
    rightHandleX,
    handleRulerDown,
  }
}
