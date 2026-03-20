import { useCallback, useEffect, useRef, useState } from "react"

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
    }, 450)
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
