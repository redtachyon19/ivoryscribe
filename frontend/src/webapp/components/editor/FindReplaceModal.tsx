import { ArrowLeft, ArrowRight, ChevronDown, ChevronRight, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import "./FindReplaceModal.css"

type FindReplaceModalProps = {
  isOpen: boolean
  query: string
  replaceQuery: string
  normalizedQuery: string
  resultCount: number
  currentIndex: number
  expanded: boolean
  onQueryChange: (value: string) => void
  onReplaceQueryChange: (value: string) => void
  onGoNext: () => void
  onGoPrevious: () => void
  onReplaceCurrent: () => void
  onReplaceAll: () => void
  onToggleExpanded: () => void
  onClose: () => void
}

export default function FindReplaceModal({
  isOpen,
  query,
  replaceQuery,
  normalizedQuery,
  resultCount,
  currentIndex,
  expanded,
  onQueryChange,
  onReplaceQueryChange,
  onGoNext,
  onGoPrevious,
  onReplaceCurrent,
  onReplaceAll,
  onToggleExpanded,
  onClose,
}: FindReplaceModalProps) {
  const findInputRef = useRef<HTMLInputElement | null>(null)
  const [isRendered, setIsRendered] = useState(false)
  const [isClosing, setIsClosing] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setIsRendered(true)
      setIsClosing(false)
      return
    }

    if (!isRendered) {
      return
    }

    setIsClosing(true)
    const timeoutId = window.setTimeout(() => {
      setIsRendered(false)
      setIsClosing(false)
    }, 170)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [isOpen, isRendered])

  useEffect(() => {
    if (!isOpen || !isRendered) {
      return
    }

    const focusHandle = window.requestAnimationFrame(() => {
      findInputRef.current?.focus()
    })

    return () => {
      window.cancelAnimationFrame(focusHandle)
    }
  }, [isOpen, isRendered])

  useEffect(() => {
    if (!isRendered) {
      return
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return
      }

      event.preventDefault()
      onClose()
    }

    window.addEventListener("keydown", onKeyDown, true)
    return () => {
      window.removeEventListener("keydown", onKeyDown, true)
    }
  }, [isRendered, onClose])

  if (!isRendered) {
    return null
  }

  const counterText = !normalizedQuery
    ? ""
    : resultCount === 0
      ? "No results"
      : currentIndex >= 0
        ? `${currentIndex + 1} of ${resultCount}`
        : `${resultCount} found`

  const modalStateClassName = isClosing ? "find-replace-modal--closing" : "find-replace-modal--opening"
  const expandableClassName = `find-replace-modal__expandable${expanded ? " find-replace-modal__expandable--open" : ""}`

  return (
    <div className={`find-replace-modal__wrap ${modalStateClassName}`}>
      <aside className="find-replace-modal" role="dialog" aria-label="Find and replace">
        <button
          type="button"
          className="find-replace-modal__close-btn"
          onClick={onClose}
          aria-label="Close"
        >
          <X size={14} strokeWidth={2} aria-hidden />
        </button>

        <div className="find-replace-modal__row">
          <button
            type="button"
            className="find-replace-modal__btn find-replace-modal__toggle"
            onClick={onToggleExpanded}
            aria-label={expanded ? "Collapse replace" : "Expand replace"}
          >
            {expanded
              ? <ChevronDown size={14} strokeWidth={2} aria-hidden />
              : <ChevronRight size={14} strokeWidth={2} aria-hidden />}
          </button>

          <input
            ref={findInputRef}
            className="find-replace-modal__input"
            type="text"
            value={query}
            onChange={(event) => {
              onQueryChange(event.target.value)
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter") {
                return
              }

              event.preventDefault()

              if (event.shiftKey) {
                onGoPrevious()
              } else {
                onGoNext()
              }
            }}
            placeholder="Find"
            aria-label="Find text"
          />

          <span className="find-replace-modal__counter">{counterText || "\u00A0"}</span>

          <button
            type="button"
            className="find-replace-modal__btn"
            onClick={onGoPrevious}
            disabled={resultCount === 0}
            aria-label="Previous match"
          >
            <ArrowLeft size={14} strokeWidth={2} aria-hidden />
          </button>

          <button
            type="button"
            className="find-replace-modal__btn"
            onClick={onGoNext}
            disabled={resultCount === 0}
            aria-label="Next match"
          >
            <ArrowRight size={14} strokeWidth={2} aria-hidden />
          </button>
        </div>

        <div className={expandableClassName}>
          <div className="find-replace-modal__expandable-inner">
            <div className="find-replace-modal__row find-replace-modal__replace-row">
              <input
                className="find-replace-modal__input"
                type="text"
                value={replaceQuery}
                onChange={(event) => {
                  onReplaceQueryChange(event.target.value)
                }}
                placeholder="Replace with"
                aria-label="Replace with text"
                tabIndex={expanded ? 0 : -1}
              />

              <button
                type="button"
                className="find-replace-modal__action-btn"
                onClick={onReplaceCurrent}
                disabled={resultCount === 0 || currentIndex < 0}
                tabIndex={expanded ? 0 : -1}
              >
                Replace
              </button>

              <button
                type="button"
                className="find-replace-modal__action-btn"
                onClick={onReplaceAll}
                disabled={resultCount === 0}
                tabIndex={expanded ? 0 : -1}
              >
                Replace All
              </button>
            </div>
          </div>
        </div>
      </aside>
    </div>
  )
}
