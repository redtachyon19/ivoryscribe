import { Lock, LockKeyhole, LockOpen, LogOut, Trash2, UserRound } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import Button from "../ui/Button"
import Modal from "../ui/Modal"

type ActionFeedback = {
  kind: "password" | "delete"
  title: string
  message: string
  isError: boolean
  email?: string
  userId?: string
  code?: string
  isSubmitting?: boolean
}

export type AccountSectionProps = {
  accountFirstName: string
  accountLastName: string
  accountEmail: string
  onSaveAccountProfile: (input: { firstName: string; lastName: string }) => Promise<void> | void
  onRequestAccountEmailChange: (email: string) => Promise<{ message: string; change: { currentEmail: string; newEmail: string; step: "verify-current-email" } }> | { message: string; change: { currentEmail: string; newEmail: string; step: "verify-current-email" } }
  onVerifyCurrentAccountEmailChange: (code: string) => Promise<{ message: string; change: { currentEmail: string; newEmail: string; step: "verify-new-email" } }> | { message: string; change: { currentEmail: string; newEmail: string; step: "verify-new-email" } }
  onConfirmAccountEmailChange: (code: string) => Promise<void> | void
  onRequestPasswordReset: () => Promise<{ message: string; reset: { username: string; email: string } }> | { message: string; reset: { username: string; email: string } }
  onRequestAccountDeletion: () => Promise<{ message: string; deletion: { userId: string; email: string } }> | { message: string; deletion: { userId: string; email: string } }
  onConfirmAccountDeletionCode: (input: { userId: string; code: string }) => Promise<void> | void
  onSignOut: () => void
  onClose: () => void
  sectionRef: (element: HTMLElement | null) => void
  onActionFeedbackVisibilityChange?: (visible: boolean) => void
}

