export const SESSION_STORAGE_KEY = "ivoryscribe.session"

export type UserSession = {
  token: string
  user: {
    id: string
    firstName: string
    lastName: string
    email: string
    isEmailVerified: boolean
  }
}

export function getSessionFromStorage(): UserSession | null {
  if (typeof window === "undefined") {
    return null
  }

  const raw = window.localStorage.getItem(SESSION_STORAGE_KEY)
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as UserSession
    if (!parsed?.token || !parsed?.user?.id || !parsed?.user?.email) {
      return null
    }

    return parsed
  } catch {
    return null
  }
}

export function setSessionInStorage(session: UserSession | null) {
  if (typeof window === "undefined") {
    return
  }

  if (!session) {
    window.localStorage.removeItem(SESSION_STORAGE_KEY)
    return
  }

  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
}
