import { useCallback } from "react"
import type { Project } from "../../../core/utils/projects"
import { duplicateProject } from "../../../core/utils/libraryUtils"

type UseProjectBulkActionsOptions = {
  setProjects: React.Dispatch<React.SetStateAction<Project[]>>
  setMarqueeSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>
  projectDocumentMap: Record<string, string>
  closeContextMenu: () => void
  onOpenShareDialog: (projectId: string) => void
}

export default function useProjectBulkActions({
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

  return { deleteProjectsByIds, archiveProjectsByIds, duplicateProjectsByIds, shareProjectsByIds }
}
