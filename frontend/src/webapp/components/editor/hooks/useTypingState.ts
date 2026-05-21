import { useCallback, useEffect, useRef, useState } from "react"

// How long after the last keystroke we keep the "typing" UI state on. Drives
// the auto-hide of surrounding chrome (rulers in Typewriter, flag rail in
// Drafting). Long enough to absorb the natural pause between words / while
// composing a sentence so the UI doesn't flicker on every comma. Kept in sync
// with the caret typing class timeout in useTypingCaret.ts.
const TYPING_IDLE_MS = 5000

type UseTypingStateParams = {
  onTypingStateChange?: (isTyping: boolean) => void
}

type UseTypingStateResult = {
  isUiTyping: boolean
  markUiTypingActivity: () => void
}

export function useTypingState({ onTypingStateChange }: UseTypingStateParams): UseTypingStateResult {
  const typingUiTimeoutRef = useRef<number | null>(null)
  const [isUiTyping, setIsUiTyping] = useState(false)

  const markUiTypingActivity = useCallback(() => {
    setIsUiTyping(true)
    onTypingStateChange?.(true)

    if (typingUiTimeoutRef.current) {
      window.clearTimeout(typingUiTimeoutRef.current)
    }

    typingUiTimeoutRef.current = window.setTimeout(() => {
      setIsUiTyping(false)
      onTypingStateChange?.(false)
      typingUiTimeoutRef.current = null
    }, TYPING_IDLE_MS)
  }, [onTypingStateChange])

  useEffect(() => {
    return () => {
      if (typingUiTimeoutRef.current) {
        window.clearTimeout(typingUiTimeoutRef.current)
      }
      setIsUiTyping(false)
      onTypingStateChange?.(false)
    }
  }, [onTypingStateChange])

  return {
    isUiTyping,
    markUiTypingActivity,
  }
}
