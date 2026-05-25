// Resolves and updates the per-tab Markdown editor view mode
// (editor / both / preview). Mirrors useTabViewMode.ts.

import { useEffect, useMemo, useState } from "react"
import type { Project } from "../../../../core/utils/projects"
import {
  type MarkdownTabViewMode,
  loadMarkdownViewModeMap,
  saveMarkdownViewModeMap,
} from "../utils/markdownViewModePrefs"

export function useTabMarkdownViewMode(project: Project | null) {
  const [viewModeByTabId, setViewModeByTabId] = useState<Record<string, MarkdownTabViewMode>>(
    () => loadMarkdownViewModeMap(),
  )
  useEffect(() => { saveMarkdownViewModeMap(viewModeByTabId) }, [viewModeByTabId])

  const activeMarkdownViewMode: MarkdownTabViewMode = useMemo(() => {
    const id = project?.activeId
    if (!id) return "both"
    return viewModeByTabId[id] ?? "both"
  }, [project, viewModeByTabId])

  const setMarkdownViewMode = (next: MarkdownTabViewMode) => {
    const id = project?.activeId
    if (!id) return
    setViewModeByTabId((current) => ({ ...current, [id]: next }))
  }

  return { activeMarkdownViewMode, setMarkdownViewMode }
}
