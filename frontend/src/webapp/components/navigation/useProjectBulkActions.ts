import { useCallback, useEffect } from "react"
import type { Project } from "../../../core/utils/projects"
import { duplicateProject } from "../../../core/utils/libraryUtils"

type UseProjectBulkActionsOptions = {
  selectedProjectIds: string[]
  setProjects: React.Dispatch<React.SetStateAction<Project[]>>
  setMarqueeSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>
  projectDocumentMap: Record<string, string>
  closeContextMenu: () => void
  onOpenShareDialog: (projectId: string) => void
}

/**
 * Encapsulates the four bulk project operations (delete, archive, duplicate, share)
 * and the keyboard delete handler that are used in ProjectBrowserPanel.
 */
export default function useProjectBulkActions({
  selectedProjectIds,
  setProjects,
  setMarqueeSelectedIds,
  projectDocumentMap,
  closeContextMenu,
  onOpenShareDialog,
}: UseProjectBulkActionsOptions) {
  const clearSelection = useCallback(() => setMarqueeSelectedIds(new Set()), [setMarqueeSelectedIds])

  const deleteProjectsByIds = useCallback((ids: string[]) => {
    if (ids.length === 0) return
    const now = new Date().toISOString()
    const idSet = new Set(ids)
    setProjects((cur) => cur.map((p) => idSet.has(p.id) ? { ...p, deletedAt: now } : p))
    clearSelection()
    closeContextMenu()
  }, [clearSelection, closeContextMenu, setProjects])

  const archiveProjectsByIds = useCallback((ids: string[]) => {
    if (ids.length === 0) return
    const now = new Date().toISOString()
    const idSet = new Set(ids)
    setProjects((cur) => cur.map((p) => idSet.has(p.id) ? { ...p, archivedAt: now, deletedAt: null } : p))
    clearSelection()
    closeContextMenu()
  }, [clearSelection, closeContextMenu, setProjects])

  const duplicateProjectsByIds = useCallback((ids: string[]) => {
    if (ids.length === 0) return
    setProjects((current) => ids.reduce((acc, id) => duplicateProject(acc, id), current))
    clearSelection()
    closeContextMenu()
  }, [clearSelection, closeContextMenu, setProjects])

  const shareProjectsByIds = useCallback((ids: string[]) => {
    if (ids.length === 0) return
    const shareableProjectId = ids.find((id) => Boolean(projectDocumentMap[id]))
    if (!shareableProjectId) return
    clearSelection()
    closeContextMenu()
    onOpenShareDialog(shareableProjectId)
  }, [clearSelection, closeContextMenu, onOpenShareDialog, projectDocumentMap])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (selectedProjectIds.length === 0) return
      if ((event.target as HTMLElement).closest("input, textarea, select")) return
      if (event.key === "Backspace" || event.key === "Delete") {
        event.preventDefault()
        deleteProjectsByIds(selectedProjectIds)
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [deleteProjectsByIds, selectedProjectIds])

  return { deleteProjectsByIds, archiveProjectsByIds, duplicateProjectsByIds, shareProjectsByIds }
}