export default function AccountSettings({
  accountFirstName,
  accountLastName,
  accountEmail,
  onSaveAccountProfile,
  onRequestAccountEmailChange,
  onVerifyCurrentAccountEmailChange,
  onConfirmAccountEmailChange,
  onRequestPasswordReset,
  onRequestAccountDeletion,
  onConfirmAccountDeletionCode,
  onSignOut,
  onClose,
  sectionRef,
  onActionFeedbackVisibilityChange,
}: AccountSectionProps) {
  const [accountFirstNameDraft, setAccountFirstNameDraft] = useState(accountFirstName)
  const [accountLastNameDraft, setAccountLastNameDraft] = useState(accountLastName)
  const [accountEmailDraft, setAccountEmailDraft] = useState(accountEmail)
  const [currentEmailCodeDraft, setCurrentEmailCodeDraft] = useState("")
  const [newEmailCodeDraft, setNewEmailCodeDraft] = useState("")
  const [pendingAccountEmail, setPendingAccountEmail] = useState("")
  const [emailChangeStep, setEmailChangeStep] = useState<"idle" | "verify-current-email" | "verify-new-email">("idle")
  const [accountEmailFeedback, setAccountEmailFeedback] = useState("")
  const [accountEmailError, setAccountEmailError] = useState("")
  const [isEmailFieldUnlocked, setIsEmailFieldUnlocked] = useState(false)
  const [accountError, setAccountError] = useState("")
  const [isRequestingEmailChange, setIsRequestingEmailChange] = useState(false)
  const [isVerifyingCurrentEmailChange, setIsVerifyingCurrentEmailChange] = useState(false)
  const [isConfirmingEmailChange, setIsConfirmingEmailChange] = useState(false)
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false)
  const [isDeletingAccount, setIsDeletingAccount] = useState(false)
  const [actionFeedback, setActionFeedback] = useState<ActionFeedback | null>(null)
  const accountAutoSaveRequestRef = useRef(0)

  // Reserved for future modal-close actions from account section controls.
  void onClose

  const activeActionFeedback = actionFeedback
  const hasEmailDraftChanged = accountEmailDraft.trim().toLowerCase() !== accountEmail.trim().toLowerCase()

  const openActionFeedback = (nextFeedback: ActionFeedback) => {
    setActionFeedback(nextFeedback)
  }

  const closeActionFeedback = () => {
    setActionFeedback(null)
  }

  const updateDeleteFeedback = (updater: (current: ActionFeedback) => ActionFeedback) => {
    setActionFeedback((current) => {
      if (!current || current.kind !== "delete") {
        return current
      }

      const next = updater(current)
      return next
    })
  }

  useEffect(() => {
    onActionFeedbackVisibilityChange?.(Boolean(actionFeedback))
  }, [actionFeedback, onActionFeedbackVisibilityChange])

  useEffect(() => {
    setAccountFirstNameDraft(accountFirstName)
  }, [accountFirstName])

  useEffect(() => {
    setAccountLastNameDraft(accountLastName)
  }, [accountLastName])

  useEffect(() => {
    setAccountEmailDraft(accountEmail)
    setIsEmailFieldUnlocked(false)
  }, [accountEmail])

  useEffect(() => {
    const nextFirstName = accountFirstNameDraft.trim()
    const nextLastName = accountLastNameDraft.trim()
    const currentFirstName = accountFirstName.trim()
    const currentLastName = accountLastName.trim()

    if (!nextFirstName || !nextLastName) {
      return
    }

    if (nextFirstName.length > 80 || nextLastName.length > 80) {
      setAccountError("First and last name must be 80 characters or fewer.")
      return
    }

    if (nextFirstName === currentFirstName && nextLastName === currentLastName) {
      return
    }

    setAccountError("")

    const requestId = accountAutoSaveRequestRef.current + 1
    accountAutoSaveRequestRef.current = requestId

    const timeoutId = window.setTimeout(async () => {
      try {
        await onSaveAccountProfile({
          firstName: nextFirstName,
          lastName: nextLastName,
        })
      } catch (error) {
        if (accountAutoSaveRequestRef.current === requestId) {
          setAccountError(error instanceof Error ? error.message : "Failed to update account details")
        }
      } finally {
        if (accountAutoSaveRequestRef.current === requestId) {
        }
      }
    }, 420)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [accountFirstNameDraft, accountLastNameDraft, accountFirstName, accountLastName, onSaveAccountProfile])

  const requestAccountEmailChange = async () => {
    const nextEmail = accountEmailDraft.trim().toLowerCase()

    if (!nextEmail) {
      setAccountEmailError("Email is required.")
      setAccountEmailFeedback("")
      return
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
      setAccountEmailError("Enter a valid email address.")
      setAccountEmailFeedback("")
      return
    }

    if (nextEmail === accountEmail.toLowerCase()) {
      setAccountEmailError("This is already your current email.")
      setAccountEmailFeedback("")
      return
    }

    setIsRequestingEmailChange(true)
    setAccountEmailError("")
    setAccountEmailFeedback("")

    try {
      const result = await onRequestAccountEmailChange(nextEmail)
      setPendingAccountEmail(result.change.newEmail)
      setEmailChangeStep("verify-current-email")
      setCurrentEmailCodeDraft("")
      setNewEmailCodeDraft("")
      setAccountEmailFeedback(`Code sent to your current email (${result.change.currentEmail}). Enter it to continue.`)
    } catch (error) {
      setAccountEmailError(error instanceof Error ? error.message : "Failed to request email change")
    } finally {
      setIsRequestingEmailChange(false)
    }
  }

  const verifyCurrentAccountEmailChange = async () => {
    const code = currentEmailCodeDraft.trim()
    if (!/^\d{6}$/.test(code)) {
      setAccountEmailError("Enter the 6-digit code sent to your current email.")
      setAccountEmailFeedback("")
      return
    }

    setIsVerifyingCurrentEmailChange(true)
    setAccountEmailError("")
    setAccountEmailFeedback("")

    try {
      const result = await onVerifyCurrentAccountEmailChange(code)
      setEmailChangeStep("verify-new-email")
      setPendingAccountEmail(result.change.newEmail)
      setNewEmailCodeDraft("")
      setAccountEmailFeedback(`Current email verified. Enter the 6-digit code sent to ${result.change.newEmail}.`)
    } catch (error) {
      setAccountEmailError(error instanceof Error ? error.message : "Failed to verify current email")
    } finally {
      setIsVerifyingCurrentEmailChange(false)
    }
  }

  const confirmAccountEmailChange = async () => {
    const code = newEmailCodeDraft.trim()
    if (!/^\d{6}$/.test(code)) {
      setAccountEmailError("Enter the 6-digit code sent to your new email.")
      setAccountEmailFeedback("")
      return
    }

    setIsConfirmingEmailChange(true)
    setAccountEmailError("")
    setAccountEmailFeedback("")

    try {
      await onConfirmAccountEmailChange(code)
      setPendingAccountEmail("")
      setEmailChangeStep("idle")
      setCurrentEmailCodeDraft("")
      setNewEmailCodeDraft("")
      setAccountEmailFeedback("Email updated successfully.")
    } catch (error) {
      setAccountEmailError(error instanceof Error ? error.message : "Failed to confirm email change")
    } finally {
      setIsConfirmingEmailChange(false)
    }
  }

  const requestPasswordReset = async () => {
    setIsUpdatingPassword(true)

    openActionFeedback({
      kind: "password",
      title: "Reset Password",
      message: "Sending password reset email...",
      isError: false,
    })

    try {
      const result = await onRequestPasswordReset()
      openActionFeedback({
        kind: "password",
        title: "Reset Link Sent",
        message: `Password reset email sent to ${result.reset.email}. Open the link in that email to set your new password.`,
        isError: false,
      })
    } catch (error) {
      openActionFeedback({
        kind: "password",
        title: "Unable To Send Reset Link",
        message: error instanceof Error ? error.message : "Failed to request password reset",
        isError: true,
      })
    } finally {
      setIsUpdatingPassword(false)
    }
  }

  const requestAccountDeletion = async () => {
    setIsDeletingAccount(true)

    openActionFeedback({
      kind: "delete",
      title: "Delete Account",
      message: "Sending deletion confirmation email...",
      isError: false,
      email: "",
      userId: "",
      code: "",
      isSubmitting: false,
    })

    try {
      const result = await onRequestAccountDeletion()
      updateDeleteFeedback((current) => ({
        ...current,
        title: "Delete Account",
        message: `A delete confirmation email was sent to ${result.deletion.email}. Enter the 6-digit code from that email to delete your account now, or use the email link.`,
        isError: false,
        email: result.deletion.email,
        userId: result.deletion.userId,
        code: current.code ?? "",
        isSubmitting: false,
      }))
    } catch (error) {
      updateDeleteFeedback((current) => ({
        ...current,
        title: "Unable To Send Deletion Link",
        message: error instanceof Error ? error.message : "Failed to delete account",
        isError: true,
        isSubmitting: false,
      }))
    } finally {
      setIsDeletingAccount(false)
    }
  }

  const confirmDeleteAccountWithCode = async () => {
    if (!activeActionFeedback || activeActionFeedback.kind !== "delete") {
      return
    }

    const userId = (activeActionFeedback.userId ?? "").trim()
    const code = (activeActionFeedback.code ?? "").trim()

    if (!userId) {
      updateDeleteFeedback((current) => ({
        ...current,
        isError: true,
        message: "Missing deletion request. Please request account deletion again.",
      }))
      return
    }

    if (!/^\d{6}$/.test(code)) {
      updateDeleteFeedback((current) => ({
        ...current,
        isError: true,
        message: "Enter the 6-digit code from your deletion email.",
      }))
      return
    }

    updateDeleteFeedback((current) => ({
      ...current,
      isSubmitting: true,
      isError: false,
    }))

    try {
      await onConfirmAccountDeletionCode({ userId, code })
      closeActionFeedback()
    } catch (error) {
      updateDeleteFeedback((current) => ({
        ...current,
        isSubmitting: false,
        isError: true,
        message: error instanceof Error ? error.message : "Failed to confirm account deletion",
      }))
    }
  }

  return (
    <>
      <section
        className="global-settings__section"
        data-settings-section="account"
        ref={sectionRef}
      >
        <h3 className="global-settings__section-title">
          <UserRound size={18} strokeWidth={2} aria-hidden={true} />
          <span>Account Settings</span>
        </h3>

        <div className="global-settings__name-row">
          <label className="global-settings__field" htmlFor="settings-account-first-name">
            <span>First name</span>
            <input
              id="settings-account-first-name"
              type="text"
              value={accountFirstNameDraft}
              onChange={(event) => {
                setAccountFirstNameDraft(event.target.value)
              }}
              onBlur={() => {
                if (!accountFirstNameDraft.trim()) {
                  setAccountFirstNameDraft(accountFirstName)
                }
              }}
              maxLength={80}
              autoComplete="given-name"
            />
          </label>

          <label className="global-settings__field" htmlFor="settings-account-last-name">
            <span>Last name</span>
            <input
              id="settings-account-last-name"
              type="text"
              value={accountLastNameDraft}
              onChange={(event) => {
                setAccountLastNameDraft(event.target.value)
              }}
              onBlur={() => {
                if (!accountLastNameDraft.trim()) {
                  setAccountLastNameDraft(accountLastName)
                }
              }}
              maxLength={80}
              autoComplete="family-name"
            />
          </label>
        </div>

        <div className="global-settings__field">
          <span>Email</span>
          <div className="global-settings__email-field-row">
            <input
              className={`global-settings__email-input ${isEmailFieldUnlocked ? "global-settings__email-input--unlocked" : "global-settings__email-input--locked"}`.trim()}
              id="settings-account-email"
              type="text"
              value={accountEmailDraft}
              onChange={(event) => {
                setAccountEmailDraft(event.target.value)
              }}
              autoComplete="email"
              spellCheck={false}
              disabled={!isEmailFieldUnlocked || isRequestingEmailChange || isVerifyingCurrentEmailChange || isConfirmingEmailChange}
            />
            <button
              type="button"
              className="global-settings__email-lock-btn"
              aria-label={isEmailFieldUnlocked ? "Lock email field" : "Unlock email field"}
              title={isEmailFieldUnlocked ? "Lock email field" : "Unlock email field"}
              onClick={() => {
                setIsEmailFieldUnlocked((current) => !current)
              }}
              disabled={isRequestingEmailChange || isVerifyingCurrentEmailChange || isConfirmingEmailChange}
            >
              {isEmailFieldUnlocked ? <LockOpen size={15} strokeWidth={2} aria-hidden={true} /> : <Lock size={15} strokeWidth={2} aria-hidden={true} />}
            </button>
          </div>
        </div>

        <div className="global-settings__account-actions">
          {hasEmailDraftChanged ? (
            <button
              type="button"
              className="global-settings__account-action"
              onClick={() => {
                void requestAccountEmailChange()
              }}
              disabled={!isEmailFieldUnlocked || isRequestingEmailChange || isVerifyingCurrentEmailChange || isConfirmingEmailChange}
            >
              {isRequestingEmailChange ? "Sending..." : "Save email change"}
            </button>
          ) : null}

          {emailChangeStep === "verify-current-email" ? (
            <label className="global-settings__field" htmlFor="settings-account-email-current-code">
              <span>Current email code</span>
              <input
                id="settings-account-email-current-code"
                type="text"
                inputMode="numeric"
                value={currentEmailCodeDraft}
                onChange={(event) => {
                  setCurrentEmailCodeDraft(event.target.value.replace(/\D/g, "").slice(0, 6))
                }}
                autoComplete="one-time-code"
                placeholder="123456"
                disabled={isVerifyingCurrentEmailChange}
              />
            </label>
          ) : null}

          {emailChangeStep === "verify-current-email" ? (
            <button
              type="button"
              className="global-settings__account-action"
              onClick={() => {
                void verifyCurrentAccountEmailChange()
              }}
              disabled={isVerifyingCurrentEmailChange}
            >
              {isVerifyingCurrentEmailChange ? "Verifying..." : "Verify current email"}
            </button>
          ) : null}

          {emailChangeStep === "verify-new-email" ? (
            <label className="global-settings__field" htmlFor="settings-account-email-new-code">
              <span>New email code</span>
              <input
                id="settings-account-email-new-code"
                type="text"
                inputMode="numeric"
                value={newEmailCodeDraft}
                onChange={(event) => {
                  setNewEmailCodeDraft(event.target.value.replace(/\D/g, "").slice(0, 6))
                }}
                autoComplete="one-time-code"
                placeholder="123456"
                disabled={isConfirmingEmailChange}
              />
            </label>
          ) : null}

          {emailChangeStep === "verify-new-email" ? (
            <button
              type="button"
              className="global-settings__account-action"
              onClick={() => {
                void confirmAccountEmailChange()
              }}
              disabled={isConfirmingEmailChange}
            >
              {isConfirmingEmailChange ? "Confirming..." : "Confirm email change"}
            </button>
          ) : null}

          {pendingAccountEmail ? <p className="global-settings__section-copy">Pending new email: {pendingAccountEmail}</p> : null}

          {accountEmailFeedback ? <p className="global-settings__account-feedback">{accountEmailFeedback}</p> : null}
          {accountEmailError ? <p className="global-settings__account-error">{accountEmailError}</p> : null}
        </div>

        {accountError ? <p className="global-settings__account-error">{accountError}</p> : null}

        <div className="global-settings__account-footer-actions">
          <button
            type="button"
            className="global-settings__account-action global-settings__account-action--minimal"
            onClick={() => {
              void requestPasswordReset()
            }}
            disabled={isUpdatingPassword}
          >
            <LockKeyhole size={14} strokeWidth={2} aria-hidden={true} />
            {isUpdatingPassword ? "Sending..." : "Change password"}
          </button>
          <button
            type="button"
            className="global-settings__account-action global-settings__account-action--minimal"
            onClick={onSignOut}
          >
            <LogOut size={14} strokeWidth={2} aria-hidden={true} />
            Sign out
          </button>
          <button
            type="button"
            className="global-settings__account-action global-settings__account-action--danger-minimal"
            onClick={() => {
              void requestAccountDeletion()
            }}
            disabled={isDeletingAccount}
          >
            <Trash2 size={14} strokeWidth={2} aria-hidden={true} />
            {isDeletingAccount ? "Sending..." : "Delete"}
          </button>
        </div>
      </section>

      {activeActionFeedback ? (
        <Modal
          isOpen={Boolean(activeActionFeedback)}
          onClose={closeActionFeedback}
          title={activeActionFeedback.title}
          titleIcon={activeActionFeedback.kind === "delete" ? <Trash2 size={19} strokeWidth={1.9} aria-hidden={true} /> : <LockKeyhole size={19} strokeWidth={1.9} aria-hidden={true} />}
          closeLabel="Close Settings"
          panelClassName={activeActionFeedback.kind === "delete" ? "project-delete-modal__panel" : undefined}
          footer={
            activeActionFeedback.kind === "delete" ? (
              <Button
                variant="footer-danger"
                onClick={() => {
                  void confirmDeleteAccountWithCode()
                }}
                disabled={Boolean(activeActionFeedback.isSubmitting)}
              >
                <Trash2 size={14} strokeWidth={2} aria-hidden={true} />
                {activeActionFeedback.isSubmitting ? "Deleting..." : "Delete Account"}
              </Button>
            ) : null
          }
        >
          <p className={`global-settings__action-feedback-copy ${activeActionFeedback.isError ? "global-settings__action-feedback-copy--error" : ""}`.trim()}>
            {activeActionFeedback.message}
          </p>

          {activeActionFeedback.kind === "delete" ? (
            <label className="global-settings__delete-code-field" htmlFor="settings-delete-account-code">
              <span>6-digit code</span>
              <input
                id="settings-delete-account-code"
                className="global-settings__delete-code-input"
                type="text"
                inputMode="numeric"
                value={activeActionFeedback.code ?? ""}
                onChange={(event) => {
                  const nextCode = event.target.value.replace(/\D/g, "").slice(0, 6)
                  updateDeleteFeedback((current) => ({
                    ...current,
                    code: nextCode,
                  }))
                }}
                autoComplete="one-time-code"
                placeholder="123456"
                disabled={Boolean(activeActionFeedback.isSubmitting)}
              />
            </label>
          ) : null}
        </Modal>
      ) : null}
    </>
  )
}
