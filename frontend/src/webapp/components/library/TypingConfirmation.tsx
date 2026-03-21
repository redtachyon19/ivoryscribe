import type { RefObject } from "react"

type TypingConfirmationProps = {
  requiredCharacters: string[]
  enteredCharacters: string[]
  confirmationText: string
  inputRef: RefObject<HTMLInputElement | null>
  onTextChange: (value: string) => void
  onConfirm: () => void
}

export default function TypingConfirmation({
  requiredCharacters,
  enteredCharacters,
  confirmationText,
  inputRef,
  onTextChange,
  onConfirm,
}: TypingConfirmationProps) {
  return (
    <div
      className="project-delete-modal__typing-box"
      onClick={() => { inputRef.current?.focus() }}
    >
      <p className="project-delete-modal__typing-text" aria-hidden="true">
        {requiredCharacters.map((character, index) => {
          const typedCharacter = enteredCharacters[index]
          const stateClassName =
            typedCharacter === undefined
              ? "project-delete-modal__typing-char--pending"
              : typedCharacter === character
                ? "project-delete-modal__typing-char--correct"
                : "project-delete-modal__typing-char--wrong"

          return (
            <span key={`required-${index}`} className={`project-delete-modal__typing-char ${stateClassName}`}>
              {character}
            </span>
          )
        })}
        {enteredCharacters.slice(requiredCharacters.length).map((character, index) => (
          <span
            key={`overflow-${index}`}
            className="project-delete-modal__typing-char project-delete-modal__typing-char--wrong"
          >
            {character}
          </span>
        ))}
      </p>

      <input
        ref={inputRef}
        className="project-delete-modal__typing-input"
        value={confirmationText}
        autoFocus
        onChange={(event) => { onTextChange(event.target.value) }}
        onKeyDown={(event) => {
          if (event.key === "Enter") { event.preventDefault(); onConfirm() }
        }}
        spellCheck={false}
        autoCapitalize="none"
        autoCorrect="off"
        aria-label="Type the required delete confirmation phrase"
      />
    </div>
  )
}
