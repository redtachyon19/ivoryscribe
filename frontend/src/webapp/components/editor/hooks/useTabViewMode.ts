import { useEffect, useMemo, useState } from "react"
import type { Project } from "../../../../core/utils/projects"
import { type TabViewMode, loadViewModeMap, saveViewModeMap } from "../utils/viewModePrefs"

export function useTabViewMode(project: Project | null) {
  const [viewModeByTabId, setViewModeByTabId] = useState<Record<string, TabViewMode>>(() => loadViewModeMap())
  useEffect(() => { saveViewModeMap(viewModeByTabId) }, [viewModeByTabId])

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

  const setViewMode = (mode: TabViewMode) => {
    const id = project?.activeId
    if (!id) return
    setViewModeByTabId((current) => ({ ...current, [id]: mode }))
  }

  return { activeViewMode, toggleViewMode, setViewMode }
}
