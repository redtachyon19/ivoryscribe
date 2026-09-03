import { useCallback, useEffect, useRef, useState } from "react"
import { ChevronDown, Cloud, Send, UserCheck, UserX, UserRoundPlus, Crown, Users, LogIn } from "lucide-react"
import Modal from "../ui/Modal"
import MarqueeText from "../ui/MarqueeText"
import {
  createShare,
  getDocumentShares,
  updateShare,
  revokeShare,
  transferOwnership,
  type ShareRecord,
} from "@shared/api"
import "./ShareDialog.css"

type SharePanelProps = {
  sessionToken: string
  documentId: string | null
  autoLoad?: boolean
  isOwner?: boolean
  userEmail?: string
  ownerEmail?: string
  onClose?: () => void
  onEnableCloudSharing?: () => Promise<string | null>
}

function PermissionMenu({
  value,
  onChange,
  onTransferOwnership,
  showOwnerOption = false,
}: {
  value: "view" | "edit"
  onChange: (next: "view" | "edit") => void
  onTransferOwnership?: () => void
  showOwnerOption?: boolean
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

  const label = value === "edit" ? "Editor" : "Viewer"
  const baseOptions: { value: "view" | "edit"; label: string }[] = [
    { value: "view", label: "Viewer" },
    { value: "edit", label: "Editor" },
  ]

  return (
    <div className="share-dialog__permission-wrap" ref={wrapRef}>
      <button
        type="button"
        className="btn btn--field share-dialog__permission-trigger"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((c) => !c)}
      >
        <span>{label}</span>
        <ChevronDown size={14} strokeWidth={2} aria-hidden="true" />
      </button>
      <div
        className={`panel panel--popover share-dialog__permission-menu ${isOpen ? "share-dialog__permission-menu--open" : ""}`.trim()}
        role="listbox"
        aria-label="Permission"
      >
        {showOwnerOption ? (
          <button
            type="button"
            role="option"
            aria-selected={false}
            className="row share-dialog__permission-option share-dialog__permission-option--owner"
            onClick={() => {
              onTransferOwnership?.()
              setIsOpen(false)
            }}
          >
            Owner
          </button>
        ) : null}
        {baseOptions.map((opt) => (
          <button
            key={opt.value}
            type="button"
            role="option"
            aria-selected={opt.value === value}
            className={`row share-dialog__permission-option ${opt.value === value ? "row--active" : ""}`.trim()}
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

export function SharePanel({
  sessionToken,
  documentId,
  autoLoad = true,
  isOwner = true,
  userEmail = "",
  ownerEmail = "",
  onClose,
  onEnableCloudSharing,
}: SharePanelProps) {
  const [email, setEmail] = useState("")
  const [permission, setPermission] = useState<"view" | "edit">("edit")
  const [shares, setShares] = useState<ShareRecord[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [isTransferring, setIsTransferring] = useState(false)
  const [isEnablingCloud, setIsEnablingCloud] = useState(false)
  const [transferTarget, setTransferTarget] = useState<{ shareId: string; email: string } | null>(null)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  const loadShares = useCallback(async () => {
    if (!documentId || !sessionToken) return
    setIsLoading(true)
    try {
      if (isOwner) {
        const result = await getDocumentShares(sessionToken, documentId)
        setShares(result)
      }
    } catch {
    } finally {
      setIsLoading(false)
    }
  }, [documentId, sessionToken, isOwner])

  useEffect(() => {
    if (autoLoad) {
      loadShares()
    }
  }, [autoLoad, loadShares])

  const handleEnableCloudSharing = async () => {
    if (!onEnableCloudSharing) return
    setIsEnablingCloud(true)
    setError("")
    try {
      const result = await onEnableCloudSharing()
      if (!result) {
        setError("Sign in to upload this document to the cloud.")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to enable cloud sharing")
    } finally {
      setIsEnablingCloud(false)
    }
  }

  if (!documentId) {
    const needsLogin = !sessionToken
    return (
      <div className="share-dialog__enable-cloud">
        <div className="share-dialog__enable-cloud-icon">
          <Cloud size={36} strokeWidth={1.6} aria-hidden="true" />
        </div>
        <h4 className="share-dialog__enable-cloud-title">
          {needsLogin ? "Sign in to share" : "Enable cloud sharing"}
        </h4>
        <p className="share-dialog__enable-cloud-body">
          {needsLogin
            ? "Sharing requires an account so collaborators can find and open the document. Sign in to upload this file and invite people."
            : "This document is stored locally on your computer. Uploading a copy to the cloud lets you invite collaborators. Edits stay in sync between your disk and the cloud."}
        </p>
        <button
          type="button"
          className="btn btn--sm btn--primary"
          onClick={handleEnableCloudSharing}
          disabled={isEnablingCloud || !onEnableCloudSharing}
        >
          {needsLogin ? (
            <><LogIn size={14} strokeWidth={2} /> {isEnablingCloud ? "Opening sign in…" : "Sign in to share"}</>
          ) : (
            <><Cloud size={14} strokeWidth={2} /> {isEnablingCloud ? "Uploading…" : "Enable cloud sharing"}</>
          )}
        </button>
        {error ? <p className="field__error">{error}</p> : null}
      </div>
    )
  }

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
    }
  }

  const handleRevoke = async (shareId: string) => {
    try {
      await revokeShare(sessionToken, shareId)
      setShares((current) => current.filter((s) => s.id !== shareId))
    } catch {
    }
  }

  const handleTransferOwnership = async () => {
    if (!transferTarget) return
    setIsTransferring(true)
    setError("")
    try {
      await transferOwnership(sessionToken, { documentId, recipientEmail: transferTarget.email })
      onClose?.()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to transfer ownership"
      setError(message)
      setTransferTarget(null)
    } finally {
      setIsTransferring(false)
    }
  }

  if (!isOwner) {
    return (
      <div className="share-dialog__readonly">
        <div className="share-dialog__readonly-notice">
          <Users size={15} strokeWidth={2} aria-hidden="true" className="share-dialog__readonly-icon" />
          <span>You are a collaborator on this project. Only the owner can invite others.</span>
        </div>
        <div className="share-dialog__list">
          <span className="share-dialog__list-title">Collaborators</span>
          <div className="share-dialog__item">
            <div className="share-dialog__item-info">
              <Crown size={14} strokeWidth={2} aria-label="Owner" className="share-dialog__item-owner-icon" />
              <span className="share-dialog__item-email share-dialog__item-email--owner">
                {ownerEmail || "Project owner"}
              </span>
            </div>
            <span className="share-dialog__item-role">Owner</span>
          </div>
          {userEmail ? (
            <div className="share-dialog__item">
              <div className="share-dialog__item-info">
                <UserCheck size={14} strokeWidth={2} aria-label="You" className="share-dialog__item-accepted-icon" />
                <span className="share-dialog__item-email">{userEmail}</span>
              </div>
              <span className="share-dialog__item-role">You</span>
            </div>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="share-dialog__form">
        <input
          className="field__input share-dialog__email-input"
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
          className="btn"
          onClick={handleSendInvite}
          disabled={isSending || !email.trim()}
        >
          <Send size={14} strokeWidth={2} aria-hidden="true" />
          {isSending ? "Sending…" : "Share"}
        </button>
      </div>

      {error ? <p className="field__error">{error}</p> : null}
      {success ? <p className="share-dialog__success">{success}</p> : null}

      {isLoading ? (
        <p className="share-dialog__placeholder">Loading shared users…</p>
      ) : (
        <div className="share-dialog__list">
          <span className="share-dialog__list-title">Collaborators</span>
          <div className="share-dialog__item">
            <div className="share-dialog__item-info">
              <Crown size={14} strokeWidth={2} aria-label="Owner" className="share-dialog__item-owner-icon" />
              <span className="share-dialog__item-email share-dialog__item-email--owner">
                {userEmail || "You"}
              </span>
            </div>
            <span className="share-dialog__item-role">Owner</span>
          </div>
          {shares.length > 0 ? shares.map((share) => (
            <div key={share.id} className="share-dialog__item-group">
              <div className="share-dialog__item">
                <div className="share-dialog__item-info">
                  {share.status === "accepted" ? (
                    <UserCheck size={14} strokeWidth={2} aria-label="Accepted" className="share-dialog__item-accepted-icon" />
                  ) : (
                    <span className="share-dialog__item-pending-dot" aria-label="Pending" />
                  )}
                  <span className="share-dialog__item-email">{share.recipientEmail}</span>
                  {share.status === "pending" ? <span className="share-dialog__item-pending-label">Pending</span> : null}
                </div>
                <div className="share-dialog__item-actions">
                  <PermissionMenu
                    value={share.permission}
                    onChange={(next) => handlePermissionChange(share.id, next)}
                    onTransferOwnership={share.status === "accepted" ? () => setTransferTarget({ shareId: share.id, email: share.recipientEmail }) : undefined}
                    showOwnerOption={share.status === "accepted"}
                  />
                  <button
                    type="button"
                    className="btn btn--danger"
                    onClick={() => handleRevoke(share.id)}
                    title="Revoke access"
                  >
                    <UserX size={14} strokeWidth={2} aria-hidden="true" />
                    Revoke
                  </button>
                </div>
              </div>
              {transferTarget?.shareId === share.id ? (
                <div className="share-dialog__transfer-confirm">
                  <p className="share-dialog__transfer-confirm-text">
                    Transfer ownership to <strong>{transferTarget.email}</strong>? You will become an editor on this project.
                  </p>
                  <div className="share-dialog__transfer-confirm-actions">
                    <button
                      type="button"
                      className="btn btn--sm btn--outline"
                      onClick={() => setTransferTarget(null)}
                      disabled={isTransferring}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="btn btn--sm share-dialog__transfer-confirm-btn--confirm"
                      onClick={handleTransferOwnership}
                      disabled={isTransferring}
                    >
                      {isTransferring ? "Transferring…" : "Transfer"}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          )) : (
            <p className="share-dialog__placeholder">No collaborators yet.</p>
          )}
        </div>
      )}
    </>
  )
}

type ShareDialogProps = {
  isOpen: boolean
  onClose: () => void
  sessionToken: string
  documentId: string | null
  projectName: string
  isOwner?: boolean
  userEmail?: string
  ownerEmail?: string
  onEnableCloudSharing?: () => Promise<string | null>
}

export default function ShareDialog({
  isOpen,
  onClose,
  sessionToken,
  documentId,
  projectName,
  isOwner = true,
  userEmail = "",
  ownerEmail = "",
  onEnableCloudSharing,
}: ShareDialogProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Share "${projectName}"`}
      titleNode={
        <span className="share-dialog__title" tabIndex={0} data-marquee-parent>
          <MarqueeText text={`Share “${projectName}”`} />
        </span>
      }
      titleIcon={<UserRoundPlus size={19} strokeWidth={1.9} aria-hidden="true" />}
      closeLabel="Close Share Dialog"
    >
      <SharePanel
        sessionToken={sessionToken}
        documentId={documentId}
        autoLoad={isOpen}
        isOwner={isOwner}
        userEmail={userEmail}
        ownerEmail={ownerEmail}
        onClose={onClose}
        onEnableCloudSharing={onEnableCloudSharing}
      />
    </Modal>
  )
}
