import { useEffect, useRef } from "react"
import type { Editor as TiptapEditor } from "@tiptap/react"

type UseTypingCaretParams = {
  editor: TiptapEditor | null
  editorSurfaceRef: React.RefObject<HTMLDivElement | null>
  markUiTypingActivity: () => void
}

const CARET_FOLLOW_FACTOR = 0.09
const CARET_FOLLOW_SNAP_DISTANCE = 0.01
const CARET_MAX_FOLLOW_SPEED = 1.4
const CARET_MAX_FOLLOW_DISTANCE = 90

const CARET_TYPING_IDLE_MS = 2000

function getEffectiveZoom(start: HTMLElement | null): number {
  let zoom = 1
  let node: HTMLElement | null = start
  while (node) {
    const inline = parseFloat(node.style.getPropertyValue("zoom") || "")
    if (Number.isFinite(inline) && inline > 0) zoom *= inline
    node = node.parentElement
  }
  return zoom
}

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
    let typingMove = false
    const caretMotion = {
      currentLeft: 0,
      currentTop: 0,
      currentHeight: 26,
      targetLeft: 0,
      targetTop: 0,
      targetHeight: 26,
      initialized: false,
      uncapped: false,
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

      let stepLeft = leftDelta * CARET_FOLLOW_FACTOR
      let stepTop = topDelta * CARET_FOLLOW_FACTOR
      if (!caretMotion.uncapped) {
        const stepDist = Math.hypot(stepLeft, stepTop)
        if (stepDist > CARET_MAX_FOLLOW_SPEED) {
          const scale = CARET_MAX_FOLLOW_SPEED / stepDist
          stepLeft *= scale
          stepTop *= scale
        }
      }
      caretMotion.currentLeft += stepLeft
      caretMotion.currentTop += stepTop
      caretMotion.currentHeight += heightDelta * CARET_FOLLOW_FACTOR

      if (!caretMotion.uncapped) {
        const gapLeft = caretMotion.targetLeft - caretMotion.currentLeft
        const gapTop = caretMotion.targetTop - caretMotion.currentTop
        const gapDist = Math.hypot(gapLeft, gapTop)
        if (gapDist > CARET_MAX_FOLLOW_DISTANCE) {
          const pull = (gapDist - CARET_MAX_FOLLOW_DISTANCE) / gapDist
          caretMotion.currentLeft += gapLeft * pull
          caretMotion.currentTop += gapTop * pull
        }
      }

      applyCaretPosition()

      const isCloseEnough =
        Math.abs(leftDelta) < CARET_FOLLOW_SNAP_DISTANCE &&
        Math.abs(topDelta) < CARET_FOLLOW_SNAP_DISTANCE &&
        Math.abs(heightDelta) < CARET_FOLLOW_SNAP_DISTANCE

      if (isCloseEnough) {
        caretMotion.currentLeft = caretMotion.targetLeft
        caretMotion.currentTop = caretMotion.targetTop
        caretMotion.currentHeight = caretMotion.targetHeight
        caretMotion.uncapped = false
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

      const renderScale = getEffectiveZoom(editorSurface)
      const left = (coords.left - surfaceRect.left) / renderScale
      const top = (coords.top - surfaceRect.top) / renderScale
      const height = Math.max((coords.bottom - coords.top) / renderScale, 12)

      if (caretMotion.initialized) {
        if (typingMove) {
          caretMotion.uncapped = false
        } else {
          const topJump = Math.abs(top - caretMotion.targetTop)
          const jumpDist = Math.hypot(left - caretMotion.targetLeft, top - caretMotion.targetTop)
          if (topJump > height * 0.5 || jumpDist > height * 2) {
            caretMotion.uncapped = true
          } else if (jumpDist > 0.5) {
            caretMotion.uncapped = false
          }
        }
      }
      typingMove = false

      caretMotion.targetLeft = left
      caretMotion.targetTop = top
      caretMotion.targetHeight = height

      if (!caretMotion.initialized) {
        caretMotion.currentLeft = left
        caretMotion.currentTop = top
        caretMotion.currentHeight = height
        caretMotion.initialized = true
        caretMotion.uncapped = false
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
    const onPageBreak = () => {
      if (followFrameId) {
        window.cancelAnimationFrame(followFrameId)
        followFrameId = 0
      }
      scheduleCaretUpdate()
    }
    const onZoom = () => {
      if (followFrameId) {
        window.cancelAnimationFrame(followFrameId)
        followFrameId = 0
      }
      caretMotion.initialized = false
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

      if (isCharacter || event.key === "Backspace" || event.key === "Delete") {
        typingMove = true
      }
    }

    editor.on("selectionUpdate", onSelectionUpdate)
    editor.on("transaction", onTransaction)
    editor.on("focus", onEditorFocus)
    editor.on("blur", onEditorBlur)

    window.addEventListener("resize", onWindowResize)
    window.addEventListener("scroll", onWindowScroll, true)
    window.addEventListener("tw:pagebreak", onPageBreak)
    window.addEventListener("tw:zoom", onZoom)

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
      window.removeEventListener("tw:zoom", onZoom)
      editorDom?.removeEventListener("keydown", onKeyDown)
    }
  }, [editor, editorSurfaceRef, markUiTypingActivity])

  return {
    caretRef,
  }
}
