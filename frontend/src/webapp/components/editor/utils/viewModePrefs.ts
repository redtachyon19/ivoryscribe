// Per-tab editor view-mode preference (drafting vs typewriter), persisted to
// localStorage per device so two collaborators on the same project can each
// keep their own preferred view. Extracted from Editor.tsx.

const VIEW_MODE_STORAGE_KEY = "ivoryscribe:tab-view-mode"

export type TabViewMode = "drafting" | "typewriter"

export function loadViewModeMap(): Record<string, TabViewMode> {
  if (typeof window === "undefined") return {}
  try {
    const raw = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const out: Record<string, TabViewMode> = {}
    for (const [k, v] of Object.entries(parsed)) {
      if (v === "drafting" || v === "typewriter") out[k] = v
    }
    return out
  } catch {
    return {}
  }
}

export function saveViewModeMap(map: Record<string, TabViewMode>) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, JSON.stringify(map))
  } catch {
    /* ignore */
  }
}
