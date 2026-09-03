import { useCallback, useEffect, useMemo, useState } from "react"

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

  const requestedTabId = useMemo(() => {
    if (typeof window === "undefined" || currentPathname !== "/app") {
      return ""
    }

    const url = new URL(currentLocation, window.location.origin)
    return url.searchParams.get("tabId")?.trim() ?? ""
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

  // Stable identities: these are effect dependencies (the /app URL sync in
  // useAppOrchestration), and a fresh closure each render would re-run those
  // effects on every keystroke.
  const navigateTo = useCallback((path: string) => {
    if (typeof window !== "undefined") {
      window.history.pushState({}, "", path)
      setCurrentLocation(path)
    }
  }, [])

  const navigateReplace = useCallback((path: string) => {
    if (typeof window !== "undefined") {
      window.history.replaceState({}, "", path)
      setCurrentLocation(path)
    }
  }, [])

  return {
    currentLocation,
    setCurrentLocation,
    currentPathname,
    requestedProjectId,
    requestedTabId,
    checkoutResult,
    passwordResetToken,
    navigateTo,
    navigateReplace,
  }
}
