import { useRef, useState, type Dispatch, type DragEvent, type SetStateAction } from "react"
import type { Project } from "../../../core/utils/projects"
import type { ProjectFolder } from "../../pages/Library"

type DropTarget =
  | { type: "folder"; folderId: string }
  | { type: "project"; projectId: string; position: "before" | "after" }
  | { type: "root"; position: "top" | "bottom" }

type FolderDropTarget = {
  folderId: string
  /** "inside" = nest the dragged folder into this one; before/after = reorder
   *  among siblings of this folder. */
  position: "before" | "after" | "inside"
}

/** Drop zone for folders dropped onto a root area (un-nests to top-level). */
type FolderRootDropTarget = {
  position: "top" | "bottom"
}

type UseProjectDragOptions = {
  projects: Project[]
  folders: ProjectFolder[]
  setProjects: Dispatch<SetStateAction<Project[]>>
  setFolders: Dispatch<SetStateAction<ProjectFolder[]>>
}

export default function useProjectDrag({ projects, folders, setProjects, setFolders }: UseProjectDragOptions) {
  const [draggingProjectId, setDraggingProjectId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)
  const [draggingFolderId, setDraggingFolderId] = useState<string | null>(null)
  const [folderDropTarget, setFolderDropTarget] = useState<FolderDropTarget | null>(null)
  const [folderRootDropTarget, setFolderRootDropTarget] = useState<FolderRootDropTarget | null>(null)
  const dragPreviewElementRef = useRef<HTMLElement | null>(null)

  const getResolvedFolderId = (folderId: string | null) => {
    if (!folderId) return null
    return folders.some((folder) => folder.id === folderId) ? folderId : null
  }

  const clearDragPreview = () => {
    if (dragPreviewElementRef.current) {
      dragPreviewElementRef.current.remove()
      dragPreviewElementRef.current = null
    }
  }

  const copyThemeVars = (source: HTMLElement, target: HTMLElement) => {
    const themed = source.closest(".app") as HTMLElement | null
    if (!themed) return
    const cs = getComputedStyle(themed)
    const vars = [
      "--app-bg", "--brand-color", "--menu-bg", "--menu-border", "--menu-button",
      "--menu-button-hover-bg", "--menu-dropdown-bg", "--menu-dropdown-border",
      "--app-accent", "--app-accent-primary", "--app-accent-secondary",
      "--app-accent-complementary", "--app-accent-gold",
      "--app-ui-font", "--app-display-font",
    ]
    for (const v of vars) {
      const val = cs.getPropertyValue(v)
      if (val) target.style.setProperty(v, val)
    }
  }

  const getProjectReorderPosition = (_event: DragEvent<HTMLElement>, projectId: string): "before" | "after" => {
    if (!draggingProjectId) {
      if (dropTarget?.type === "project" && dropTarget.projectId === projectId) return dropTarget.position
      return "before"
    }

    const fromIndex = projects.findIndex((project) => project.id === draggingProjectId)
    const targetIndex = projects.findIndex((project) => project.id === projectId)
    if (fromIndex === -1 || targetIndex === -1) {
      if (dropTarget?.type === "project" && dropTarget.projectId === projectId) return dropTarget.position
      return "before"
    }

    return fromIndex < targetIndex ? "after" : "before"
  }

  /** Resolve the drop intent for a folder being dragged over `folderId`:
   *    • leading 35% (left in a grid row / top in a list) → "before"
   *    • trailing 35% (right / bottom) → "after"
   *    • middle 30% → "inside" (nest)
   *  The reorder axis follows the actual layout: horizontal when an adjacent
   *  folder card shares this row (grid view), vertical otherwise (list view).
   *  That makes "drop between" a natural, wide left/right target in the grid
   *  instead of a hard-to-hit top/bottom sliver — which is what made reordering
   *  feel fiddly. Falls back to an ordering heuristic if bounds can't be read. */
  const getFolderReorderPosition = (event: DragEvent<HTMLElement>, folderId: string): "before" | "after" | "inside" => {
    const targetElement = event.currentTarget as HTMLElement | null
    if (targetElement && typeof event.clientX === "number" && typeof event.clientY === "number") {
      const rect = targetElement.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) {
        // A sibling card on the same visual row ⇒ horizontal layout (grid) →
        // reorder along X. Otherwise the cards are stacked (list) → along Y.
        const sharesRow = (sib: Element | null) => {
          if (!sib) return false
          const sr = sib.getBoundingClientRect()
          return Math.abs(sr.top - rect.top) < rect.height * 0.5
        }
        const horizontal = sharesRow(targetElement.previousElementSibling) || sharesRow(targetElement.nextElementSibling)
        const ratio = horizontal
          ? (event.clientX - rect.left) / rect.width
          : (event.clientY - rect.top) / rect.height
        if (ratio < 0.35) return "before"
        if (ratio > 0.65) return "after"
        return "inside"
      }
    }

    if (!draggingFolderId) {
      if (folderDropTarget?.folderId === folderId) return folderDropTarget.position
      return "before"
    }

    const fromIndex = folders.findIndex((folder) => folder.id === draggingFolderId)
    const targetIndex = folders.findIndex((folder) => folder.id === folderId)
    if (fromIndex === -1 || targetIndex === -1) {
      if (folderDropTarget?.folderId === folderId) return folderDropTarget.position
      return "before"
    }

    return fromIndex < targetIndex ? "after" : "before"
  }

  // --- Move logic ---

  const moveProjectToFolder = (projectId: string, folderId: string | null, rootPosition: "top" | "bottom" = "bottom") => {
    setProjects((current) => {
      const fromIndex = current.findIndex((project) => project.id === projectId)
      if (fromIndex === -1) return current
      const nextProjects = [...current]
      const [draggedProject] = nextProjects.splice(fromIndex, 1)
      const movedProject = { ...draggedProject, folderId, rootPosition: folderId === null ? rootPosition : draggedProject.rootPosition }
      if (folderId === null && rootPosition === "top") nextProjects.unshift(movedProject)
      else nextProjects.push(movedProject)
      return nextProjects
    })
  }

  const moveProjectRelative = (projectId: string, targetProjectId: string, position: "before" | "after") => {
    setProjects((current) => {
      const fromIndex = current.findIndex((project) => project.id === projectId)
      const targetIndex = current.findIndex((project) => project.id === targetProjectId)
      if (fromIndex === -1 || targetIndex === -1 || fromIndex === targetIndex) return current
      const nextProjects = [...current]
      const [draggedProject] = nextProjects.splice(fromIndex, 1)
      const adjustedTargetIndex = nextProjects.findIndex((project) => project.id === targetProjectId)
      if (adjustedTargetIndex === -1) return current
      const targetFolderId = getResolvedFolderId(nextProjects[adjustedTargetIndex].folderId)
      const movedProject = { ...draggedProject, folderId: targetFolderId, rootPosition: targetFolderId === null ? nextProjects[adjustedTargetIndex].rootPosition : draggedProject.rootPosition }
      const insertIndex = position === "before" ? adjustedTargetIndex : adjustedTargetIndex + 1
      nextProjects.splice(insertIndex, 0, movedProject)
      return nextProjects
    })
  }

  const moveFolderRelative = (folderId: string, targetFolderId: string, position: "before" | "after") => {
    setFolders((current) => {
      const fromIndex = current.findIndex((folder) => folder.id === folderId)
      const targetIndex = current.findIndex((folder) => folder.id === targetFolderId)
      if (fromIndex === -1 || targetIndex === -1 || fromIndex === targetIndex) return current
      // Reorder also adopts the target's parent so dropping among siblings
      // moves you into their tier even if you started elsewhere.
      const targetParentId = current[targetIndex].parentFolderId ?? null
      const nextFolders = [...current]
      const [draggedFolder] = nextFolders.splice(fromIndex, 1)
      const adopted = { ...draggedFolder, parentFolderId: targetParentId }
      const adjustedTargetIndex = nextFolders.findIndex((folder) => folder.id === targetFolderId)
      if (adjustedTargetIndex === -1) return current
      const insertIndex = position === "before" ? adjustedTargetIndex : adjustedTargetIndex + 1
      nextFolders.splice(insertIndex, 0, adopted)
      return nextFolders
    })
  }

  /** True iff `candidateAncestorId` appears anywhere up `descendantId`'s
   *  parent chain (inclusive). Used to refuse cycle-creating folder drops. */
  const isFolderDescendantOf = (descendantId: string, candidateAncestorId: string): boolean => {
    if (descendantId === candidateAncestorId) return true
    let cursor: string | null | undefined = descendantId
    const seen = new Set<string>()
    while (cursor) {
      if (seen.has(cursor)) return false // pathological — shouldn't happen
      seen.add(cursor)
      if (cursor === candidateAncestorId) return true
      const folder = folders.find((f) => f.id === cursor)
      cursor = folder?.parentFolderId ?? null
    }
    return false
  }

  /** Move a folder so its new parent is `nextParentId` (null = top-level).
   *  Refuses self-nesting and cycle-creating moves. */
  const moveFolderIntoFolder = (folderId: string, nextParentId: string | null) => {
    if (folderId === nextParentId) return
    if (nextParentId !== null && isFolderDescendantOf(nextParentId, folderId)) {
      // Would create a cycle (target is inside the folder being moved).
      return
    }
    setFolders((current) => {
      const idx = current.findIndex((f) => f.id === folderId)
      if (idx === -1) return current
      const currentParent = current[idx].parentFolderId ?? null
      if (currentParent === nextParentId) return current
      return current.map((f) => (f.id === folderId ? { ...f, parentFolderId: nextParentId } : f))
    })
  }

  // --- Drag start / end handlers ---

  const handleProjectDragStart = (projectId: string, event: DragEvent<HTMLElement>) => {
    setDraggingFolderId(null)
    setFolderDropTarget(null)
    setDraggingProjectId(projectId)
    setDropTarget(null)
    clearDragPreview()

    const sourceCard = event.currentTarget.closest(".project-card") as HTMLElement | null
    const sourceElement = sourceCard ?? event.currentTarget

    const dragPreview = sourceElement.cloneNode(true)
    if (!(dragPreview instanceof HTMLElement)) return

    const bounds = sourceElement.getBoundingClientRect()
    if (sourceCard) {
      dragPreview.classList.add("project-card--drag-preview")
    }
    dragPreview.style.width = `${Math.round(bounds.width)}px`
    dragPreview.style.height = `${Math.round(bounds.height)}px`
    dragPreview.style.minHeight = `${Math.round(bounds.height)}px`
    dragPreview.style.maxHeight = `${Math.round(bounds.height)}px`
    dragPreview.style.boxSizing = "border-box"
    dragPreview.style.position = "fixed"
    dragPreview.style.top = "-1000px"
    dragPreview.style.left = "-1000px"
    dragPreview.style.pointerEvents = "none"
    copyThemeVars(sourceElement, dragPreview)
    document.body.appendChild(dragPreview)
    dragPreviewElementRef.current = dragPreview

    const offsetX = event.clientX - bounds.left
    const offsetY = event.clientY - bounds.top
    event.dataTransfer.effectAllowed = "move"
    event.dataTransfer.setData("text/plain", projectId)
    event.dataTransfer.setDragImage(dragPreview, offsetX, offsetY)
  }

  const handleProjectDragEnd = () => {
    setDraggingProjectId(null)
    setDropTarget(null)
    clearDragPreview()
  }

  const handleFolderDragStart = (folderId: string, event: DragEvent<HTMLElement>) => {
    setDraggingProjectId(null)
    setDropTarget(null)
    setDraggingFolderId(folderId)
    setFolderDropTarget(null)
    clearDragPreview()

    const sourceFolder = event.currentTarget.closest(".project-folder--inline")
    if (sourceFolder && sourceFolder instanceof HTMLElement) {
      const dragPreview = sourceFolder.cloneNode(true)
      if (dragPreview instanceof HTMLElement) {
        const bounds = sourceFolder.getBoundingClientRect()
        dragPreview.classList.add("project-folder--drag-preview")
        dragPreview.style.width = `${Math.round(bounds.width)}px`
        dragPreview.style.position = "fixed"
        dragPreview.style.top = "-1000px"
        dragPreview.style.left = "-1000px"
        dragPreview.style.pointerEvents = "none"
        copyThemeVars(sourceFolder, dragPreview)
        document.body.appendChild(dragPreview)
        dragPreviewElementRef.current = dragPreview

        const offsetX = event.clientX - bounds.left
        const offsetY = event.clientY - bounds.top
        event.dataTransfer.setDragImage(dragPreview, offsetX, offsetY)
      }
    }

    event.dataTransfer.effectAllowed = "move"
    event.dataTransfer.setData("text/plain", folderId)
  }

  const handleFolderDragEnd = () => {
    setDraggingFolderId(null)
    setFolderDropTarget(null)
    setFolderRootDropTarget(null)
    clearDragPreview()
  }

  // --- Drop handling ---

  const handleProjectDrop = (targetOverride?: DropTarget) => {
    if (!draggingProjectId) return
    const activeDropTarget = targetOverride ?? dropTarget
    if (!activeDropTarget) return
    if (activeDropTarget.type === "folder") moveProjectToFolder(draggingProjectId, activeDropTarget.folderId)
    if (activeDropTarget.type === "project") moveProjectRelative(draggingProjectId, activeDropTarget.projectId, activeDropTarget.position)
    if (activeDropTarget.type === "root") moveProjectToFolder(draggingProjectId, null, activeDropTarget.position)
    handleProjectDragEnd()
  }

  // --- Class name helpers ---

  const getProjectDropClassName = (projectId: string) => {
    if (dropTarget?.type !== "project" || dropTarget.projectId !== projectId) return ""
    return dropTarget.position === "before" ? "project-card--drop-before" : "project-card--drop-after"
  }

  const getFolderDropClassName = (folderId: string) => {
    if (dropTarget?.type === "folder" && dropTarget.folderId === folderId) return "project-folder--drop-target"
    return ""
  }

  const getFolderReorderClassName = (folderId: string) => {
    if (!folderDropTarget || folderDropTarget.folderId !== folderId) return ""
    if (folderDropTarget.position === "before") return "project-folder--drop-before"
    if (folderDropTarget.position === "after") return "project-folder--drop-after"
    return "project-folder--drop-inside"
  }

  const getRootDropClassName = (position: "top" | "bottom") => {
    if (dropTarget?.type === "root" && dropTarget.position === position) return "project-hub__root-drop--active"
    if (folderRootDropTarget && folderRootDropTarget.position === position) return "project-hub__root-drop--active"
    return ""
  }

  // --- Event helpers for child components ---

  const updateProjectDropTarget = (project: Project) => (event: DragEvent<HTMLElement>) => {
    if (!draggingProjectId || draggingProjectId === project.id) return
    event.preventDefault()
    event.stopPropagation()
    const position = getProjectReorderPosition(event, project.id)
    if (dropTarget?.type !== "project" || dropTarget.projectId !== project.id || dropTarget.position !== position) {
      setDropTarget({ type: "project", projectId: project.id, position })
    }
  }

  const handleCardDrop = (project: Project) => (event: DragEvent<HTMLElement>) => {
    if (!draggingProjectId || draggingProjectId === project.id) return
    event.preventDefault()
    event.stopPropagation()
    handleProjectDrop()
  }

  const handleFolderItemDragOver = (folder: ProjectFolder) => (event: DragEvent<HTMLElement>) => {
    if (draggingFolderId) {
      if (draggingFolderId === folder.id) return
      // Refuse drops onto descendants of the dragged folder (would cycle).
      if (isFolderDescendantOf(folder.id, draggingFolderId)) return
      event.preventDefault()
      event.stopPropagation()
      const position = getFolderReorderPosition(event, folder.id)
      if (!folderDropTarget || folderDropTarget.folderId !== folder.id || folderDropTarget.position !== position) {
        setFolderDropTarget({ folderId: folder.id, position })
      }
      return
    }
    if (!draggingProjectId) return
    event.preventDefault()
    event.stopPropagation()
    if (dropTarget?.type !== "folder" || dropTarget.folderId !== folder.id) {
      setDropTarget({ type: "folder", folderId: folder.id })
    }
  }

  const handleFolderItemDrop = (folder: ProjectFolder) => (event: DragEvent<HTMLElement>) => {
    if (draggingFolderId) {
      if (draggingFolderId === folder.id) return
      if (isFolderDescendantOf(folder.id, draggingFolderId)) return
      event.preventDefault()
      event.stopPropagation()
      const position = folderDropTarget?.folderId === folder.id ? folderDropTarget.position : "inside"
      if (position === "inside") {
        moveFolderIntoFolder(draggingFolderId, folder.id)
      } else {
        moveFolderRelative(draggingFolderId, folder.id, position)
      }
      handleFolderDragEnd()
      return
    }
    if (!draggingProjectId) return
    event.preventDefault()
    event.stopPropagation()
    handleProjectDrop({ type: "folder", folderId: folder.id })
  }

  // --- Derived data ---

  const getProjectsForFolder = (folderId: string) => {
    return projects.filter((project) => getResolvedFolderId(project.folderId) === folderId)
  }

  const rootProjects = projects.filter((project) => getResolvedFolderId(project.folderId) === null)
  const topRootProjects = rootProjects.filter((project) => project.rootPosition === "top")
  const bottomRootProjects = rootProjects.filter((project) => project.rootPosition === "bottom")

  const handleRootDragOver = (position: "top" | "bottom") => (event: DragEvent<HTMLElement>) => {
    if (draggingFolderId) {
      // Drop folder onto a root zone → un-nest to top-level.
      event.preventDefault()
      event.stopPropagation()
      if (!folderRootDropTarget || folderRootDropTarget.position !== position) {
        setFolderRootDropTarget({ position })
      }
      return
    }
    if (!draggingProjectId) return
    event.preventDefault()
    event.stopPropagation()
    if (dropTarget?.type !== "root" || dropTarget.position !== position) setDropTarget({ type: "root", position })
  }

  const handleRootDrop = (position: "top" | "bottom") => (event: DragEvent<HTMLElement>) => {
    if (draggingFolderId) {
      event.preventDefault()
      event.stopPropagation()
      moveFolderIntoFolder(draggingFolderId, null)
      handleFolderDragEnd()
      return
    }
    if (!draggingProjectId) return
    event.preventDefault()
    event.stopPropagation()
    handleProjectDrop({ type: "root", position })
  }

  return {
    draggingProjectId,
    draggingFolderId,
    topRootProjects,
    bottomRootProjects,
    getProjectsForFolder,
    getProjectDropClassName,
    getFolderDropClassName,
    getFolderReorderClassName,
    getRootDropClassName,
    handleProjectDragStart,
    handleProjectDragEnd,
    handleFolderDragStart,
    handleFolderDragEnd,
    updateProjectDropTarget,
    // Clear EVERY drop highlight this hook owns (project reorder, folder, and
    // both folder-root zones). Called when the drag is over dead space, over a
    // target outside this hook (the back button), or has left the view — so the
    // accent only ever marks the one live destination under the cursor.
    clearDropTarget: () => {
      setDropTarget(null)
      setFolderDropTarget(null)
      setFolderRootDropTarget(null)
    },
    handleCardDrop,
    handleFolderItemDragOver,
    handleFolderItemDrop,
    handleRootDragOver,
    handleRootDrop,
    moveFolderIntoFolder,
    isFolderDescendantOf,
  }
}
