// Injectable API configuration.
//
// Each host app configures the client once at startup:
//   - frontend/ (Vite web + Electron) reads import.meta.env / window.location
//   - website/  does not call the API
//   - mobile/   (Expo) passes a static base URL from its app config
//
// This module deliberately touches NO platform globals (no import.meta, no
// window) so it bundles cleanly under both Vite and Metro/Hermes.

export type ApiConfig = {
  /** Base URL of the backend, e.g. https://api.ivoryscribe.com (no trailing slash). */
  baseUrl: string
  /** When true, request() retries against devFallbackUrl on a network failure. */
  isDev: boolean
  /** Optional localhost fallback tried in dev when the primary base is unreachable. */
  devFallbackUrl?: string
}

let config: ApiConfig = {
  baseUrl: "http://localhost:4000",
  isDev: false,
  devFallbackUrl: undefined,
}

const stripTrailingSlash = (url: string) => url.replace(/\/$/, "")

/** Called once at startup by each host app before any request() runs. */
export function configureApi(partial: Partial<ApiConfig>) {
  config = {
    ...config,
    ...partial,
    baseUrl: partial.baseUrl ? stripTrailingSlash(partial.baseUrl) : config.baseUrl,
    devFallbackUrl: partial.devFallbackUrl
      ? stripTrailingSlash(partial.devFallbackUrl)
      : config.devFallbackUrl,
  }
}

export function getApiBase() {
  return config.baseUrl
}

export function getIsDev() {
  return config.isDev
}

export function getDevFallbackUrl() {
  return config.devFallbackUrl
}
