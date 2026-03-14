import { useEffect, useRef } from "react"
import "./GlobalCaretOverlay.css"

type EditableTarget = HTMLInputElement | HTMLTextAreaElement | HTMLElement

type CaretMetrics = {
  left: number
  top: number
  height: number
}

const CARET_FOLLOW_FACTOR = 0.22
const CARET_FOLLOW_SNAP_DISTANCE = 0.35
const CARET_TYPING_TIMEOUT_MS = 450

const TEXTUAL_INPUT_TYPES = new Set([
  "",
  "text",
  "search",
  "url",
  "tel",
  "email",
  "password",
  "number",
])

function isTextualInput(target: HTMLInputElement) {
  return TEXTUAL_INPUT_TYPES.has((target.type || "").toLowerCase())
}

function resolveEditableTarget(rawTarget: EventTarget | null): EditableTarget | null {
  if (!(rawTarget instanceof HTMLElement)) {
    return null
  }

  if (rawTarget instanceof HTMLInputElement) {
    if (rawTarget.disabled || rawTarget.readOnly || !isTextualInput(rawTarget)) {
      return null
    }

    return rawTarget
  }

  if (rawTarget instanceof HTMLTextAreaElement) {
    if (rawTarget.disabled || rawTarget.readOnly) {
      return null
    }

    return rawTarget
  }

  const editableRoot = rawTarget.closest<HTMLElement>("[contenteditable='true']")
  if (!editableRoot) {
    return null
  }

  return editableRoot
}

function isSupportedTarget(target: EditableTarget | null): target is EditableTarget {
  if (!target || !document.contains(target)) {
    return false
  }

  if (target.closest(".ProseMirror")) {
    return false
  }

  return true
}

function rectsIntersect(a: DOMRect, b: DOMRect) {
  return a.right > b.left && a.left < b.right && a.bottom > b.top && a.top < b.bottom
}

function targetIsVisibleInViewportAndClippingAncestors(target: EditableTarget) {
  const targetRect = target.getBoundingClientRect()
  if (targetRect.width <= 0 || targetRect.height <= 0) {
    return false
  }

  const viewportRect = new DOMRect(0, 0, window.innerWidth, window.innerHeight)
  if (!rectsIntersect(targetRect, viewportRect)) {
    return false
  }

  let ancestor: HTMLElement | null = target.parentElement
  while (ancestor) {
    const computed = window.getComputedStyle(ancestor)
    const clipsX = /(auto|scroll|hidden|clip)/.test(computed.overflowX)
    const clipsY = /(auto|scroll|hidden|clip)/.test(computed.overflowY)

    if (clipsX || clipsY) {
      const ancestorRect = ancestor.getBoundingClientRect()
      if (!rectsIntersect(targetRect, ancestorRect)) {
        return false
      }
    }

    ancestor = ancestor.parentElement
  }

  return true
}

function copyTextLayoutStyles(source: CSSStyleDeclaration, destination: CSSStyleDeclaration) {
  const styleProperties = [
    "box-sizing",
    "font-family",
    "font-size",
    "font-weight",
    "font-style",
    "font-variant",
    "font-stretch",
    "line-height",
    "letter-spacing",
    "word-spacing",
    "text-transform",
    "text-indent",
    "text-align",
    "text-rendering",
    "direction",
    "padding-top",
    "padding-right",
    "padding-bottom",
    "padding-left",
    "border-top-width",
    "border-right-width",
    "border-bottom-width",
    "border-left-width",
    "border-top-style",
    "border-right-style",
    "border-bottom-style",
    "border-left-style",
    "border-top-color",
    "border-right-color",
    "border-bottom-color",
    "border-left-color",
    "tab-size",
    "-moz-tab-size",
    "white-space",
  ] as const

  for (const property of styleProperties) {
    destination.setProperty(property, source.getPropertyValue(property))
  }
}

