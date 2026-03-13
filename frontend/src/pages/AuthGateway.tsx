import { useMemo, useState } from "react"
import { ApiError, login, register, resendEmailVerification, verifyEmail } from "../core/api"
import "./AuthGateway.css"

type AuthMode = "login" | "signup"

type AuthGatewayProps = {
  onAuthenticated: (auth: {
    token: string
    user: {
      id: string
      firstName: string
      lastName: string
      email: string
      isEmailVerified: boolean
    }
  }) => Promise<void> | void
  loadError?: string
}

function isNetworkErrorMessage(message: string) {
  const normalized = message.toLowerCase()
  return normalized.includes("[network]") || normalized.includes("load failed") || normalized.includes("failed to fetch")
}

function formatAuthError(message: string) {
  if (isNetworkErrorMessage(message)) {
    return "Cannot reach the server right now. Please verify the backend is running and try again."
  }

  return message
}

export default function AuthGateway({ onAuthenticated, loadError = "" }: AuthGatewayProps) {
  const [screen, setScreen] = useState<"landing" | "auth" | "verify-email">("landing")
  const [mode, setMode] = useState<AuthMode>("signup")
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [verificationCode, setVerificationCode] = useState("")
  const [verificationUserId, setVerificationUserId] = useState("")
  const [verificationEmailMasked, setVerificationEmailMasked] = useState("")
  const [infoMessage, setInfoMessage] = useState("")
  const [error, setError] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const heading = useMemo(() => (mode === "signup" ? "Create your account" : "Log in"), [mode])
  const activeError = error || loadError
  const showCrashPanel = Boolean(activeError) && isNetworkErrorMessage(activeError)

  const submit = async () => {
    if (!email.trim() || !password) {
      setError("Email and password are required.")
      return
    }

    if (mode === "signup" && (!firstName.trim() || !lastName.trim())) {
      setError("First and last name are required.")
      return
    }

    if (mode === "signup" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Please enter a valid email address.")
      return
    }

    if (mode === "signup" && password.length < 8) {
      setError("Password must be at least 8 characters.")
      return
    }

    setError("")
    setInfoMessage("")
    setIsSubmitting(true)

    try {
      if (mode === "signup") {
        const response = await register(firstName.trim(), lastName.trim(), email.trim(), password)

        if ("requiresEmailVerification" in response && response.requiresEmailVerification) {
          setVerificationUserId(response.verification.userId)
          setVerificationEmailMasked(response.verification.emailMasked)
          setVerificationCode("")
          setScreen("verify-email")
          setInfoMessage(response.message ?? "Account created. Enter the code sent to your email.")
          return
        }

        if ("token" in response) {
          await onAuthenticated(response)
        }
        return
      }

      const auth = await login(email.trim(), password)
      await onAuthenticated(auth)
    } catch (submitError) {
      if (submitError instanceof ApiError) {
        const payload = submitError.payload as {
          code?: string
          requiresEmailVerification?: boolean
          verification?: { userId?: string; emailMasked?: string }
          message?: string
        }

        if (payload?.requiresEmailVerification && payload?.verification?.userId) {
          setVerificationUserId(payload.verification.userId)
          setVerificationEmailMasked(payload.verification.emailMasked ?? "")
          setVerificationCode("")
          setInfoMessage(payload.message ?? "Please verify your email to continue.")
          setScreen("verify-email")
          return
        }

        if (
          submitError.status === 403 &&
          payload?.code === "EMAIL_NOT_VERIFIED" &&
          payload?.verification?.userId
        ) {
          setVerificationUserId(payload.verification.userId)
          setVerificationEmailMasked(payload.verification.emailMasked ?? "")
          setVerificationCode("")
          setInfoMessage(payload.message ?? "Please verify your email to continue.")
          setScreen("verify-email")
          return
        }
      }

      const nextMessage = submitError instanceof Error ? submitError.message : "Unable to authenticate"
      setError(formatAuthError(nextMessage))
    } finally {
      setIsSubmitting(false)
    }
  }

  const submitVerification = async () => {
    if (!verificationUserId || !verificationCode.trim()) {
      setError("Verification code is required.")
      return
    }

    setError("")
    setInfoMessage("")
    setIsSubmitting(true)

    try {
      const auth = await verifyEmail(verificationUserId, verificationCode.trim())
      await onAuthenticated(auth)
    } catch (submitError) {
      const nextMessage = submitError instanceof Error ? submitError.message : "Unable to verify email"
      setError(formatAuthError(nextMessage))
    } finally {
      setIsSubmitting(false)
    }
  }

  const resendVerificationCode = async () => {
    if (!verificationUserId) {
      setError("Missing verification user. Please sign up again.")
      return
    }

    setError("")
    setInfoMessage("")
    setIsSubmitting(true)

    try {
      const response = await resendEmailVerification(verificationUserId)
      setVerificationEmailMasked(response.verification.emailMasked)
      setInfoMessage(response.message ?? "Verification email sent. Check your inbox.")
    } catch (submitError) {
      const nextMessage = submitError instanceof Error ? submitError.message : "Unable to resend code"
      setError(formatAuthError(nextMessage))
    } finally {
      setIsSubmitting(false)
    }
  }

  if (screen === "landing") {
    return (
      <>
        <div className="app-brand auth-gateway__brand" aria-hidden={true}>
          <span className="app-brand__name">ivoryscribe</span>
          <span className="app-brand__tagline">write an epic. save a species.</span>
        </div>

        <section className="auth-gateway">
          <div className="auth-gateway__hero">
            <h1>Write from anywhere. Pick up exactly where you left off.</h1>
            <p>
              Create an account to sync your projects, themes, and writing progress to your login.
            </p>

            <div className="auth-gateway__actions">
              <button
                type="button"
                className="auth-gateway__button auth-gateway__button--primary"
                onClick={() => {
                  setMode("signup")
                  setScreen("auth")
                }}
              >
                Sign up
              </button>
              <button
                type="button"
                className="auth-gateway__button"
                onClick={() => {
                  setMode("login")
                  setScreen("auth")
                }}
              >
                Log in
              </button>
            </div>
          </div>
        </section>
      </>
    )
  }

  if (screen === "verify-email") {
    return (
      <>
        <div className="app-brand auth-gateway__brand" aria-hidden={true}>
          <span className="app-brand__name">ivoryscribe</span>
          <span className="app-brand__tagline">write an epic. save a species.</span>
        </div>

        <section className="auth-gateway auth-gateway--form">
          <div className="auth-card">
            <button
              type="button"
              className="auth-card__back"
              onClick={() => {
                setScreen("auth")
                setError("")
                setInfoMessage("")
              }}
            >
              Back
            </button>

            <h2>Verify your email</h2>

            <p className="auth-card__hint">
              Enter the 6-digit code sent to <strong>{verificationEmailMasked || "your inbox"}</strong>.
            </p>

            <label className="auth-card__field" htmlFor="auth-verification-code">
              <span>Verification code</span>
              <input
                id="auth-verification-code"
                type="text"
                value={verificationCode}
                onChange={(event) => {
                  setVerificationCode(event.target.value)
                }}
                autoComplete="one-time-code"
                disabled={isSubmitting}
              />
            </label>

            {infoMessage ? <p className="auth-card__message">{infoMessage}</p> : null}
            {error ? <p className="auth-card__error">{error}</p> : null}

            <button
              type="button"
              className="auth-gateway__button auth-gateway__button--primary"
              onClick={submitVerification}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Please wait..." : "Verify email"}
            </button>

            <p className="auth-card__switch">
              Didn&apos;t get a code?
              <button type="button" onClick={resendVerificationCode} disabled={isSubmitting}>
                Resend
              </button>
            </p>
          </div>
        </section>
      </>
    )
  }

  return (
    <>
      <div className="app-brand auth-gateway__brand" aria-hidden={true}>
        <span className="app-brand__name">ivoryscribe</span>
        <span className="app-brand__tagline">write an epic. save a species.</span>
      </div>

      <section className="auth-gateway auth-gateway--form">
        <div className="auth-card">
          <button
            type="button"
            className="auth-card__back"
            onClick={() => {
              setScreen("landing")
              setError("")
            }}
          >
            Back
          </button>

          <h2>{heading}</h2>

          <label className="auth-card__field" htmlFor="auth-email-login">
            <span>Email</span>
            <input
              id="auth-email-login"
              type="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value)
              }}
              autoComplete="email"
              disabled={isSubmitting}
            />
          </label>

          {mode === "signup" ? (
            <>
              <label className="auth-card__field" htmlFor="auth-first-name">
                <span>First name</span>
                <input
                  id="auth-first-name"
                  type="text"
                  value={firstName}
                  onChange={(event) => {
                    setFirstName(event.target.value)
                  }}
                  autoComplete="given-name"
                  disabled={isSubmitting}
                />
              </label>

              <label className="auth-card__field" htmlFor="auth-last-name">
                <span>Last name</span>
                <input
                  id="auth-last-name"
                  type="text"
                  value={lastName}
                  onChange={(event) => {
                    setLastName(event.target.value)
                  }}
                  autoComplete="family-name"
                  disabled={isSubmitting}
                />
              </label>
            </>
          ) : null}

          <label className="auth-card__field" htmlFor="auth-password">
            <span>Password</span>
            <input
              id="auth-password"
              type="password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value)
              }}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              disabled={isSubmitting}
            />
          </label>

          {mode === "signup" ? (
            <p className="auth-card__hint">We will send a verification code right after signup.</p>
          ) : null}

          {infoMessage ? <p className="auth-card__message">{infoMessage}</p> : null}
          {error ? <p className="auth-card__error">{error}</p> : null}
          {!error && loadError ? <p className="auth-card__error">{formatAuthError(loadError)}</p> : null}

          {showCrashPanel ? (
            <div className="auth-card__crash" role="alert">
              <h3>Connection issue detected</h3>
              <p>IvoryScribe could not connect to the backend API.</p>
              <p>Check your backend and refresh or retry.</p>
            </div>
          ) : null}

          <button
            type="button"
            className="auth-gateway__button auth-gateway__button--primary"
            onClick={submit}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Please wait..." : mode === "signup" ? "Create account" : "Log in"}
          </button>

          <p className="auth-card__switch">
            {mode === "signup" ? "Already have an account?" : "Need an account?"}
            <button
              type="button"
              onClick={() => {
                setMode((current) => (current === "signup" ? "login" : "signup"))
                setError("")
                setInfoMessage("")
              }}
              disabled={isSubmitting}
            >
              {mode === "signup" ? "Log in" : "Sign up"}
            </button>
          </p>
        </div>
      </section>
    </>
  )
}
