import { useEffect, useRef, useState } from "react"
import { getSessionFromStorage, setSessionInStorage, type UserSession } from "./session"
import {
  updateAccountProfile,
  requestPasswordResetLink,
  requestAccountEmailChange as apiRequestAccountEmailChange,
  verifyCurrentEmailForAccountChange,
  confirmAccountEmailChange as apiConfirmAccountEmailChange,
  requestAccountDeletion as apiRequestAccountDeletion,
  confirmAccountDeletionCode,
} from "./api"

export function useSession(options?: {
  onLogin?: () => void
  onLogout?: () => void
}) {
  const [session, setSession] = useState<UserSession | null>(() => getSessionFromStorage())
  const [isAuthBootstrapping, setIsAuthBootstrapping] = useState(true)
  const [authLoadError, setAuthLoadError] = useState("")
  const sessionRef = useRef<UserSession | null>(session)

  useEffect(() => {
    sessionRef.current = session
  }, [session])

  const handleAuthenticated = async (nextSession: UserSession) => {
    setAuthLoadError("")
    setSession(nextSession)
    setSessionInStorage(nextSession)
    options?.onLogin?.()
  }

  const logout = () => {
    setSession(null)
    setSessionInStorage(null)
    setAuthLoadError("")
    options?.onLogout?.()
  }

  const updateSessionUser = (nextUser: {
    id: string
    firstName: string
    lastName: string
    email: string
    isEmailVerified: boolean
  }) => {
    setSession((currentSession) => {
      if (!currentSession) {
        return currentSession
      }

      const nextSession = {
        ...currentSession,
        user: {
          ...currentSession.user,
          ...nextUser,
        },
      }

      setSessionInStorage(nextSession)
      return nextSession
    })
  }

  const saveAccountProfile = async (input: { firstName: string; lastName: string }) => {
    if (!session) throw new Error("You need to be logged in to update account settings.")
    const updatedUser = await updateAccountProfile(session.token, input)
    updateSessionUser(updatedUser)
  }

  const requestPasswordReset = async () => {
    if (!session) throw new Error("You need to be logged in to update your password.")
    return requestPasswordResetLink(session.token)
  }

  const requestEmailChange = async (email: string) => {
    if (!session) throw new Error("You need to be logged in to change your email.")
    return apiRequestAccountEmailChange(session.token, email)
  }

  const verifyCurrentEmailChange = async (code: string) => {
    if (!session) throw new Error("You need to be logged in to verify your current email.")
    return verifyCurrentEmailForAccountChange(session.token, code)
  }

  const confirmEmailChange = async (code: string) => {
    if (!session) throw new Error("You need to be logged in to confirm your email change.")
    const updatedUser = await apiConfirmAccountEmailChange(session.token, code)
    updateSessionUser(updatedUser)
  }

  const requestDeletion = async () => {
    if (!session) throw new Error("You need to be logged in to delete your account.")
    return apiRequestAccountDeletion(session.token)
  }

  const confirmDeletionCode = async (input: { userId: string; code: string }) => {
    await confirmAccountDeletionCode(input)
    logout()
  }

  return {
    session,
    setSession,
    isAuthBootstrapping,
    setIsAuthBootstrapping,
    authLoadError,
    setAuthLoadError,
    sessionRef,
    handleAuthenticated,
    logout,
    updateSessionUser,
    saveAccountProfile,
    requestPasswordReset,
    requestEmailChange,
    verifyCurrentEmailChange,
    confirmEmailChange,
    requestDeletion,
    confirmDeletionCode,
  }
}