function getCaretMetricsForTextControl(target: HTMLInputElement | HTMLTextAreaElement): CaretMetrics | null {
  const selectionStart = target.selectionStart
  const selectionEnd = target.selectionEnd

  if (selectionStart === null || selectionEnd === null || selectionStart !== selectionEnd) {
    return null
  }

  const targetRect = target.getBoundingClientRect()
  const computed = window.getComputedStyle(target)
  const mirror = document.createElement("div")

  copyTextLayoutStyles(computed, mirror.style)

  mirror.style.position = "fixed"
  mirror.style.left = `${targetRect.left}px`
  mirror.style.top = `${targetRect.top}px`
  mirror.style.width = `${targetRect.width}px`
  mirror.style.height = `${targetRect.height}px`
  mirror.style.pointerEvents = "none"
  mirror.style.visibility = "hidden"
  mirror.style.overflow = "hidden"
  mirror.style.overflowWrap = "break-word"
  mirror.style.whiteSpace = target instanceof HTMLTextAreaElement ? "pre-wrap" : "pre"

  const beforeCaret = target.value.slice(0, selectionStart)
  mirror.textContent = beforeCaret

  const marker = document.createElement("span")
  marker.textContent = "\u200b"
  mirror.append(marker)

  if (selectionStart === target.value.length) {
    mirror.append(document.createTextNode(" "))
  }

  document.body.append(mirror)

  const mirrorRect = mirror.getBoundingClientRect()
  const markerRect = marker.getBoundingClientRect()
  const parsedLineHeight = Number.parseFloat(computed.lineHeight)
  const lineHeight = Number.isFinite(parsedLineHeight) ? parsedLineHeight : Number.parseFloat(computed.fontSize) * 1.2

  const left = targetRect.left + (markerRect.left - mirrorRect.left) - target.scrollLeft
  const top = targetRect.top + (markerRect.top - mirrorRect.top) - target.scrollTop
  const height = Math.max(markerRect.height || lineHeight, 16)

  mirror.remove()

  return { left, top, height }
}

function getCaretMetricsForContentEditable(target: HTMLElement): CaretMetrics | null {
  const selection = window.getSelection()
  if (!selection || !selection.rangeCount || !selection.isCollapsed) {
    return null
  }

  const range = selection.getRangeAt(0)
  if (!target.contains(range.startContainer)) {
    return null
  }

  let rect = range.getClientRects()[0]

  if (!rect) {
    const marker = document.createElement("span")
    marker.textContent = "\u200b"
    range.insertNode(marker)
    rect = marker.getBoundingClientRect()

    const restoreRange = document.createRange()
    restoreRange.setStartAfter(marker)
    restoreRange.collapse(true)
    selection.removeAllRanges()
    selection.addRange(restoreRange)
    marker.remove()
  }

  const lineHeight = Number.parseFloat(window.getComputedStyle(target).lineHeight)
  return {
    left: rect.left,
    top: rect.top,
    height: Math.max(rect.height || lineHeight || 20, 16),
  }
}

function resolveCaretMetrics(target: EditableTarget): CaretMetrics | null {
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    return getCaretMetricsForTextControl(target)
  }

  return getCaretMetricsForContentEditable(target)
}

