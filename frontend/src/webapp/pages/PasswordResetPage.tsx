import { useEffect, useMemo, useState } from "react"
import { getPasswordResetInfo, resetPasswordFromToken } from "@shared/api"
import GlobalCaretOverlay from "../components/layout/GlobalCaretOverlay"
import "./AuthPage.css"

export type PasswordResetPageProps = {
  token: string
  onBackToApp: () => void
}

export default function PasswordResetPage({ token, onBackToApp }: PasswordResetPageProps) {
  const [username, setUsername] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")

  const canSubmit = useMemo(() => !isSubmitting && !isLoading, [isLoading, isSubmitting])

  useEffect(() => {
    const loadResetInfo = async () => {
      if (!token) {
        setError("Password reset token is missing.")
        setIsLoading(false)
        return
      }

      setError("")
      setMessage("")
      setIsLoading(true)

      try {
        const response = await getPasswordResetInfo(token)
        setUsername(response.reset.username)
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Unable to open password reset link")
      } finally {
        setIsLoading(false)
      }
    }

    void loadResetInfo()
  }, [token])

  const submit = async () => {
    if (!newPassword || !confirmPassword) {
      setError("New password and confirmation are required.")
      setMessage("")
      return
    }

    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.")
      setMessage("")
      return
    }

    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.")
      setMessage("")
      return
    }

    setError("")
    setMessage("")
    setIsSubmitting(true)

    try {
      await resetPasswordFromToken({ token, newPassword })
      setMessage("Password updated. You can now log in with your new password.")
      setNewPassword("")
      setConfirmPassword("")
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to reset password")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="web-auth-page">
      <header className="web-auth-page__header">
        <button
          type="button"
          className="app-brand web-auth-page__brand"
          aria-label="Go to home page"
          onClick={onBackToApp}
        >
          <span className="app-brand__name">ivoryscribe</span>
          <span className="app-brand__tagline">write an epic. save a species.</span>
        </button>
      </header>

      <section className="web-auth-page__section">
        <div className="web-auth-page__shell">
          <div className="web-auth-card">
            <h2>Set new password</h2>

            {isLoading ? <p className="web-auth-card__hint">Validating reset link...</p> : null}

            {!isLoading ? (
              <p className="web-auth-card__hint">
                Username: <strong>{username || "unknown"}</strong>
              </p>
            ) : null}

            <label className="web-auth-card__field" htmlFor="auth-reset-password">
              <span>New password</span>
              <input
                id="auth-reset-password"
                type="password"
                value={newPassword}
                onChange={(event) => {
                  setNewPassword(event.target.value)
                }}
                autoComplete="new-password"
                disabled={!canSubmit}
              />
            </label>

            <label className="web-auth-card__field" htmlFor="auth-reset-password-confirm">
              <span>Confirm new password</span>
              <input
                id="auth-reset-password-confirm"
                type="password"
                value={confirmPassword}
                onChange={(event) => {
                  setConfirmPassword(event.target.value)
                }}
                autoComplete="new-password"
                disabled={!canSubmit}
              />
            </label>

            {message ? <p className="web-auth-card__message">{message}</p> : null}
            {error ? <p className="web-auth-card__error">{error}</p> : null}

            <div className="web-auth-card__actions-row">
              <button type="button" className="web-auth-button" onClick={onBackToApp} disabled={isSubmitting}>
                Back
              </button>
              <button
                type="button"
                className="web-auth-button web-auth-button--primary"
                onClick={submit}
                disabled={!canSubmit}
              >
                {isSubmitting ? "Updating..." : "Update password"}
              </button>
            </div>
          </div>
        </div>
      </section>

      <GlobalCaretOverlay />
    </div>
  )
}
