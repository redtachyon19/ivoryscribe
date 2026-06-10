// Resolves and toggles the per-tab editor view mode (drafting vs typewriter).
// Extracted from Editor.tsx.

import { useEffect, useMemo, useState } from "react"
import type { Project } from "../../../../core/utils/projects"
import { type TabViewMode, loadViewModeMap, saveViewModeMap } from "../utils/viewModePrefs"

export function useTabViewMode(project: Project | null) {
  // Per-tab view mode (drafting vs typewriter). Persisted per-device, so two
  // collaborators on the same project can each have their own preferred view.
  const [viewModeByTabId, setViewModeByTabId] = useState<Record<string, TabViewMode>>(() => loadViewModeMap())
  useEffect(() => { saveViewModeMap(viewModeByTabId) }, [viewModeByTabId])

  // Resolves the view mode for the active prose tab. Order of precedence:
  //   1) explicit user choice in `viewModeByTabId` (localStorage)
  //   2) backward-compat fallback: tabs in `project.typewriterIds` default to
  //      typewriter view when the user hasn't set anything yet
  //   3) "drafting"
  const activeViewMode: TabViewMode = useMemo(() => {
    const id = project?.activeId
    if (!id) return "drafting"
    const stored = viewModeByTabId[id]
    if (stored) return stored
    if ((project?.typewriterIds ?? []).includes(id)) return "typewriter"
    return "drafting"
  }, [project, viewModeByTabId])

  const toggleViewMode = () => {
    const id = project?.activeId
    if (!id) return
    setViewModeByTabId((current) => ({
      ...current,
      [id]: activeViewMode === "drafting" ? "typewriter" : "drafting",
    }))
  }

  // Set the active prose tab to a specific view (e.g. from the ⌘1/⌘2 shortcuts),
  // rather than just flipping it.
  const setViewMode = (mode: TabViewMode) => {
    const id = project?.activeId
    if (!id) return
    setViewModeByTabId((current) => ({ ...current, [id]: mode }))
  }

  return { activeViewMode, toggleViewMode, setViewMode }
}
