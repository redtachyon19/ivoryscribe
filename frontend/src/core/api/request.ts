// Shared HTTP transport for every endpoint module.
//
// Resolves the API base URL from VITE_API_URL / VITE_API_PORT, with a
// localhost dev fallback when the configured base is unreachable. All
// non-OK responses raise ApiError so callers can branch on status codes.

import { ApiError } from "./types"

const configuredApiBase = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "")
const API_PORT = (import.meta.env.VITE_API_PORT as string | undefined)?.trim() || "4000"

function resolveDefaultApiBase() {
  const localhostBase = `http://localhost:${API_PORT}`

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

  return `http://${hostname}:${API_PORT}`
}

export const API_BASE = configuredApiBase ?? resolveDefaultApiBase()
const DEV_FALLBACK_API_BASE = `http://localhost:${API_PORT}`

function isLikelyNetworkFailure(message: string) {
  const normalized = message.toLowerCase()
  return (
    normalized.includes("load failed") ||
    normalized.includes("failed to fetch") ||
    normalized.includes("networkerror") ||
    normalized.includes("network request failed") ||
    normalized.includes("fetch failed") ||
    normalized.includes("network error")
  )
}

export async function request<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const headers = new Headers(options.headers)

  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json")
  }

  if (token) {
    headers.set("Authorization", `Bearer ${token}`)
  }

  let response: Response
  const shouldTryDevFallback = import.meta.env.DEV && API_BASE !== DEV_FALLBACK_API_BASE
  const tryFetch = (baseUrl: string) =>
    fetch(`${baseUrl}${path}`, {
      ...options,
      headers,
    })

  try {
    response = await tryFetch(API_BASE)
  } catch (error) {
    const originalMessage = error instanceof Error ? error.message : "Request failed"
    if (isLikelyNetworkFailure(originalMessage) && shouldTryDevFallback) {
      try {
        response = await tryFetch(DEV_FALLBACK_API_BASE)
      } catch (fallbackError) {
        const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : "Request failed"
        if (isLikelyNetworkFailure(fallbackMessage)) {
          throw new Error(
            `[NETWORK] Unable to reach backend at ${API_BASE} or fallback ${DEV_FALLBACK_API_BASE}. Check that the API server is running.`,
          )
        }

        throw new Error(`[NETWORK] ${fallbackMessage}`)
      }
    } else if (isLikelyNetworkFailure(originalMessage)) {
      throw new Error(`[NETWORK] Unable to reach backend at ${API_BASE}. Check that the API server is running.`)
    } else {
      throw new Error(`[NETWORK] ${originalMessage}`)
    }
  }

  const payload = (await response.json().catch(() => ({}))) as { message?: string; details?: string }

  if (!response.ok) {
    const details = payload.details ? ` (${payload.details})` : ""
    throw new ApiError(response.status, `[${response.status}] ${payload.message ?? "Request failed"}${details}`, payload)
  }

  return payload as T
}
