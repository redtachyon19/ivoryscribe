import { ApiError } from "./types"
import { getApiBase, getIsDev, getDevFallbackUrl } from "./config"

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
  const apiBase = getApiBase()
  const devFallbackUrl = getDevFallbackUrl()
  const shouldTryDevFallback = getIsDev() && Boolean(devFallbackUrl) && apiBase !== devFallbackUrl
  const tryFetch = (baseUrl: string) =>
    fetch(`${baseUrl}${path}`, {
      ...options,
      headers,
    })

  try {
    response = await tryFetch(apiBase)
  } catch (error) {
    const originalMessage = error instanceof Error ? error.message : "Request failed"
    if (isLikelyNetworkFailure(originalMessage) && shouldTryDevFallback) {
      try {
        response = await tryFetch(devFallbackUrl!)
      } catch (fallbackError) {
        const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : "Request failed"
        if (isLikelyNetworkFailure(fallbackMessage)) {
          throw new Error(
            `[NETWORK] Unable to reach backend at ${apiBase} or fallback ${devFallbackUrl}. Check that the API server is running.`,
            { cause: fallbackError },
          )
        }

        throw new Error(`[NETWORK] ${fallbackMessage}`, { cause: fallbackError })
      }
    } else if (isLikelyNetworkFailure(originalMessage)) {
      throw new Error(`[NETWORK] Unable to reach backend at ${apiBase}. Check that the API server is running.`, { cause: error })
    } else {
      throw new Error(`[NETWORK] ${originalMessage}`, { cause: error })
    }
  }

  const payload = (await response.json().catch(() => ({}))) as { message?: string; details?: string }

  if (!response.ok) {
    const details = payload.details ? ` (${payload.details})` : ""
    throw new ApiError(response.status, `[${response.status}] ${payload.message ?? "Request failed"}${details}`, payload)
  }

  return payload as T
}
