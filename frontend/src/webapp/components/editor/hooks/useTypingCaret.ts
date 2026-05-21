import { useEffect, useRef } from "react"
import type { Editor as TiptapEditor } from "@tiptap/react"

type UseTypingCaretParams = {
  editor: TiptapEditor | null
  editorSurfaceRef: React.RefObject<HTMLDivElement | null>
  markUiTypingActivity: () => void
}

const CARET_FOLLOW_FACTOR = 0.12 //0.22
const CARET_FOLLOW_SNAP_DISTANCE = 0.01 //0.35

// How long after the last keystroke we keep the caret's `--typing` class on.
// Kept in sync with TYPING_IDLE_MS in useTypingState.ts so chrome auto-hide
// and the caret's typing-state visuals end on the same beat.
const CARET_TYPING_IDLE_MS = 2000 //2000

export function useTypingCaret({
  editor,
  editorSurfaceRef,
  markUiTypingActivity,
}: UseTypingCaretParams) {
  const caretRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!editor) {
      return
    }

    const editorSurface = editorSurfaceRef.current
    const caret = caretRef.current

    if (!editorSurface || !caret) {
      return
    }

    const getEditorView = () => {
      try {
        const view = editor.view
        if (!view?.dom) {
          return null
        }

        return view
      } catch {
        return null
      }
    }

    let frameId = 0
    let followFrameId = 0
    let typingTimeoutId = 0
    const caretMotion = {
      currentLeft: 0,
      currentTop: 0,
      currentHeight: 26,
      targetLeft: 0,
      targetTop: 0,
      targetHeight: 26,
      initialized: false,
    }

    const applyCaretPosition = () => {
      caret.style.transform = `translate3d(${caretMotion.currentLeft}px, ${caretMotion.currentTop}px, 0)`
      caret.style.height = `${caretMotion.currentHeight}px`
    }

    const followCaretMotion = () => {
      followFrameId = 0

      const leftDelta = caretMotion.targetLeft - caretMotion.currentLeft
      const topDelta = caretMotion.targetTop - caretMotion.currentTop
      const heightDelta = caretMotion.targetHeight - caretMotion.currentHeight

      caretMotion.currentLeft += leftDelta * CARET_FOLLOW_FACTOR
      caretMotion.currentTop += topDelta * CARET_FOLLOW_FACTOR
      caretMotion.currentHeight += heightDelta * CARET_FOLLOW_FACTOR

      applyCaretPosition()

      const isCloseEnough =
        Math.abs(leftDelta) < CARET_FOLLOW_SNAP_DISTANCE &&
        Math.abs(topDelta) < CARET_FOLLOW_SNAP_DISTANCE &&
        Math.abs(heightDelta) < CARET_FOLLOW_SNAP_DISTANCE

      if (isCloseEnough) {
        caretMotion.currentLeft = caretMotion.targetLeft
        caretMotion.currentTop = caretMotion.targetTop
        caretMotion.currentHeight = caretMotion.targetHeight
        applyCaretPosition()
        return
      }

      followFrameId = window.requestAnimationFrame(followCaretMotion)
    }

    const scheduleCaretFollow = () => {
      if (followFrameId) {
        return
      }

      followFrameId = window.requestAnimationFrame(followCaretMotion)
    }

    const stopTypingState = () => {
      caret.classList.remove("typing-caret--typing")
    }

    const markCaretTypingActivity = () => {
      caret.classList.add("typing-caret--typing")

      if (typingTimeoutId) {
        window.clearTimeout(typingTimeoutId)
      }

      typingTimeoutId = window.setTimeout(() => {
        stopTypingState()
      }, CARET_TYPING_IDLE_MS)
    }

    const hideCaret = () => {
      caret.classList.add("typing-caret--hidden")
      stopTypingState()
    }

    const showCaret = () => {
      caret.classList.remove("typing-caret--hidden")
    }

    const updateCaret = () => {
      frameId = 0

      const view = getEditorView()
      if (!view) {
        hideCaret()
        return
      }

      const surfaceRect = editorSurface.getBoundingClientRect()

      let from = 0
      let to = 0
      try {
        from = view.state.selection.from
        to = view.state.selection.to
      } catch {
        hideCaret()
        return
      }

      if (!view.hasFocus() || from !== to) {
        hideCaret()
        return
      }

      let coords: { left: number; top: number; bottom: number }
      try {
        coords = view.coordsAtPos(from)
      } catch {
        hideCaret()
        return
      }

      const left = coords.left - surfaceRect.left
      const top = coords.top - surfaceRect.top
      // Track the actual line height reported by ProseMirror; clamp only to
       // a tiny minimum to guard against zero-height edge cases.
      const height = Math.max(coords.bottom - coords.top, 12)

      caretMotion.targetLeft = left
      caretMotion.targetTop = top
      caretMotion.targetHeight = height

      if (!caretMotion.initialized) {
        caretMotion.currentLeft = left
        caretMotion.currentTop = top
        caretMotion.currentHeight = height
        caretMotion.initialized = true
        applyCaretPosition()
      } else {
        scheduleCaretFollow()
      }

      showCaret()
    }

    const scheduleCaretUpdate = () => {
      if (frameId) {
        return
      }
      frameId = window.requestAnimationFrame(updateCaret)
    }

    const onSelectionUpdate = () => scheduleCaretUpdate()
    const onTransaction = () => scheduleCaretUpdate()
    const onEditorFocus = () => scheduleCaretUpdate()
    const onEditorBlur = () => hideCaret()
    const onWindowResize = () => scheduleCaretUpdate()
    const onWindowScroll = () => scheduleCaretUpdate()
    // After a page break is applied the block moves to the next page, but the
    // caret RAF has already fired (before the page-break RAF) and set the
    // spring target to the old in-margin coordinates.  Cancel that spring
    // animation and schedule a fresh position read so the typing indicator
    // jumps to the correct page instead of drifting into the gap.
    const onPageBreak = () => {
      if (followFrameId) {
        window.cancelAnimationFrame(followFrameId)
        followFrameId = 0
      }
      scheduleCaretUpdate()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return
      }

      const isCharacter = event.key.length === 1
      const isEditingKey = event.key === "Backspace" || event.key === "Delete" || event.key === "Enter"

      if (isCharacter || isEditingKey) {
        markCaretTypingActivity()
        markUiTypingActivity()
      }
    }

    editor.on("selectionUpdate", onSelectionUpdate)
    editor.on("transaction", onTransaction)
    editor.on("focus", onEditorFocus)
    editor.on("blur", onEditorBlur)

    window.addEventListener("resize", onWindowResize)
    window.addEventListener("scroll", onWindowScroll, true)
    window.addEventListener("tw:pagebreak", onPageBreak)

    const editorDom = getEditorView()?.dom ?? null
    editorDom?.addEventListener("keydown", onKeyDown)

    scheduleCaretUpdate()

    return () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId)
      }
      if (followFrameId) {
        window.cancelAnimationFrame(followFrameId)
      }
      if (typingTimeoutId) {
        window.clearTimeout(typingTimeoutId)
      }
      editor.off("selectionUpdate", onSelectionUpdate)
      editor.off("transaction", onTransaction)
      editor.off("focus", onEditorFocus)
      editor.off("blur", onEditorBlur)
      window.removeEventListener("resize", onWindowResize)
      window.removeEventListener("scroll", onWindowScroll, true)
      window.removeEventListener("tw:pagebreak", onPageBreak)
      editorDom?.removeEventListener("keydown", onKeyDown)
    }
  }, [editor, editorSurfaceRef, markUiTypingActivity])

  return {
    caretRef,
  }
}
