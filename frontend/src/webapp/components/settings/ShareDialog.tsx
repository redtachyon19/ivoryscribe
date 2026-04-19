import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react"
import { ChevronDown, Send, UserCheck, UserX, UserRoundPlus } from "lucide-react"
import Modal from "../ui/Modal"
import {
  createShare,
  getDocumentShares,
  updateShare,
  revokeShare,
  type ShareRecord,
} from "../../../core/api"
import "./ShareDialog.css"

type SharePanelProps = {
  sessionToken: string
  documentId: string
  /** When true, the panel loads shares immediately on mount. Defaults to true. */
  autoLoad?: boolean
}

function PermissionMenu({
  value,
  onChange,
  size = "normal",
}: {
  value: "view" | "edit"
  onChange: (next: "view" | "edit") => void
  size?: "normal" | "small"
}) {
  const [isOpen, setIsOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!isOpen) return
    const onPointerDown = (event: MouseEvent) => {
      if (wrapRef.current?.contains(event.target as Node)) return
      setIsOpen(false)
    }
    window.addEventListener("mousedown", onPointerDown)
    return () => window.removeEventListener("mousedown", onPointerDown)
  }, [isOpen])

  const label = value === "edit" ? "Can edit" : "View only"
  const options: { value: "view" | "edit"; label: string }[] = [
    { value: "view", label: "View only" },
    { value: "edit", label: "Can edit" },
  ]

  return (
    <div className="share-dialog__permission-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`share-dialog__permission-trigger ${size === "small" ? "share-dialog__permission-trigger--small" : ""}`.trim()}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((c) => !c)}
      >
        <span>{label}</span>
        <ChevronDown size={14} strokeWidth={2} aria-hidden="true" />
      </button>
      <div
        className={`share-dialog__permission-menu ${isOpen ? "share-dialog__permission-menu--open" : "share-dialog__permission-menu--closed"}`.trim()}
        role="listbox"
        aria-label="Permission"
      >
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            role="option"
            aria-selected={opt.value === value}
            className={`share-dialog__permission-option ${opt.value === value ? "share-dialog__permission-option--active" : ""}`.trim()}
            onClick={() => {
              onChange(opt.value)
              setIsOpen(false)
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * Reusable sharing content: invite form + shared-user list with permission/revoke controls.
 * Can be embedded inline (ProjectSettings) or inside a modal (ShareDialog).
 */
export function SharePanel({
  sessionToken,
  documentId,
  autoLoad = true,
}: SharePanelProps) {
  const [email, setEmail] = useState("")
  const [permission, setPermission] = useState<"view" | "edit">("edit")
  const [shares, setShares] = useState<ShareRecord[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  const loadShares = useCallback(async () => {
    if (!documentId || !sessionToken) return
    setIsLoading(true)
    try {
      const result = await getDocumentShares(sessionToken, documentId)
      setShares(result)
    } catch {
      // Ignore load errors silently
    } finally {
      setIsLoading(false)
    }
  }, [documentId, sessionToken])

  useEffect(() => {
    if (autoLoad) {
      loadShares()
    }
  }, [autoLoad, loadShares])

  const handleSendInvite = async () => {
    const trimmedEmail = email.trim().toLowerCase()
    if (!trimmedEmail) {
      setError("Please enter an email address")
      return
    }

    setIsSending(true)
    setError("")
    setSuccess("")

    try {
      await createShare(sessionToken, {
        documentId,
        recipientEmail: trimmedEmail,
        permission,
      })
      setSuccess(`Share request sent to ${trimmedEmail}`)
      setEmail("")
      await loadShares()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to send invite"
      setError(message)
    } finally {
      setIsSending(false)
    }
  }

  const handlePermissionChange = async (shareId: string, nextPermission: "view" | "edit") => {
    try {
      await updateShare(sessionToken, shareId, { permission: nextPermission })
      setShares((current) =>
        current.map((s) => (s.id === shareId ? { ...s, permission: nextPermission } : s)),
      )
    } catch {
      // Ignore silently
    }
  }

  const handleRevoke = async (shareId: string) => {
    try {
      await revokeShare(sessionToken, shareId)
      setShares((current) => current.filter((s) => s.id !== shareId))
    } catch {
      // Ignore silently
    }
  }

  return (
    <>
      <div className="share-dialog__form">
        <input
          className="share-dialog__email-input"
          type="text"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="Enter email address"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value)
            if (error) setError("")
            if (success) setSuccess("")
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              handleSendInvite()
            }
          }}
        />
        <PermissionMenu value={permission} onChange={setPermission} />
        <button
          type="button"
          className="share-dialog__send-btn"
          onClick={handleSendInvite}
          disabled={isSending || !email.trim()}
        >
          <Send size={14} strokeWidth={2} aria-hidden="true" />
          {isSending ? "Sending…" : "Share"}
        </button>
      </div>

      {error ? <p className="share-dialog__error">{error}</p> : null}
      {success ? <p className="share-dialog__success">{success}</p> : null}

      {isLoading ? (
        <p className="share-dialog__loading">Loading shared users…</p>
      ) : shares.length > 0 ? (
        <div className="share-dialog__list">
          <span className="share-dialog__list-title">Shared with</span>
          {shares.map((share) => (
            <div key={share.id} className="share-dialog__item">
              <div className="share-dialog__item-info">
                {share.status === "accepted" ? (
                  <UserCheck size={14} strokeWidth={2} aria-label="Accepted" className="share-dialog__item-accepted-icon" />
                ) : null}
                <span className="share-dialog__item-email">{share.recipientEmail}</span>
              </div>
              <div className="share-dialog__item-actions">
                <PermissionMenu
                  value={share.permission}
                  onChange={(next) => handlePermissionChange(share.id, next)}
                  size="small"
                />
                <button
                  type="button"
                  className="share-dialog__revoke-btn"
                  onClick={() => handleRevoke(share.id)}
                  title="Revoke access"
                >
                  <UserX size={14} strokeWidth={2} aria-hidden="true" />
                  Revoke
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="share-dialog__empty">This project hasn't been shared with anyone yet.</p>
      )}
    </>
  )
}

type ShareDialogProps = {
  isOpen: boolean
  onClose: () => void
  sessionToken: string
  documentId: string
  projectName: string
}

export default function ShareDialog({
  isOpen,
  onClose,
  sessionToken,
  documentId,
  projectName,
}: ShareDialogProps) {
  const [viewportEl, setViewportEl] = useState<HTMLSpanElement | null>(null)
  const marqueeTextRef = useRef<HTMLSpanElement | null>(null)
  const [marquee, setMarquee] = useState({ isOverflowing: false, loopDistance: 0 })

  useEffect(() => {
    if (!isOpen || !viewportEl) return

    const text = marqueeTextRef.current
    if (!text) return

    const measure = () => {
      const viewportWidth = viewportEl.clientWidth
      const textWidth = text.scrollWidth
      const nextIsOverflowing = textWidth > viewportWidth + 1
      const nextLoopDistance = nextIsOverflowing ? textWidth + 28 : 0

      setMarquee((current) => {
        if (current.isOverflowing === nextIsOverflowing && current.loopDistance === nextLoopDistance) return current
        return { isOverflowing: nextIsOverflowing, loopDistance: nextLoopDistance }
      })
    }

    measure()
    const rafId = window.requestAnimationFrame(measure)
    const delayedMeasureId = window.setTimeout(measure, 240)

    const resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null
    resizeObserver?.observe(viewportEl)
    resizeObserver?.observe(text)
    window.addEventListener("resize", measure)

    return () => {
      window.cancelAnimationFrame(rafId)
      window.clearTimeout(delayedMeasureId)
      resizeObserver?.disconnect()
      window.removeEventListener("resize", measure)
    }
  }, [isOpen, projectName, viewportEl])

  const titleNode = (
    <span
      ref={setViewportEl}
      className={`share-dialog__title-marquee ${marquee.isOverflowing ? "share-dialog__title-marquee--overflowing" : ""}`.trim()}
      style={
        marquee.isOverflowing
          ? ({ "--share-dialog-marquee-distance": `${marquee.loopDistance}px` } as CSSProperties)
          : undefined
      }
    >
      <span className="share-dialog__title-marquee-track">
        <span ref={marqueeTextRef} className="share-dialog__title-marquee-text">
          Share &ldquo;{projectName}&rdquo;
        </span>
        {marquee.isOverflowing ? <span className="share-dialog__title-marquee-gap" aria-hidden="true" /> : null}
        {marquee.isOverflowing ? (
          <span className="share-dialog__title-marquee-text" aria-hidden="true">
            Share &ldquo;{projectName}&rdquo;
          </span>
        ) : null}
      </span>
    </span>
  )

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      titleIcon={<UserRoundPlus size={19} strokeWidth={1.9} aria-hidden="true" />}
      closeLabel="Close Share Dialog"
      panelClassName="share-dialog__modal-panel"
    >
      <div className="share-dialog__custom-header">
        <h3 className="share-dialog__custom-title">
          <UserRoundPlus size={19} strokeWidth={1.9} aria-hidden="true" />
          <span className="share-dialog__title-label" tabIndex={0}>
            {titleNode}
          </span>
        </h3>
      </div>
      <SharePanel
        sessionToken={sessionToken}
        documentId={documentId}
        autoLoad={isOpen}
      />
    </Modal>
  )
}