export default function GlobalCaretOverlay() {
  const caretRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const caret = caretRef.current
    if (!caret) {
      return
    }

    let activeTarget: EditableTarget | null = null
    let frameId = 0
    let followFrameId = 0
    let typingTimeoutId: number | null = null

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

    const hideCaret = () => {
      caret.classList.add("global-caret--hidden")
      caret.classList.remove("global-caret--typing")
    }

    const showCaret = () => {
      caret.classList.remove("global-caret--hidden")
    }

    const stopTypingState = () => {
      caret.classList.remove("global-caret--typing")
    }

    const markTypingState = () => {
      caret.classList.add("global-caret--typing")

      if (typingTimeoutId !== null) {
        window.clearTimeout(typingTimeoutId)
      }

      typingTimeoutId = window.setTimeout(() => {
        stopTypingState()
        typingTimeoutId = null
      }, CARET_TYPING_TIMEOUT_MS)
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

    const setActiveTarget = (nextTarget: EditableTarget | null) => {
      if (activeTarget === nextTarget) {
        return
      }

      activeTarget?.classList.remove("global-caret-target")
      activeTarget = nextTarget
      activeTarget?.classList.add("global-caret-target")
      caretMotion.initialized = false
    }

    const updateCaret = () => {
      frameId = 0

      if (!isSupportedTarget(activeTarget)) {
        setActiveTarget(null)
        hideCaret()
        return
      }

      if (document.activeElement !== activeTarget && !(activeTarget instanceof HTMLElement && activeTarget.contains(document.activeElement))) {
        hideCaret()
        return
      }

      if (!targetIsVisibleInViewportAndClippingAncestors(activeTarget)) {
        hideCaret()
        return
      }

      const metrics = resolveCaretMetrics(activeTarget)
      if (!metrics) {
        hideCaret()
        return
      }

      caretMotion.targetLeft = metrics.left
      caretMotion.targetTop = metrics.top
      caretMotion.targetHeight = metrics.height

      if (!caretMotion.initialized) {
        caretMotion.currentLeft = metrics.left
        caretMotion.currentTop = metrics.top
        caretMotion.currentHeight = metrics.height
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

    const onFocusIn = (event: FocusEvent) => {
      const nextTarget = resolveEditableTarget(event.target)
      if (!isSupportedTarget(nextTarget)) {
        setActiveTarget(null)
        hideCaret()
        return
      }

      setActiveTarget(nextTarget)
      scheduleCaretUpdate()
    }

    const onFocusOut = () => {
      window.setTimeout(() => {
        const nextTarget = resolveEditableTarget(document.activeElement)
        if (!isSupportedTarget(nextTarget)) {
          setActiveTarget(null)
          hideCaret()
          return
        }

        setActiveTarget(nextTarget)
        scheduleCaretUpdate()
      }, 0)
    }

    const onInput = () => {
      if (!activeTarget) {
        return
      }

      markTypingState()
      scheduleCaretUpdate()
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (!activeTarget || event.metaKey || event.ctrlKey || event.altKey) {
        return
      }

      const isCharacter = event.key.length === 1
      const isEditingKey = event.key === "Backspace" || event.key === "Delete" || event.key === "Enter"
      if (isCharacter || isEditingKey) {
        markTypingState()
      }

      scheduleCaretUpdate()
    }

    const onSelectionChange = () => {
      if (!activeTarget) {
        return
      }

      scheduleCaretUpdate()
    }

    document.addEventListener("focusin", onFocusIn)
    document.addEventListener("focusout", onFocusOut)
    document.addEventListener("input", onInput, true)
    document.addEventListener("keydown", onKeyDown, true)
    document.addEventListener("selectionchange", onSelectionChange)
    document.addEventListener("click", scheduleCaretUpdate, true)
    document.addEventListener("mouseup", scheduleCaretUpdate, true)
    window.addEventListener("resize", scheduleCaretUpdate)
    window.addEventListener("scroll", scheduleCaretUpdate, true)

    const initialTarget = resolveEditableTarget(document.activeElement)
    if (isSupportedTarget(initialTarget)) {
      setActiveTarget(initialTarget)
      scheduleCaretUpdate()
    }

    return () => {
      activeTarget?.classList.remove("global-caret-target")

      if (frameId) {
        window.cancelAnimationFrame(frameId)
      }

      if (followFrameId) {
        window.cancelAnimationFrame(followFrameId)
      }

      if (typingTimeoutId !== null) {
        window.clearTimeout(typingTimeoutId)
      }

      document.removeEventListener("focusin", onFocusIn)
      document.removeEventListener("focusout", onFocusOut)
      document.removeEventListener("input", onInput, true)
      document.removeEventListener("keydown", onKeyDown, true)
      document.removeEventListener("selectionchange", onSelectionChange)
      document.removeEventListener("click", scheduleCaretUpdate, true)
      document.removeEventListener("mouseup", scheduleCaretUpdate, true)
      window.removeEventListener("resize", scheduleCaretUpdate)
      window.removeEventListener("scroll", scheduleCaretUpdate, true)
    }
  }, [])

  return <div ref={caretRef} className="global-caret global-caret--hidden" aria-hidden="true" />
}
