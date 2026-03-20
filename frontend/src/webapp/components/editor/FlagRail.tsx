import { Flag, FlagOff } from "lucide-react"

type FlagRailProps = {
  flagsEnabled: boolean
  activeDocumentKey: string
  flaggedAnchorsByDocument: Record<string, number[]>
  flaggedLineTops: Record<number, number>
  showFlagRailUi: boolean
  isUiTyping: boolean
  shouldShowCreateFlag: boolean
  currentLineTop: number | null
  currentLineAnchor: number | null
  flaggedAnchors: Set<number>
  setIsFlagRailHovered: (isHovered: boolean) => void
  clearHoverState: () => void
  updateHoverLineFromPointer: (clientY: number) => boolean
  onRemoveFlag: (anchor: number) => void
  onCreateFlag: (anchor: number) => void
}

export function FlagRail({
  flagsEnabled,
  activeDocumentKey,
  flaggedAnchorsByDocument,
  flaggedLineTops,
  showFlagRailUi,
  isUiTyping,
  shouldShowCreateFlag,
  currentLineTop,
  currentLineAnchor,
  flaggedAnchors,
  setIsFlagRailHovered,
  clearHoverState,
  updateHoverLineFromPointer,
  onRemoveFlag,
  onCreateFlag,
}: FlagRailProps) {
  if (!flagsEnabled) {
    return null
  }

  return (
    <>
      <div
        className={`editor-flag-rail ${showFlagRailUi ? "editor-flag-rail--active" : ""} ${isUiTyping ? "editor-flag-rail--typing" : ""}`.trim()}
        onMouseEnter={(event) => {
          setIsFlagRailHovered(true)
          const foundLine = updateHoverLineFromPointer(event.clientY)
          if (!foundLine) {
            clearHoverState()
          }
        }}
        onMouseMove={(event) => {
          const foundLine = updateHoverLineFromPointer(event.clientY)
          if (!foundLine) {
            clearHoverState()
          }
        }}
        onMouseLeave={() => {
          setIsFlagRailHovered(false)
          clearHoverState()
        }}
        aria-hidden="true"
      />
      {(flaggedAnchorsByDocument[activeDocumentKey] ?? []).map((anchor) => {
        const top = flaggedLineTops[anchor]

        if (typeof top !== "number") {
          return null
        }

        return (
          <button
            key={anchor}
            type="button"
            className={`editor-line-flag editor-line-flag--flagged editor-line-flag--persistent ${isUiTyping ? "editor-line-flag--typing" : ""}`.trim()}
            style={{ transform: `translate3d(0, ${top}px, 0)` }}
            onMouseDown={(event) => {
              event.preventDefault()
            }}
            onClick={() => {
              onRemoveFlag(anchor)
            }}
            aria-label="Unflag line"
          >
            <span className="editor-line-flag__icon editor-line-flag__icon--default" aria-hidden="true">
              <Flag size={15} strokeWidth={2.2} aria-hidden="true" />
            </span>
            <span className="editor-line-flag__icon editor-line-flag__icon--hover" aria-hidden="true">
              <FlagOff size={15} strokeWidth={2.2} aria-hidden="true" />
            </span>
          </button>
        )
      })}
      {shouldShowCreateFlag ? (
        <button
          type="button"
          className={`editor-line-flag editor-line-flag--create ${showFlagRailUi ? "editor-line-flag--revealed" : ""}`.trim()}
          style={{ transform: `translate3d(0, ${currentLineTop}px, 0)` }}
          onMouseDown={(event) => {
            // Keep editor focus so caret/line tracking does not jump on click.
            event.preventDefault()
          }}
          onMouseEnter={() => {
            setIsFlagRailHovered(true)
          }}
          onMouseLeave={() => {
            setIsFlagRailHovered(false)
          }}
          onClick={() => {
            if (currentLineAnchor === null) {
              return
            }

            onCreateFlag(currentLineAnchor)
          }}
          aria-label="Flag hovered line"
          aria-pressed={currentLineAnchor !== null && flaggedAnchors.has(currentLineAnchor)}
        >
          <Flag size={15} strokeWidth={2.2} aria-hidden="true" />
        </button>
      ) : null}
    </>
  )
}
