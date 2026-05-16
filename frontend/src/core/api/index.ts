// Barrel: existing imports `from "../../core/api"` keep working.
// New code can import directly from `core/api/<resource>` if preferred.

export * from "./types"
export { API_BASE, request } from "./request"
export * from "./auth"
export * from "./documents"
export * from "./preferences"
export * from "./ai"
export * from "./billing"
export * from "./shares"
