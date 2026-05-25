// Per-tab markdown view-mode preference (editor / both / preview), persisted
// to localStorage per device. Mirrors viewModePrefs.ts (drafting/typewriter)
// but for the Markdown editor's split-pane mode.

const VIEW_MODE_STORAGE_KEY = "ivoryscribe:tab-markdown-view-mode"

export type MarkdownTabViewMode = "editor" | "both" | "preview"

export function loadMarkdownViewModeMap(): Record<string, MarkdownTabViewMode> {
  if (typeof window === "undefined") return {}
  try {
    const raw = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const out: Record<string, MarkdownTabViewMode> = {}
    for (const [k, v] of Object.entries(parsed)) {
      if (v === "editor" || v === "both" || v === "preview") out[k] = v
    }
    return out
  } catch {
    return {}
  }
}

export function saveMarkdownViewModeMap(map: Record<string, MarkdownTabViewMode>) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, JSON.stringify(map))
  } catch {
    /* ignore */
  }
}
