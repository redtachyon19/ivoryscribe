import { useCallback, useEffect, useRef, useState } from "react"

// How long after the last keystroke we keep the "typing" UI state on. Drives
// the auto-hide of surrounding chrome (settings button, rulers + their toggle
// and the toolbar toggle in Typewriter, flag rail in Drafting). Long enough to
// absorb the natural pause between words / while composing a sentence so the
// UI doesn't flicker on every comma, but short enough that the chrome fades
// back in promptly once the user pauses.
const TYPING_IDLE_MS = 2500

type UseTypingStateParams = {
  onTypingStateChange?: (isTyping: boolean) => void
}

type UseTypingStateResult = {
  isUiTyping: boolean
  markUiTypingActivity: () => void
}

export function useTypingState({ onTypingStateChange }: UseTypingStateParams): UseTypingStateResult {
  const typingUiTimeoutRef = useRef<number | null>(null)
  // Mirrors isUiTyping for listeners/timeouts to read without re-subscribing.
  const isTypingRef = useRef(false)
  const [isUiTyping, setIsUiTyping] = useState(false)
  // Held in a ref so the callbacks below stay referentially stable even if the
  // caller passes a fresh onTypingStateChange each render.
  const onTypingStateChangeRef = useRef(onTypingStateChange)
  onTypingStateChangeRef.current = onTypingStateChange

  // Leave the typing state immediately: clear the pending idle timer and reveal
  // the chrome now. No-op when we're not currently in the typing state.
  const clearUiTyping = useCallback(() => {
    if (typingUiTimeoutRef.current) {
      window.clearTimeout(typingUiTimeoutRef.current)
      typingUiTimeoutRef.current = null
    }
    if (!isTypingRef.current) return
    isTypingRef.current = false
    setIsUiTyping(false)
    onTypingStateChangeRef.current?.(false)
  }, [])

  const markUiTypingActivity = useCallback(() => {
    isTypingRef.current = true
    setIsUiTyping(true)
    onTypingStateChangeRef.current?.(true)

    if (typingUiTimeoutRef.current) {
      window.clearTimeout(typingUiTimeoutRef.current)
    }

    typingUiTimeoutRef.current = window.setTimeout(() => {
      typingUiTimeoutRef.current = null
      isTypingRef.current = false
      setIsUiTyping(false)
      onTypingStateChangeRef.current?.(false)
    }, TYPING_IDLE_MS)
  }, [])

  // Any mouse movement reveals the chrome immediately — the auto-hide is only
  // meant to get out of the way while the user is heads-down typing, so the
  // moment they reach for the mouse the settings button, toolbar, toolbar
  // toggle, and ruler controls should all come straight back.
  useEffect(() => {
    const onMouseMove = () => {
      if (isTypingRef.current) clearUiTyping()
    }
    window.addEventListener("mousemove", onMouseMove)
    return () => window.removeEventListener("mousemove", onMouseMove)
  }, [clearUiTyping])

  useEffect(() => {
    return () => {
      if (typingUiTimeoutRef.current) {
        window.clearTimeout(typingUiTimeoutRef.current)
      }
      isTypingRef.current = false
      setIsUiTyping(false)
      onTypingStateChangeRef.current?.(false)
    }
  }, [])

  return {
    isUiTyping,
    markUiTypingActivity,
  }
}
