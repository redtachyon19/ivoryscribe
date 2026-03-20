import { useEffect, useMemo, useState } from "react"

export function useRouting() {
  const [currentLocation, setCurrentLocation] = useState(() =>
    typeof window === "undefined" ? "/" : `${window.location.pathname}${window.location.search}`,
  )

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    const onPopState = () => {
      setCurrentLocation(`${window.location.pathname}${window.location.search}`)
    }

    window.addEventListener("popstate", onPopState)
    return () => {
      window.removeEventListener("popstate", onPopState)
    }
  }, [])

  const currentPathname = useMemo(() => {
    if (typeof window === "undefined") {
      return "/"
    }

    return new URL(currentLocation, window.location.origin).pathname
  }, [currentLocation])

  const requestedProjectId = useMemo(() => {
    if (typeof window === "undefined" || currentPathname !== "/app") {
      return ""
    }

    const url = new URL(currentLocation, window.location.origin)
    return url.searchParams.get("projectId")?.trim() ?? ""
  }, [currentLocation, currentPathname])

  const checkoutResult = useMemo(() => {
    if (typeof window === "undefined" || currentPathname !== "/app") {
      return {
        state: "",
        sessionId: "",
      }
    }

    const url = new URL(currentLocation, window.location.origin)
    return {
      state: url.searchParams.get("checkout")?.trim() ?? "",
      sessionId: url.searchParams.get("session_id")?.trim() ?? "",
    }
  }, [currentLocation, currentPathname])

  const passwordResetToken = useMemo(() => {
    if (typeof window === "undefined" || currentPathname !== "/reset-password") {
      return ""
    }

    const url = new URL(currentLocation, window.location.origin)
    return url.searchParams.get("token")?.trim() ?? ""
  }, [currentLocation, currentPathname])

  const navigateTo = (path: string) => {
    if (typeof window !== "undefined") {
      window.history.pushState({}, "", path)
      setCurrentLocation(path)
    }
  }

  const navigateReplace = (path: string) => {
    if (typeof window !== "undefined") {
      window.history.replaceState({}, "", path)
      setCurrentLocation(path)
    }
  }

  return {
    currentLocation,
    setCurrentLocation,
    currentPathname,
    requestedProjectId,
    checkoutResult,
    passwordResetToken,
    navigateTo,
    navigateReplace,
  }
}
