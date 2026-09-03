import { useEffect, useMemo, useRef, useState } from "react"
import { ApiError, login, register, resendEmailVerification, verifyEmail } from "@shared/api"
import GlobalCaretOverlay from "../components/layout/GlobalCaretOverlay"
import "./AuthPage.css"

const SIGNUP_ROW_MOTION_MS = 700
const HEADING_FADE_OUT_MS = 220
const HEADING_FADE_IN_MS = 760
const HEADING_SWAP_ANCHOR_MS = 200

type AuthMode = "login" | "signup"

export type AuthPageProps = {
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
  isLoggedIn?: boolean
  signedInFirstName?: string
  onLaunchDashboard?: () => void
  onSignOut?: () => void
  onBackToLanding?: () => void
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

export default function AuthPage({
  onAuthenticated,
  loadError = "",
  isLoggedIn = false,
  signedInFirstName = "",
  onLaunchDashboard,
  onSignOut,
  onBackToLanding,
}: AuthPageProps) {
  const [screen, setScreen] = useState<"auth" | "verify-email">("auth")
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
  const [headingMode, setHeadingMode] = useState<AuthMode>("signup")
  const [headingPhase, setHeadingPhase] = useState<"visible" | "fading-out" | "hidden" | "fading-in">("visible")
  const isFirstModeRenderRef = useRef(true)

  const heading = useMemo(() => (headingMode === "signup" ? "Welcome!" : "Glad to have you back!"), [headingMode])
  const activeError = error || loadError
  const showCrashPanel = Boolean(activeError) && isNetworkErrorMessage(activeError)
  const shellClassName = `web-auth-page__shell ${screen === "verify-email" && !isLoggedIn ? "web-auth-page__shell--left" : "web-auth-page__shell--right"}`.trim()

  useEffect(() => {
    if (isFirstModeRenderRef.current) {
      isFirstModeRenderRef.current = false
      return
    }

    let fadeOutTimeoutId: number | null = null
    let swapDelayTimeoutId: number | null = null
    let finalizeTimeoutId: number | null = null

    setHeadingPhase("fading-out")

    fadeOutTimeoutId = window.setTimeout(() => {
      setHeadingPhase("hidden")
      setHeadingMode(mode)

      const waitForMotionMs = mode === "login" ? Math.max(0, SIGNUP_ROW_MOTION_MS - HEADING_SWAP_ANCHOR_MS) : 0

      swapDelayTimeoutId = window.setTimeout(() => {
        setHeadingPhase("fading-in")

        finalizeTimeoutId = window.setTimeout(() => {
          setHeadingPhase("visible")
        }, HEADING_FADE_IN_MS)
      }, waitForMotionMs)
    }, HEADING_FADE_OUT_MS)

    return () => {
      if (fadeOutTimeoutId !== null) {
        window.clearTimeout(fadeOutTimeoutId)
      }

      if (swapDelayTimeoutId !== null) {
        window.clearTimeout(swapDelayTimeoutId)
      }

      if (finalizeTimeoutId !== null) {
        window.clearTimeout(finalizeTimeoutId)
      }
    }
  }, [mode])

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

  return (
    <div className="web-auth-page">
      <header className="web-auth-page__header">
        <button
          type="button"
          className="app-brand web-auth-page__brand"
          aria-label="Go to home page"
          onClick={onBackToLanding}
        >
          <span className="app-brand__name">ivoryscribe</span>
          <span className="app-brand__tagline">write an epic. save a species.</span>
        </button>
      </header>

      <section className="web-auth-page__section">
        <div className={shellClassName}>
          {isLoggedIn ? (
            <div className="web-auth-card" role="status" aria-live="polite">
            <h2>{signedInFirstName ? `You are signed in, ${signedInFirstName}.` : "You are already signed in."}</h2>
            <p className="web-auth-card__hint">Open your workspace or sign out to continue with a different account.</p>

            <div className="web-auth-card__actions-row">
              <button
                type="button"
                className="web-auth-button web-auth-button--primary"
                onClick={onLaunchDashboard}
              >
                Launch workspace
              </button>

              <button type="button" className="web-auth-button" onClick={onSignOut}>
                Sign out
              </button>
            </div>
            </div>
          ) : screen === "verify-email" ? (
            <div className="web-auth-card">
            <h2>Verify your email</h2>

            <p className="web-auth-card__hint">
              Enter the 6-digit code sent to <strong>{verificationEmailMasked || "your inbox"}</strong>.
            </p>

            <label className="web-auth-card__field" htmlFor="auth-verification-code">
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

            {infoMessage ? <p className="web-auth-card__message">{infoMessage}</p> : null}
            {error ? <p className="web-auth-card__error">{error}</p> : null}

            <button
              type="button"
              className="web-auth-button web-auth-button--primary"
              onClick={submitVerification}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Please wait..." : "Verify email"}
            </button>

            <p className="web-auth-card__switch">
              Didn&apos;t get a code?
              <button type="button" onClick={resendVerificationCode} disabled={isSubmitting}>
                Resend
              </button>
            </p>
            </div>
          ) : (
            <div className="web-auth-card">
            <h2 className={`web-auth-card__heading web-auth-card__heading--${headingPhase}`.trim()}>{heading}</h2>

            <div
              className={`web-auth-card__name-row ${mode === "signup" ? "web-auth-card__name-row--visible" : "web-auth-card__name-row--hidden"}`.trim()}
              aria-hidden={mode !== "signup"}
            >
              <label className="web-auth-card__field" htmlFor="auth-first-name">
                <span>First name</span>
                <input
                  id="auth-first-name"
                  type="text"
                  value={firstName}
                  onChange={(event) => {
                    setFirstName(event.target.value)
                  }}
                  autoComplete="given-name"
                  disabled={isSubmitting || mode !== "signup"}
                />
              </label>

              <label className="web-auth-card__field" htmlFor="auth-last-name">
                <span>Last name</span>
                <input
                  id="auth-last-name"
                  type="text"
                  value={lastName}
                  onChange={(event) => {
                    setLastName(event.target.value)
                  }}
                  autoComplete="family-name"
                  disabled={isSubmitting || mode !== "signup"}
                />
              </label>
            </div>

            <label className="web-auth-card__field" htmlFor="auth-email-login">
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

            <label className="web-auth-card__field" htmlFor="auth-password">
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
              <p className="web-auth-card__hint">We will send a verification code right after signup.</p>
            ) : null}

            {infoMessage ? <p className="web-auth-card__message">{infoMessage}</p> : null}
            {error ? <p className="web-auth-card__error">{error}</p> : null}
            {!error && loadError ? <p className="web-auth-card__error">{formatAuthError(loadError)}</p> : null}

            {showCrashPanel ? (
              <div className="web-auth-card__crash" role="alert">
                <h3>Connection issue detected</h3>
                <p>IvoryScribe could not connect to the backend API.</p>
                <p>Check your backend and refresh or retry.</p>
              </div>
            ) : null}

            <button
              type="button"
              className="web-auth-button web-auth-button--primary"
              onClick={submit}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Please wait..." : mode === "signup" ? "Create account" : "Log in"}
            </button>

            <div className="web-auth-card__mode-switch-block">
              <p>{mode === "signup" ? "Already have an account?" : "Don't have an account?"}</p>
              <button
                type="button"
                className="web-auth-card__mode-switch"
                onClick={() => {
                  setMode((current) => (current === "signup" ? "login" : "signup"))
                  setError("")
                  setInfoMessage("")
                }}
                disabled={isSubmitting}
              >
                {mode === "signup" ? "Log in" : "Sign up"}
              </button>
            </div>
            </div>
          )}
        </div>
      </section>

      <GlobalCaretOverlay />
    </div>
  )
}
