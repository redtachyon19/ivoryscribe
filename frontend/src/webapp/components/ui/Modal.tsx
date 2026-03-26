import { type ReactNode, useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { X } from "lucide-react"
import GhostButton from "./GhostButton"
import "./Modal.css"

type ModalProps = {
  isOpen: boolean
  onClose: () => void
  title?: string
  titleIcon?: ReactNode
  closeLabel?: string
  showCloseButton?: boolean
  panelClassName?: string
  children: ReactNode
  actions?: ReactNode
  footer?: ReactNode
}

const CLOSE_ANIMATION_MS = 170

export default function Modal({
  isOpen,
  onClose,
  title,
  titleIcon,
  closeLabel = "Close",
  showCloseButton = true,
  panelClassName,
  children,
  actions,
  footer,
}: ModalProps) {
  const [isRendered, setIsRendered] = useState(false)
  const [isClosing, setIsClosing] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setIsRendered(true)
      setIsClosing(false)
      return
    }
    if (!isRendered) return
    setIsClosing(true)
    const timeoutId = window.setTimeout(() => {
      setIsRendered(false)
      setIsClosing(false)
    }, CLOSE_ANIMATION_MS)
    return () => { window.clearTimeout(timeoutId) }
  }, [isOpen, isRendered])

  useEffect(() => {
    if (!isRendered) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => { window.removeEventListener("keydown", handleKeyDown) }
  }, [isRendered, onClose])

  if (!isRendered) return null

  const animSuffix = isClosing ? "--closing" : "--opening"
  const resolvedFooter = footer ?? actions

  const portalTarget = document.querySelector<HTMLElement>(".app") ?? document.body

  return createPortal(
    <>
      <div
        className={`ui-modal__overlay ui-modal__overlay${animSuffix}`}
        onMouseDown={onClose}
        aria-hidden="true"
      />
      <div className="ui-modal__frame">
        {showCloseButton ? (
          <GhostButton
            className={`ui-modal__floating-close ui-modal__floating-close${animSuffix}`}
            aria-label={closeLabel}
            label={closeLabel}
            onClick={onClose}
          >
            <X size={16} strokeWidth={2} aria-hidden="true" />
          </GhostButton>
        ) : null}
        <div
          className={`ui-modal__panel ui-modal__panel${animSuffix}${panelClassName ? ` ${panelClassName}` : ""}`}
          role="dialog"
          aria-modal="true"
          aria-label={title || "Dialog"}
        >
          {title ? (
            <div className="ui-modal__header">
              <h3 className="ui-modal__title">
                {titleIcon}
                <span>{title}</span>
              </h3>
            </div>
          ) : null}
          <div className="ui-modal__body">{children}</div>
          {resolvedFooter ? <div className="ui-modal__footer ui-modal__actions">{resolvedFooter}</div> : null}
        </div>
      </div>
    </>,
    portalTarget,
  )
}
