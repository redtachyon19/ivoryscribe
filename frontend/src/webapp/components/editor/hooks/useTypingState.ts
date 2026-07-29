import { useCallback, useEffect, useRef, useState } from "react"

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
  const isTypingRef = useRef(false)
  const [isUiTyping, setIsUiTyping] = useState(false)
  const onTypingStateChangeRef = useRef(onTypingStateChange)
  onTypingStateChangeRef.current = onTypingStateChange

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
