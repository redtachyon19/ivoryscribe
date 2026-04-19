import { useCallback, useEffect, useState } from "react"
import { Send, UserX, UserRoundPlus } from "lucide-react"
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
          type="email"
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
        <select
          className="share-dialog__permission-select"
          value={permission}
          onChange={(e) => setPermission(e.target.value as "view" | "edit")}
        >
          <option value="view">View only</option>
          <option value="edit">Can edit</option>
        </select>
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
                <span className="share-dialog__item-email">{share.recipientEmail}</span>
                <span className="share-dialog__item-status">{share.status}</span>
              </div>
              <div className="share-dialog__item-actions">
                <select
                  className="share-dialog__item-permission-select"
                  value={share.permission}
                  onChange={(e) => handlePermissionChange(share.id, e.target.value as "view" | "edit")}
                >
                  <option value="view">View only</option>
                  <option value="edit">Can edit</option>
                </select>
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
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Share "${projectName}"`}
      titleIcon={<UserRoundPlus size={19} strokeWidth={1.9} aria-hidden="true" />}
      closeLabel="Close Share Dialog"
    >
      <SharePanel
        sessionToken={sessionToken}
        documentId={documentId}
        autoLoad={isOpen}
      />
    </Modal>
  )
}
