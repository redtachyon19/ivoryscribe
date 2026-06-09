import { useEffect, useRef } from "react"
import type { Editor as TiptapEditor } from "@tiptap/react"

type UseTypingCaretParams = {
  editor: TiptapEditor | null
  editorSurfaceRef: React.RefObject<HTMLDivElement | null>
  markUiTypingActivity: () => void
}

// Spring tuning for the custom caret (the native caret is hidden via
// `caret-color: transparent`, so THIS element is the visible cursor).
// FACTOR = fraction of the remaining distance covered per animation frame;
// SNAP_DISTANCE = how close (px) before we lock onto the target and stop the
// RAF loop. These were briefly detuned to 0.12 / 0.01 in commit 0228d8d
// ("project card size alterations"), which made the caret crawl asymptotically
// for ~50 frames (~0.9s) after every keystroke — the "cursor jumping / not
// seamless" regression. Restored to the original tuned values.
const CARET_FOLLOW_FACTOR = 0.22
const CARET_FOLLOW_SNAP_DISTANCE = 0.35

// How long after the last keystroke we keep the caret's `--typing` class on.
// Kept in sync with TYPING_IDLE_MS in useTypingState.ts so chrome auto-hide
// and the caret's typing-state visuals end on the same beat.
const CARET_TYPING_IDLE_MS = 2000 //2000

// Effective CSS `zoom` applied to `start` and its ancestors. useEditorZoom sets
// `zoom` as an inline style on the zoomed element (the page-stack wrapper in
// Typewriter, the editor surface itself in Draft), and CSS `zoom` multiplies
// through nesting — so we walk up from the surface and accumulate it. The caret
// lives inside that zoomed box, so its coords come back in rendered px while a
// transform on it is re-scaled by this zoom; dividing by it converts back to
// the natural px the transform actually needs. Returns 1 when nothing is
// zoomed, so this is a no-op at 100%. Uses getPropertyValue (not `.style.zoom`)
// because `zoom` isn't in the typed CSSStyleDeclaration.
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

      // The surface (or an ancestor) is CSS-`zoom`ed and the caret is a child of
      // it, so coords/rects come back in RENDERED px while a transform set on the
      // caret is re-scaled by that zoom. Divide by the effective zoom to convert
      // to the natural px the transform needs, so the caret tracks the text at
      // any zoom level — in BOTH Typewriter (zoom on an ancestor) and Draft (zoom
      // on the surface itself). No-op at 100% zoom (renderScale === 1).
      const renderScale = getEffectiveZoom(editorSurface)
      const left = (coords.left - surfaceRect.left) / renderScale
      const top = (coords.top - surfaceRect.top) / renderScale
      // Track the actual line height reported by ProseMirror; clamp only to
      // a tiny minimum to guard against zero-height edge cases.
      const height = Math.max((coords.bottom - coords.top) / renderScale, 12)

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
    // The page stack rescales via CSS `zoom` during a pinch. The spring is for
    // cursor *movement* (typing/clicking); animating it across a zoom step makes
    // the caret chase a teleporting target and visibly glitch. Cancel the
    // in-flight spring and force a snap (initialized = false → updateCaret sets
    // current = target directly) so the caret stays glued to the text as the
    // page scales.
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
