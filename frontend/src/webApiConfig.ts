import { configureApi } from "@shared/api"

// Web/Electron-side API configuration. Lives in frontend/ (not shared/) because
// it reads Vite's import.meta.env and window.location, which only exist on web.
// Mobile configures @shared/api from its own Expo config instead.
export function initWebApiConfig() {
  const configuredApiBase = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "")
  const apiPort = (import.meta.env.VITE_API_PORT as string | undefined)?.trim() || "4000"
  const localhostBase = `http://localhost:${apiPort}`

  const resolveDefaultApiBase = () => {
    if (typeof window === "undefined") {
      return localhostBase
    }

    const { protocol, hostname } = window.location
    if (!hostname || protocol === "file:") {
      return localhostBase
    }

    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") {
      return localhostBase
    }

    return `http://${hostname}:${apiPort}`
  }

  configureApi({
    baseUrl: configuredApiBase ?? resolveDefaultApiBase(),
    isDev: import.meta.env.DEV,
    devFallbackUrl: localhostBase,
  })
}
