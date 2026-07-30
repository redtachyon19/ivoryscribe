import { CheckCheck, ChevronLeft, ChevronRight, Ellipsis, Languages, X } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import type { SpellCheckDocumentType, SpellCheckIssue } from "../utils/spellChecker"
import "./SpellCheckModal.css"

type SpellCheckModalProps = {
  isOpen: boolean
  documentType: SpellCheckDocumentType | null
  issue: SpellCheckIssue | null
  issueIndex: number
  issueCount: number
  dictionaryWords: string[]
  canGoPrevious: boolean
  canGoNext: boolean
  onPrevious: () => void
  onNext: () => void
  onIgnore: () => void
  onAddToDictionary: () => void
  onRemoveDictionaryWord: (word: string) => void
  onApplySuggestion: (suggestion: string) => void
  onCommitPrimaryAction: () => void
  onClose: () => void
}

export default function SpellCheckModal({
  isOpen,
  documentType,
  issue,
  issueIndex,
  issueCount,
  dictionaryWords,
  canGoPrevious,
  canGoNext,
  onPrevious,
  onNext,
  onIgnore,
  onAddToDictionary,
  onRemoveDictionaryWord,
  onApplySuggestion,
  onCommitPrimaryAction,
  onClose,
}: SpellCheckModalProps) {
  const [isDictionaryOpen, setIsDictionaryOpen] = useState(false)
  const [isRendered, setIsRendered] = useState(false)
  const [isClosing, setIsClosing] = useState(false)
  const suggestions = useMemo(() => issue?.suggestions.slice(0, 3) ?? [], [issue])
  const sortedDictionaryWords = useMemo(() => [...dictionaryWords].sort((left, right) => left.localeCompare(right)), [dictionaryWords])
  const primaryActionLabel = suggestions.length > 0 ? `Auto: ${suggestions[0]}` : "Auto: Add to dictionary"

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
    if (!isOpen) {
      setIsDictionaryOpen(false)
      return
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        onClose()
        return
      }

      if (
        event.key === "Enter"
        && !event.shiftKey
        && !event.altKey
        && !event.ctrlKey
        && !event.metaKey
      ) {
        event.preventDefault()
        onCommitPrimaryAction()
      }
    }

    window.addEventListener("keydown", onKeyDown, true)
    return () => {
      window.removeEventListener("keydown", onKeyDown, true)
    }
  }, [isOpen, onClose, onCommitPrimaryAction])

  if (!isRendered) {
    return null
  }

  const modalStateClassName = isClosing ? "editor-popover--closing" : "editor-popover--opening"

  return (
    <div className={`editor-popover ${modalStateClassName}`}>
      <aside className="panel panel--popover panel--glass editor-popover__panel spell-check-popup" role="dialog" aria-label="Spell check" aria-live="polite">
        <button
          type="button"
          className="btn btn--icon btn--sm btn--pill btn--spin-icon btn--floating-close"
          onClick={onClose}
          aria-label="Close spell check"
        >
          <X size={14} strokeWidth={2} aria-hidden />
        </button>

        <header className="spell-check-popup__header">
          <h3>
            <Languages size={16} strokeWidth={2} aria-hidden={true} />
            Spelling &amp; Grammer
          </h3>

          <div className="spell-check-popup__header-actions">
            <button
              type="button"
              className="btn btn--icon btn--sm"
              onClick={onPrevious}
              disabled={!canGoPrevious}
              aria-label="Previous issue"
            >
              <ChevronLeft size={16} strokeWidth={2} aria-hidden={true} />
            </button>

            <button
              type="button"
              className="btn btn--icon btn--sm"
              onClick={onNext}
              disabled={!canGoNext}
              aria-label="Next issue"
            >
              <ChevronRight size={16} strokeWidth={2} aria-hidden={true} />
            </button>

            <button
              type="button"
              className={`btn btn--icon btn--sm${isDictionaryOpen ? " btn--active" : ""}`}
              onClick={() => {
                setIsDictionaryOpen((current) => !current)
              }}
              aria-expanded={isDictionaryOpen}
              aria-label="Toggle dictionary view"
            >
              <Ellipsis size={16} strokeWidth={2} aria-hidden={true} />
            </button>
          </div>
        </header>

      {!documentType ? (
        <p className="spell-check-popup__note">Spell check is available for text and markdown documents.</p>
      ) : !issue ? (
        <div className="spell-check-popup__complete">
          <CheckCheck size={16} strokeWidth={2} aria-hidden={true} />
          <p>No misspelled words remain.</p>
        </div>
      ) : (
        <>
          <p className="spell-check-popup__counter">{issueIndex}/{issueCount}</p>

          <p className="spell-check-popup__label">Current Word</p>
          <p className="spell-check-popup__word">{issue.word}</p>

          <p className="spell-check-popup__label">Suggestions</p>
          {suggestions.length > 0 ? (
            <div className="spell-check-popup__suggestions" role="listbox" aria-label="Spelling suggestions">
              {suggestions.map((suggestion, index) => (
                <button
                  key={`${suggestion}-${index}`}
                  type="button"
                  className={`spell-check-popup__suggestion-btn${index === 0 ? " spell-check-popup__suggestion-btn--auto" : ""}`}
                  onClick={() => onApplySuggestion(suggestion)}
                  aria-label={`Use suggestion ${suggestion}`}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          ) : (
            <p className="spell-check-popup__note">No automatic suggestion available.</p>
          )}

          <p className="spell-check-popup__label">Context</p>
          <p className="spell-check-popup__context">{issue.context}</p>

          <p className="spell-check-popup__primary-hint">Press Enter to commit: {primaryActionLabel}</p>

          <div className="spell-check-popup__footer">
            <button
              type="button"
              className="btn btn--sm"
              onClick={onIgnore}
            >
              Ignore
            </button>

            <button
              type="button"
              className={`btn btn--sm${suggestions.length === 0 ? " btn--primary" : ""}`}
              onClick={onAddToDictionary}
            >
              Add to Dictionary
            </button>
          </div>
        </>
      )}

      {isDictionaryOpen ? (
        <section className="spell-check-popup__dictionary" aria-label="Custom dictionary words">
          <p className="spell-check-popup__label">Dictionary</p>
          {sortedDictionaryWords.length > 0 ? (
            <div className="spell-check-popup__dictionary-list">
              {sortedDictionaryWords.map((word) => (
                <div key={word} className="spell-check-popup__dictionary-item">
                  <span className="spell-check-popup__dictionary-word">{word}</span>
                  <button
                    type="button"
                    className="btn btn--icon btn--sm btn--danger"
                    onClick={() => {
                      onRemoveDictionaryWord(word)
                    }}
                    aria-label={`Remove ${word} from dictionary`}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="spell-check-popup__note">Dictionary is empty.</p>
          )}
        </section>
      ) : null}
    </aside>
    </div>
  )
}