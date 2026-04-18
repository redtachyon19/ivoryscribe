import { useCallback, useEffect, useRef, useState } from "react"

type DashboardSection = "library" | "recent" | "archive" | "trash"

type NavEntry = {
  view: "projects" | "editor"
  activeId?: string | null
  dashboardSection?: DashboardSection
}

type UseNavigationHistoryOptions = {
  view: "projects" | "editor"
  activeId: string | null
  dashboardSection: DashboardSection
  onOpenProject: (projectId: string) => void
  onReturnToDashboard: () => void
  onProjectChange: (updater: <T extends { activeId: string | null }>(project: T) => T) => void
  onDashboardSectionChange: (section: DashboardSection) => void
  activeProjectId: string | null
}

function entriesMatch(a: NavEntry, b: NavEntry) {
  if (a.view !== b.view) return false
  if (a.view === "editor") return a.activeId === b.activeId
  return a.dashboardSection === b.dashboardSection
}

export function useNavigationHistory({
  view,
  activeId,
  dashboardSection,
  onOpenProject,
  onReturnToDashboard,
  onProjectChange,
  onDashboardSectionChange,
  activeProjectId,
}: UseNavigationHistoryOptions) {
  const buildCurrentEntry = useCallback((): NavEntry => {
    if (view === "editor") {
      return { view: "editor", activeId: activeId ?? null }
    }
    return { view: "projects", dashboardSection }
  }, [view, activeId, dashboardSection])

  const navHistoryRef = useRef<NavEntry[]>([buildCurrentEntry()])
  const navHistoryIndexRef = useRef(0)
  const isHistoryNavRef = useRef(false)
  const [canGoBack, setCanGoBack] = useState(false)
  const [canGoForward, setCanGoForward] = useState(false)

  useEffect(() => {
    const entry = buildCurrentEntry()

    if (isHistoryNavRef.current) {
      isHistoryNavRef.current = false
      return
    }

    const history = navHistoryRef.current
    const index = navHistoryIndexRef.current

    if (entriesMatch(history[index], entry)) return

    navHistoryRef.current = [...history.slice(0, index + 1), entry]
    navHistoryIndexRef.current = navHistoryRef.current.length - 1

    setCanGoBack(navHistoryIndexRef.current > 0)
    setCanGoForward(false)
  }, [view, activeId, dashboardSection, buildCurrentEntry])

  const restoreEntry = useCallback((entry: NavEntry) => {
    if (entry.view === "editor" && entry.activeId) {
      if (view !== "editor") {
        onOpenProject(activeProjectId ?? "")
      }
      onProjectChange((current) => ({
        ...current,
        activeId: entry.activeId!,
      }))
    } else if (entry.view === "projects") {
      if (view !== "projects") {
        onReturnToDashboard()
      }
      onDashboardSectionChange(entry.dashboardSection ?? "library")
    }
  }, [view, activeProjectId, onOpenProject, onReturnToDashboard, onProjectChange, onDashboardSectionChange])

  const goBack = useCallback(() => {
    const index = navHistoryIndexRef.current
    if (index <= 0) return

    const newIndex = index - 1
    navHistoryIndexRef.current = newIndex
    isHistoryNavRef.current = true

    setCanGoBack(newIndex > 0)
    setCanGoForward(true)

    restoreEntry(navHistoryRef.current[newIndex])
  }, [restoreEntry])

  const goForward = useCallback(() => {
    const history = navHistoryRef.current
    const index = navHistoryIndexRef.current
    if (index >= history.length - 1) return

    const newIndex = index + 1
    navHistoryIndexRef.current = newIndex
    isHistoryNavRef.current = true

    setCanGoBack(true)
    setCanGoForward(newIndex < history.length - 1)

    restoreEntry(history[newIndex])
  }, [restoreEntry])

  return { canGoBack, canGoForward, goBack, goForward }
}
