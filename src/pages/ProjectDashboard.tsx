import { useEffect, useRef, useState, type CSSProperties, type Dispatch, type DragEvent, type SetStateAction } from "react"
import { BookText, Folder, GripVertical, NotebookText, Pencil } from "lucide-react"
import { PROJECTS_CREATE_BLOG_EVENT, PROJECTS_CREATE_BOOK_EVENT, PROJECTS_CREATE_FOLDER_EVENT } from "../core/editorEvents"
import { collectTabIds, getProjectEntryTerms, type Project, type ProjectKind } from "../core/projects"
import "./ProjectDashboard.css"

type ProjectFolder = {
  id: string
  name: string
  description: string
}

type DropTarget =
  | {
      type: "folder"
      folderId: string
    }
  | {
      type: "project"
      projectId: string
      position: "before" | "after"
    }
  | {
      type: "root"
      position: "top" | "bottom"
    }

type FolderDropTarget = {
  folderId: string
  position: "before" | "after"
}

function createLocalId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function hexToRgba(hex: string, alpha: number) {
  const normalized = hex.replace("#", "")
  if (normalized.length !== 6) {
    return `rgba(126, 168, 255, ${alpha})`
  }

  const red = Number.parseInt(normalized.slice(0, 2), 16)
  const green = Number.parseInt(normalized.slice(2, 4), 16)
  const blue = Number.parseInt(normalized.slice(4, 6), 16)
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}

type ProjectDashboardProps = {
  projects: Project[]
  activeProjectId: string | null
  onCreateProject: (kind: ProjectKind, folderId?: string) => void
  onOpenProject: (projectId: string) => void
  setProjects: Dispatch<SetStateAction<Project[]>>
  setActiveProjectId: Dispatch<SetStateAction<string | null>>
}

export default function ProjectDashboard({
  projects,
  activeProjectId,
  onCreateProject,
  onOpenProject,
  setProjects,
  setActiveProjectId,
}: ProjectDashboardProps) {
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState("")
  const [folders, setFolders] = useState<ProjectFolder[]>([])
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null)
  const [editingFolderName, setEditingFolderName] = useState("")
  const [editingFolderDescriptionId, setEditingFolderDescriptionId] = useState<string | null>(null)
  const [editingFolderDescription, setEditingFolderDescription] = useState("")
  const [isCreateMenuOpen, setIsCreateMenuOpen] = useState(false)
  const [openFolderCreateMenuId, setOpenFolderCreateMenuId] = useState<string | null>(null)
  const [openProjectSettingsId, setOpenProjectSettingsId] = useState<string | null>(null)
  const [projectSettingsName, setProjectSettingsName] = useState("")
  const [projectSettingsColor, setProjectSettingsColor] = useState("#7ea8ff")
  const [projectSettingsKind, setProjectSettingsKind] = useState<ProjectKind>("Book")
  const [projectSettingsError, setProjectSettingsError] = useState("")
  const [pendingDeleteProjectId, setPendingDeleteProjectId] = useState<string | null>(null)
  const [deleteConfirmationText, setDeleteConfirmationText] = useState("")
  const [deleteError, setDeleteError] = useState("")
  const [draggingProjectId, setDraggingProjectId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)
  const [draggingFolderId, setDraggingFolderId] = useState<string | null>(null)
  const [folderDropTarget, setFolderDropTarget] = useState<FolderDropTarget | null>(null)
  const createMenuWrapRef = useRef<HTMLDivElement | null>(null)
  const dragPreviewElementRef = useRef<HTMLElement | null>(null)

  const closeCreateMenus = () => {
    setIsCreateMenuOpen(false)
    setOpenFolderCreateMenuId(null)
  }

  useEffect(() => {
    if (!isCreateMenuOpen && !openFolderCreateMenuId) {
      return
    }

    const handleDocumentMouseDown = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Node)) {
        return
      }

      if (createMenuWrapRef.current?.contains(target)) {
        return
      }

      if (target instanceof Element && target.closest(".project-folder__create-menu-wrap")) {
        return
      }

      closeCreateMenus()
    }

    document.addEventListener("mousedown", handleDocumentMouseDown)
    return () => {
      document.removeEventListener("mousedown", handleDocumentMouseDown)
    }
  }, [isCreateMenuOpen, openFolderCreateMenuId])

  const clearDragPreview = () => {
    if (dragPreviewElementRef.current) {
      dragPreviewElementRef.current.remove()
      dragPreviewElementRef.current = null
    }
  }

  const getPointerRatio = (value: number, min: number, size: number) => {
    if (size <= 0) {
      return 0.5
    }

    const ratio = (value - min) / size
    if (ratio < 0) {
      return 0
    }

    if (ratio > 1) {
      return 1
    }

    return ratio
  }

  const getProjectReorderPosition = (event: DragEvent<HTMLElement>, projectId: string): "before" | "after" => {
    const bounds = event.currentTarget.getBoundingClientRect()
    const xRatio = getPointerRatio(event.clientX, bounds.left, bounds.width)
    const yRatio = getPointerRatio(event.clientY, bounds.top, bounds.height)

    if (yRatio <= 0.35) {
      return "before"
    }

    if (yRatio >= 0.65) {
      return "after"
    }

    if (xRatio <= 0.45) {
      return "before"
    }

    if (xRatio >= 0.55) {
      return "after"
    }

    if (dropTarget?.type === "project" && dropTarget.projectId === projectId) {
      return dropTarget.position
    }

    return xRatio < 0.5 ? "before" : "after"
  }

  const getFolderReorderPosition = (event: DragEvent<HTMLElement>, folderId: string): "before" | "after" => {
    const bounds = event.currentTarget.getBoundingClientRect()
    const yRatio = getPointerRatio(event.clientY, bounds.top, bounds.height)

    if (yRatio <= 0.42) {
      return "before"
    }

    if (yRatio >= 0.58) {
      return "after"
    }

    if (folderDropTarget?.folderId === folderId) {
      return folderDropTarget.position
    }

    return yRatio < 0.5 ? "before" : "after"
  }

  const getResolvedFolderId = (folderId: string | null) => {
    if (!folderId) {
      return null
    }

    return folders.some((folder) => folder.id === folderId) ? folderId : null
  }

  const rootProjects = projects.filter((project) => getResolvedFolderId(project.folderId) === null)
  const topRootProjects = rootProjects.filter((project) => project.rootPosition === "top")
  const bottomRootProjects = rootProjects.filter((project) => project.rootPosition === "bottom")

  const pendingDeleteProject =
    pendingDeleteProjectId ? projects.find((project) => project.id === pendingDeleteProjectId) ?? null : null
  const settingsProject = openProjectSettingsId ? projects.find((project) => project.id === openProjectSettingsId) ?? null : null

  const requiredDeletePhrase = pendingDeleteProject ? `I wish to delete ${pendingDeleteProject.name}` : ""

  const startRename = (projectId: string, currentName: string) => {
    setEditingFolderId(null)
    setEditingFolderName("")
    setEditingFolderDescriptionId(null)
    setEditingFolderDescription("")
    setOpenProjectSettingsId(null)
    setEditingProjectId(projectId)
    setEditingName(currentName)
  }

  const cancelRename = () => {
    setEditingProjectId(null)
    setEditingName("")
  }

  const commitRename = () => {
    if (!editingProjectId) {
      return
    }

    const trimmed = editingName.trim()
    if (trimmed) {
      setProjects((current) =>
        current.map((project) =>
          project.id === editingProjectId
            ? {
                ...project,
                name: trimmed,
              }
            : project,
        ),
      )
    }

    cancelRename()
  }

  const openProjectSettings = (project: Project) => {
    setOpenProjectSettingsId(project.id)
    setProjectSettingsName(project.name)
    setProjectSettingsColor(project.color)
    setProjectSettingsKind(project.kind)
    setProjectSettingsError("")
  }

  const closeProjectSettings = () => {
    setOpenProjectSettingsId(null)
    setProjectSettingsName("")
    setProjectSettingsColor("#7ea8ff")
    setProjectSettingsKind("Book")
    setProjectSettingsError("")
  }

  const saveProjectSettings = () => {
    if (!settingsProject) {
      return
    }

    const trimmedName = projectSettingsName.trim()
    if (!trimmedName) {
      setProjectSettingsError("Project name cannot be empty.")
      return
    }

    setProjects((current) =>
      current.map((project) =>
        project.id === settingsProject.id
          ? {
              ...project,
              name: trimmedName,
              color: projectSettingsColor,
              kind: projectSettingsKind,
            }
          : project,
      ),
    )

    closeProjectSettings()
  }

  const startFolderRename = (folderId: string, currentName: string) => {
    setEditingFolderDescriptionId(null)
    setEditingFolderDescription("")
    setEditingFolderId(folderId)
    setEditingFolderName(currentName)
  }

  const cancelFolderRename = () => {
    setEditingFolderId(null)
    setEditingFolderName("")
  }

  const startFolderDescriptionRename = (folderId: string, currentDescription: string) => {
    cancelFolderRename()
    setEditingFolderDescriptionId(folderId)
    setEditingFolderDescription(currentDescription)
  }

  const cancelFolderDescriptionRename = () => {
    setEditingFolderDescriptionId(null)
    setEditingFolderDescription("")
  }

  const commitFolderDescriptionRename = () => {
    if (!editingFolderDescriptionId) {
      return
    }

    const trimmed = editingFolderDescription.trim()
    if (trimmed) {
      setFolders((current) =>
        current.map((folder) =>
          folder.id === editingFolderDescriptionId
            ? {
                ...folder,
                description: trimmed,
              }
            : folder,
        ),
      )
    }

    cancelFolderDescriptionRename()
  }

  const commitFolderRename = () => {
    if (!editingFolderId) {
      return
    }

    const trimmed = editingFolderName.trim()
    if (trimmed) {
      setFolders((current) =>
        current.map((folder) =>
          folder.id === editingFolderId
            ? {
                ...folder,
                name: trimmed,
              }
            : folder,
        ),
      )
    }

    cancelFolderRename()
  }

  const deleteProject = (projectId: string) => {
    setProjects((current) => {
      const nextProjects = current.filter((project) => project.id !== projectId)

      setActiveProjectId((currentSelectedId) => {
        if (currentSelectedId !== projectId) {
          return currentSelectedId
        }

        return nextProjects[0]?.id ?? null
      })

      return nextProjects
    })
  }

  const openDeleteConfirmation = (projectId: string) => {
    setPendingDeleteProjectId(projectId)
    setDeleteConfirmationText("")
    setDeleteError("")
  }

  const closeDeleteConfirmation = () => {
    setPendingDeleteProjectId(null)
    setDeleteConfirmationText("")
    setDeleteError("")
  }

  const confirmDelete = () => {
    if (!pendingDeleteProject) {
      return
    }

    if (deleteConfirmationText !== requiredDeletePhrase) {
      setDeleteError("The confirmation text must match exactly.")
      return
    }

    deleteProject(pendingDeleteProject.id)
    closeDeleteConfirmation()
  }

  const createFolder = () => {
    const nextIndex = folders.length + 1
    const newFolder: ProjectFolder = {
      id: createLocalId(),
      name: `Folder ${nextIndex}`,
      description: "Add a folder description here. You don’t have the memory of an elephant.",
    }

    setFolders((current) => [newFolder, ...current])
    setEditingFolderId(newFolder.id)
    setEditingFolderName(newFolder.name)
  }

  useEffect(() => {
    const handleCreateBook = () => {
      onCreateProject("Book")
    }

    const handleCreateBlog = () => {
      onCreateProject("Blog")
    }

    const handleCreateFolder = () => {
      createFolder()
    }

    window.addEventListener(PROJECTS_CREATE_BOOK_EVENT, handleCreateBook)
    window.addEventListener(PROJECTS_CREATE_BLOG_EVENT, handleCreateBlog)
    window.addEventListener(PROJECTS_CREATE_FOLDER_EVENT, handleCreateFolder)

    return () => {
      window.removeEventListener(PROJECTS_CREATE_BOOK_EVENT, handleCreateBook)
      window.removeEventListener(PROJECTS_CREATE_BLOG_EVENT, handleCreateBlog)
      window.removeEventListener(PROJECTS_CREATE_FOLDER_EVENT, handleCreateFolder)
    }
  }, [onCreateProject, folders.length])

  const moveProjectToFolder = (projectId: string, folderId: string | null, rootPosition: "top" | "bottom" = "bottom") => {
    setProjects((current) => {
      const fromIndex = current.findIndex((project) => project.id === projectId)
      if (fromIndex === -1) {
        return current
      }

      const nextProjects = [...current]
      const [draggedProject] = nextProjects.splice(fromIndex, 1)
      const movedProject = {
        ...draggedProject,
        folderId,
        rootPosition: folderId === null ? rootPosition : draggedProject.rootPosition,
      }

      if (folderId === null && rootPosition === "top") {
        nextProjects.unshift(movedProject)
      } else {
        nextProjects.push(movedProject)
      }
      return nextProjects
    })
  }

  const moveProjectRelative = (projectId: string, targetProjectId: string, position: "before" | "after") => {
    setProjects((current) => {
      const fromIndex = current.findIndex((project) => project.id === projectId)
      const targetIndex = current.findIndex((project) => project.id === targetProjectId)
      if (fromIndex === -1 || targetIndex === -1 || fromIndex === targetIndex) {
        return current
      }

      const nextProjects = [...current]
      const [draggedProject] = nextProjects.splice(fromIndex, 1)

      const adjustedTargetIndex = nextProjects.findIndex((project) => project.id === targetProjectId)
      if (adjustedTargetIndex === -1) {
        return current
      }

      const targetFolderId = getResolvedFolderId(nextProjects[adjustedTargetIndex].folderId)
      const movedProject = {
        ...draggedProject,
        folderId: targetFolderId,
        rootPosition: targetFolderId === null ? nextProjects[adjustedTargetIndex].rootPosition : draggedProject.rootPosition,
      }

      const insertIndex = position === "before" ? adjustedTargetIndex : adjustedTargetIndex + 1
      nextProjects.splice(insertIndex, 0, movedProject)
      return nextProjects
    })
  }

  const moveFolderRelative = (folderId: string, targetFolderId: string, position: "before" | "after") => {
    setFolders((current) => {
      const fromIndex = current.findIndex((folder) => folder.id === folderId)
      const targetIndex = current.findIndex((folder) => folder.id === targetFolderId)
      if (fromIndex === -1 || targetIndex === -1 || fromIndex === targetIndex) {
        return current
      }

      const nextFolders = [...current]
      const [draggedFolder] = nextFolders.splice(fromIndex, 1)
      const adjustedTargetIndex = nextFolders.findIndex((folder) => folder.id === targetFolderId)
      if (adjustedTargetIndex === -1) {
        return current
      }

      const insertIndex = position === "before" ? adjustedTargetIndex : adjustedTargetIndex + 1
      nextFolders.splice(insertIndex, 0, draggedFolder)
      return nextFolders
    })
  }

  const handleProjectDragStart = (projectId: string, event: DragEvent<HTMLButtonElement>) => {
    setDraggingFolderId(null)
    setFolderDropTarget(null)
    setDraggingProjectId(projectId)
    setDropTarget(null)

    clearDragPreview()

    const sourceCard = event.currentTarget.closest(".project-card")
    if (!sourceCard || !(sourceCard instanceof HTMLElement)) {
      return
    }

    const dragPreview = sourceCard.cloneNode(true)
    if (!(dragPreview instanceof HTMLElement)) {
      return
    }

    const bounds = sourceCard.getBoundingClientRect()
    dragPreview.classList.add("project-card--drag-preview")
    dragPreview.style.width = `${Math.round(bounds.width)}px`
    dragPreview.style.position = "fixed"
    dragPreview.style.top = "-1000px"
    dragPreview.style.left = "-1000px"
    dragPreview.style.pointerEvents = "none"
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

  const handleFolderDragStart = (folderId: string, event: DragEvent<HTMLButtonElement>) => {
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
    clearDragPreview()
  }

  const handleProjectDrop = (targetOverride?: DropTarget) => {
    if (!draggingProjectId) {
      return
    }

    const activeDropTarget = targetOverride ?? dropTarget
    if (!activeDropTarget) {
      return
    }

    if (activeDropTarget.type === "folder") {
      moveProjectToFolder(draggingProjectId, activeDropTarget.folderId)
    }

    if (activeDropTarget.type === "project") {
      moveProjectRelative(draggingProjectId, activeDropTarget.projectId, activeDropTarget.position)
    }

    if (activeDropTarget.type === "root") {
      moveProjectToFolder(draggingProjectId, null, activeDropTarget.position)
    }

    handleProjectDragEnd()
  }

  const getProjectDropClassName = (projectId: string) => {
    if (dropTarget?.type !== "project" || dropTarget.projectId !== projectId) {
      return ""
    }

    return dropTarget.position === "before" ? "project-card--drop-before" : "project-card--drop-after"
  }

  const getFolderDropClassName = (folderId: string) => {
    if (dropTarget?.type === "folder" && dropTarget.folderId === folderId) {
      return "project-folder--drop-target"
    }

    return ""
  }

  const getFolderReorderClassName = (folderId: string) => {
    if (!folderDropTarget || folderDropTarget.folderId !== folderId) {
      return ""
    }

    return folderDropTarget.position === "before" ? "project-folder--drop-before" : "project-folder--drop-after"
  }

  const getRootDropClassName = (position: "top" | "bottom") => {
    if (dropTarget?.type === "root" && dropTarget.position === position) {
      return "project-hub__root-drop--active"
    }

    return ""
  }

  const getProjectsForFolder = (folderId: string) => {
    return projects.filter((project) => getResolvedFolderId(project.folderId) === folderId)
  }

  return (
    <section className="project-hub" aria-label="Projects home">
      <div className={`project-hub__content ${pendingDeleteProject || settingsProject ? "project-hub__content--blurred" : ""}`.trim()}>
        <header className="project-hub__header">
          <div className="project-hub__title-row">
            <h1>Projects</h1>
            <div className="project-hub__create-menu-wrap" ref={createMenuWrapRef}>
              <button
                type="button"
                className="project-hub__plus-btn"
                aria-label="Create project"
                onClick={() => {
                  setOpenFolderCreateMenuId(null)
                  setIsCreateMenuOpen((open) => !open)
                }}
              >
                +
              </button>

              {isCreateMenuOpen ? (
                <div className="project-hub__create-menu" role="menu" aria-label="Create project type">
                  <button
                    type="button"
                    className="project-hub__create-option"
                    onClick={() => {
                      onCreateProject("Book")
                      closeCreateMenus()
                    }}
                  >
                    <BookText size={14} strokeWidth={2} aria-hidden="true" />
                    <span>Book</span>
                  </button>
                  <button
                    type="button"
                    className="project-hub__create-option"
                    onClick={() => {
                      onCreateProject("Blog")
                      closeCreateMenus()
                    }}
                  >
                    <NotebookText size={14} strokeWidth={2} aria-hidden="true" />
                    <span>Blog</span>
                  </button>
                  <button
                    type="button"
                    className="project-hub__create-option"
                    onClick={() => {
                      createFolder()
                      closeCreateMenus()
                    }}
                  >
                    <Folder size={14} strokeWidth={2} aria-hidden="true" />
                    <span>Folder</span>
                  </button>
                </div>
              ) : null}
            </div>
          </div>
          <p>Your herd of projects, organized in one place.</p>
        </header>

        <ul
          className="project-hub__list"
        >
          <li
            className={`project-hub__root-drop ${getRootDropClassName("top")}`.trim()}
            aria-hidden="true"
            onDragOver={(event) => {
              if (!draggingProjectId) {
                return
              }

              event.preventDefault()
              event.stopPropagation()
              if (dropTarget?.type !== "root" || dropTarget.position !== "top") {
                setDropTarget({ type: "root", position: "top" })
              }
            }}
            onDrop={(event) => {
              if (!draggingProjectId) {
                return
              }

              event.preventDefault()
              event.stopPropagation()
              handleProjectDrop({ type: "root", position: "top" })
            }}
          />

          {topRootProjects.map((project) => (
            <li
              key={project.id}
              className={`project-card ${getProjectDropClassName(project.id)} ${draggingProjectId === project.id ? "project-card--dragging" : ""}`.trim()}
              style={
                {
                  "--project-accent": project.color,
                  "--project-accent-soft": hexToRgba(project.color, 0.14),
                } as CSSProperties
              }
              onDragOver={(event) => {
                if (!draggingProjectId || draggingProjectId === project.id) {
                  return
                }

                event.preventDefault()
                event.stopPropagation()
                const position = getProjectReorderPosition(event, project.id)
                if (
                  dropTarget?.type !== "project" ||
                  dropTarget.projectId !== project.id ||
                  dropTarget.position !== position
                ) {
                  setDropTarget({ type: "project", projectId: project.id, position })
                }
              }}
              onDrop={(event) => {
                if (!draggingProjectId || draggingProjectId === project.id) {
                  return
                }

                event.preventDefault()
                event.stopPropagation()
                handleProjectDrop()
              }}
            >
              <button
                type="button"
                className="project-card__drag-handle"
                aria-label={`Drag ${project.name}`}
                draggable
                onDragStart={(event) => {
                  handleProjectDragStart(project.id, event)
                }}
                onDragEnd={() => {
                  handleProjectDragEnd()
                }}
              >
                <GripVertical size={14} strokeWidth={2} aria-hidden="true" />
              </button>

              <div className="project-card__content">
                <div className="project-card__top-row">
                  <div className="project-card__meta">
                    {project.kind === "Book" ? (
                      <BookText size={13} strokeWidth={1.9} aria-hidden="true" />
                    ) : (
                      <NotebookText size={13} strokeWidth={1.9} aria-hidden="true" />
                    )}
                    <span>{project.kind}</span>
                  </div>
                  <div className="project-card__actions">
                    <button
                      type="button"
                      className="project-card__icon-btn"
                      aria-label={`Edit ${project.name}`}
                      onClick={() => {
                        openProjectSettings(project)
                      }}
                    >
                      <Pencil size={14} strokeWidth={2} aria-hidden="true" />
                    </button>
                  </div>
                </div>
                {editingProjectId === project.id ? (
                  <div className="project-card__rename-wrap">
                    <input
                      className="project-card__rename-input"
                      value={editingName}
                      autoFocus
                      onFocus={(event) => {
                        event.target.select()
                      }}
                      onChange={(event) => {
                        setEditingName(event.target.value)
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault()
                          commitRename()
                        }

                        if (event.key === "Escape") {
                          event.preventDefault()
                          cancelRename()
                        }
                      }}
                      onBlur={() => {
                        commitRename()
                      }}
                    />
                  </div>
                ) : (
                  <h2
                    onClick={() => {
                      startRename(project.id, project.name)
                    }}
                  >
                    {project.name}
                  </h2>
                )}
                <p>
                  {(() => {
                    const count = collectTabIds(project.tabs).length
                    const { singular, plural } = getProjectEntryTerms(project.kind)
                    return `${count} ${count === 1 ? singular.toLowerCase() : plural.toLowerCase()}`
                  })()}
                </p>
                <button
                  type="button"
                  className="project-card__open"
                  onClick={() => {
                    if (editingProjectId === project.id) {
                      return
                    }
                    onOpenProject(project.id)
                  }}
                >
                  Open Project
                </button>
              </div>
            </li>
          ))}

          {folders.flatMap((folder) => [
            <li
              key={folder.id}
              className={`project-folder project-folder--inline ${getFolderDropClassName(folder.id)} ${getFolderReorderClassName(folder.id)}`.trim()}
              onDragOver={(event) => {
                if (draggingFolderId) {
                  if (draggingFolderId === folder.id) {
                    return
                  }

                  event.preventDefault()
                  event.stopPropagation()
                  const position = getFolderReorderPosition(event, folder.id)
                  if (
                    !folderDropTarget ||
                    folderDropTarget.folderId !== folder.id ||
                    folderDropTarget.position !== position
                  ) {
                    setFolderDropTarget({ folderId: folder.id, position })
                  }
                  return
                }

                if (!draggingProjectId) {
                  return
                }

                event.preventDefault()
                event.stopPropagation()
                if (dropTarget?.type !== "folder" || dropTarget.folderId !== folder.id) {
                  setDropTarget({ type: "folder", folderId: folder.id })
                }
              }}
              onDrop={(event) => {
                if (draggingFolderId) {
                  if (draggingFolderId === folder.id || !folderDropTarget || folderDropTarget.folderId !== folder.id) {
                    return
                  }

                  event.preventDefault()
                  event.stopPropagation()
                  moveFolderRelative(draggingFolderId, folder.id, folderDropTarget.position)
                  handleFolderDragEnd()
                  return
                }

                if (!draggingProjectId) {
                  return
                }

                event.preventDefault()
                event.stopPropagation()
                handleProjectDrop({ type: "folder", folderId: folder.id })
              }}
            >
              <div className="project-folder__title-row">
                <div className="project-folder__title-left">
                  <button
                    type="button"
                    className="project-folder__drag-handle"
                    aria-label={`Drag ${folder.name}`}
                    draggable
                    onDragStart={(event) => {
                      handleFolderDragStart(folder.id, event)
                    }}
                    onDragEnd={() => {
                      handleFolderDragEnd()
                    }}
                  >
                    <GripVertical size={15} strokeWidth={2} aria-hidden="true" />
                  </button>

                {editingFolderId === folder.id ? (
                  <input
                    className="project-folder__title-input"
                    value={editingFolderName}
                    autoFocus
                    onFocus={(event) => {
                      event.target.select()
                    }}
                    onChange={(event) => {
                      setEditingFolderName(event.target.value)
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault()
                        commitFolderRename()
                      }

                      if (event.key === "Escape") {
                        event.preventDefault()
                        cancelFolderRename()
                      }
                    }}
                    onBlur={() => {
                      commitFolderRename()
                    }}
                  />
                ) : (
                  <h2
                    className="project-folder__title"
                    onClick={() => {
                      startFolderRename(folder.id, folder.name)
                    }}
                  >
                    {folder.name}
                  </h2>
                )}
                </div>

                <div className="project-folder__create-menu-wrap">
                  <button
                    type="button"
                    className="project-folder__plus-btn"
                    aria-label={`Create project in ${folder.name}`}
                    aria-expanded={openFolderCreateMenuId === folder.id}
                    onClick={() => {
                      setIsCreateMenuOpen(false)
                      setOpenFolderCreateMenuId((currentId) => (currentId === folder.id ? null : folder.id))
                    }}
                  >
                    +
                  </button>

                  {openFolderCreateMenuId === folder.id ? (
                    <div className="project-hub__create-menu" role="menu" aria-label={`Create project in ${folder.name}`}>
                      <button
                        type="button"
                        className="project-hub__create-option"
                        onClick={() => {
                          onCreateProject("Book", folder.id)
                          closeCreateMenus()
                        }}
                      >
                        <BookText size={14} strokeWidth={2} aria-hidden="true" />
                        <span>Book</span>
                      </button>
                      <button
                        type="button"
                        className="project-hub__create-option"
                        onClick={() => {
                          onCreateProject("Blog", folder.id)
                          closeCreateMenus()
                        }}
                      >
                        <NotebookText size={14} strokeWidth={2} aria-hidden="true" />
                        <span>Blog</span>
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
              {editingFolderDescriptionId === folder.id ? (
                <input
                  className="project-folder__description-input"
                  value={editingFolderDescription}
                  autoFocus
                  onFocus={(event) => {
                    event.target.select()
                  }}
                  onChange={(event) => {
                    setEditingFolderDescription(event.target.value)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault()
                      commitFolderDescriptionRename()
                    }

                    if (event.key === "Escape") {
                      event.preventDefault()
                      cancelFolderDescriptionRename()
                    }
                  }}
                  onBlur={() => {
                    commitFolderDescriptionRename()
                  }}
                />
              ) : (
                <p
                  className="project-folder__description"
                  onClick={() => {
                    startFolderDescriptionRename(folder.id, folder.description)
                  }}
                >
                  {folder.description}
                </p>
              )}
            </li>,
            ...getProjectsForFolder(folder.id).map((project) => (
              <li
                key={project.id}
                className={`project-card ${getProjectDropClassName(project.id)} ${draggingProjectId === project.id ? "project-card--dragging" : ""}`.trim()}
                style={
                  {
                    "--project-accent": project.color,
                    "--project-accent-soft": hexToRgba(project.color, 0.14),
                  } as CSSProperties
                }
                onDragOver={(event) => {
                  if (!draggingProjectId || draggingProjectId === project.id) {
                    return
                  }

                  event.preventDefault()
                  event.stopPropagation()
                  const position = getProjectReorderPosition(event, project.id)
                  if (
                    dropTarget?.type !== "project" ||
                    dropTarget.projectId !== project.id ||
                    dropTarget.position !== position
                  ) {
                    setDropTarget({ type: "project", projectId: project.id, position })
                  }
                }}
                onDrop={(event) => {
                  if (!draggingProjectId || draggingProjectId === project.id) {
                    return
                  }

                  event.preventDefault()
                  event.stopPropagation()
                  handleProjectDrop()
                }}
              >
                <button
                  type="button"
                  className="project-card__drag-handle"
                  aria-label={`Drag ${project.name}`}
                  draggable
                  onDragStart={(event) => {
                    handleProjectDragStart(project.id, event)
                  }}
                  onDragEnd={() => {
                    handleProjectDragEnd()
                  }}
                >
                  <GripVertical size={14} strokeWidth={2} aria-hidden="true" />
                </button>

                <div className="project-card__content">
                  <div className="project-card__top-row">
                    <div className="project-card__meta">
                      {project.kind === "Book" ? (
                        <BookText size={13} strokeWidth={1.9} aria-hidden="true" />
                      ) : (
                        <NotebookText size={13} strokeWidth={1.9} aria-hidden="true" />
                      )}
                      <span>{project.kind}</span>
                    </div>
                    <div className="project-card__actions">
                      <button
                        type="button"
                        className="project-card__icon-btn"
                        aria-label={`Edit ${project.name}`}
                        onClick={() => {
                          openProjectSettings(project)
                        }}
                      >
                        <Pencil size={14} strokeWidth={2} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                    {editingProjectId === project.id ? (
                      <div className="project-card__rename-wrap">
                        <input
                          className="project-card__rename-input"
                          value={editingName}
                          autoFocus
                          onFocus={(event) => {
                            event.target.select()
                          }}
                          onChange={(event) => {
                            setEditingName(event.target.value)
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault()
                              commitRename()
                            }

                            if (event.key === "Escape") {
                              event.preventDefault()
                              cancelRename()
                            }
                          }}
                          onBlur={() => {
                            commitRename()
                          }}
                        />
                      </div>
                    ) : (
                      <h2
                        onClick={() => {
                          startRename(project.id, project.name)
                        }}
                      >
                        {project.name}
                      </h2>
                    )}
                  <p>
                    {(() => {
                      const count = collectTabIds(project.tabs).length
                      const { singular, plural } = getProjectEntryTerms(project.kind)
                      return `${count} ${count === 1 ? singular.toLowerCase() : plural.toLowerCase()}`
                    })()}
                  </p>
                  <button
                    type="button"
                    className="project-card__open"
                    onClick={() => {
                      if (editingProjectId === project.id) {
                        return
                      }
                      onOpenProject(project.id)
                    }}
                  >
                    Open Project
                  </button>
                </div>
              </li>
            )),
          ])}

          {/* Existing projects list acts as the launchpad into the editor workspace. */}
          {bottomRootProjects.map((project) => (
            <li
              key={project.id}
              className={`project-card ${getProjectDropClassName(project.id)} ${draggingProjectId === project.id ? "project-card--dragging" : ""}`.trim()}
              style={
                {
                  "--project-accent": project.color,
                  "--project-accent-soft": hexToRgba(project.color, 0.14),
                } as CSSProperties
              }
              onDragOver={(event) => {
                if (!draggingProjectId || draggingProjectId === project.id) {
                  return
                }

                event.preventDefault()
                event.stopPropagation()
                const position = getProjectReorderPosition(event, project.id)
                if (
                  dropTarget?.type !== "project" ||
                  dropTarget.projectId !== project.id ||
                  dropTarget.position !== position
                ) {
                  setDropTarget({ type: "project", projectId: project.id, position })
                }
              }}
              onDrop={(event) => {
                if (!draggingProjectId || draggingProjectId === project.id) {
                  return
                }

                event.preventDefault()
                event.stopPropagation()
                handleProjectDrop()
              }}
            >
              <button
                type="button"
                className="project-card__drag-handle"
                aria-label={`Drag ${project.name}`}
                draggable
                onDragStart={(event) => {
                  handleProjectDragStart(project.id, event)
                }}
                onDragEnd={() => {
                  handleProjectDragEnd()
                }}
              >
                <GripVertical size={14} strokeWidth={2} aria-hidden="true" />
              </button>

              <div className="project-card__content">
                <div className="project-card__top-row">
                  <div className="project-card__meta">
                    {project.kind === "Book" ? (
                      <BookText size={13} strokeWidth={1.9} aria-hidden="true" />
                    ) : (
                      <NotebookText size={13} strokeWidth={1.9} aria-hidden="true" />
                    )}
                    <span>{project.kind}</span>
                  </div>
                  <div className="project-card__actions">
                    <button
                      type="button"
                      className="project-card__icon-btn"
                      aria-label={`Edit ${project.name}`}
                      onClick={() => {
                        openProjectSettings(project)
                      }}
                    >
                      <Pencil size={14} strokeWidth={2} aria-hidden="true" />
                    </button>
                  </div>
                </div>
                {editingProjectId === project.id ? (
                  <div className="project-card__rename-wrap">
                    <input
                      className="project-card__rename-input"
                      value={editingName}
                      autoFocus
                      onFocus={(event) => {
                        event.target.select()
                      }}
                      onChange={(event) => {
                        setEditingName(event.target.value)
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault()
                          commitRename()
                        }

                        if (event.key === "Escape") {
                          event.preventDefault()
                          cancelRename()
                        }
                      }}
                      onBlur={() => {
                        commitRename()
                      }}
                    />
                  </div>
                ) : (
                  <h2
                    onClick={() => {
                      startRename(project.id, project.name)
                    }}
                  >
                    {project.name}
                  </h2>
                )}
                <p>
                  {(() => {
                    const count = collectTabIds(project.tabs).length
                    const { singular, plural } = getProjectEntryTerms(project.kind)
                    return `${count} ${count === 1 ? singular.toLowerCase() : plural.toLowerCase()}`
                  })()}
                </p>
                <button
                  type="button"
                  className="project-card__open"
                  onClick={() => {
                    if (editingProjectId === project.id) {
                      return
                    }
                    onOpenProject(project.id)
                  }}
                >
                  Open Project
                </button>
              </div>
            </li>
          ))}

          <li
            className={`project-hub__root-drop ${getRootDropClassName("bottom")}`.trim()}
            aria-hidden="true"
            onDragOver={(event) => {
              if (!draggingProjectId) {
                return
              }

              event.preventDefault()
              event.stopPropagation()
              if (dropTarget?.type !== "root" || dropTarget.position !== "bottom") {
                setDropTarget({ type: "root", position: "bottom" })
              }
            }}
            onDrop={(event) => {
              if (!draggingProjectId) {
                return
              }

              event.preventDefault()
              event.stopPropagation()
              handleProjectDrop({ type: "root", position: "bottom" })
            }}
          />
        </ul>

        {projects.length === 0 ? (
          <p className="project-hub__empty">No projects yet. Create one to begin writing.</p>
        ) : null}

        {activeProjectId ? null : projects.length ? (
          <p className="project-hub__empty">Select a project to continue.</p>
        ) : null}
      </div>

      {settingsProject ? (
        <div
          className="project-settings-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Edit project settings"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeProjectSettings()
            }
          }}
        >
          <div className="project-settings-modal__card">
            <h3>Edit Project</h3>

            <label className="project-settings-modal__field">
              <span>Name</span>
              <input
                type="text"
                value={projectSettingsName}
                onChange={(event) => {
                  setProjectSettingsName(event.target.value)
                  if (projectSettingsError) {
                    setProjectSettingsError("")
                  }
                }}
              />
            </label>

            <label className="project-settings-modal__field">
              <span>Type</span>
              <select
                value={projectSettingsKind}
                onChange={(event) => {
                  const nextKind = event.target.value === "Blog" ? "Blog" : "Book"
                  setProjectSettingsKind(nextKind)
                }}
              >
                <option value="Book">Book</option>
                <option value="Blog">Blog</option>
              </select>
            </label>

            <label className="project-settings-modal__field">
              <span>Color</span>
              <input
                type="color"
                value={projectSettingsColor}
                onChange={(event) => {
                  setProjectSettingsColor(event.target.value)
                }}
              />
            </label>

            {projectSettingsError ? <p className="project-settings-modal__error">{projectSettingsError}</p> : null}

            <div className="project-settings-modal__actions">
              <button type="button" className="project-settings-modal__btn" onClick={closeProjectSettings}>
                Cancel
              </button>
              <button
                type="button"
                className="project-settings-modal__btn project-settings-modal__btn--danger"
                onClick={() => {
                  closeProjectSettings()
                  openDeleteConfirmation(settingsProject.id)
                }}
              >
                Delete
              </button>
              <button
                type="button"
                className="project-settings-modal__btn project-settings-modal__btn--primary"
                onClick={saveProjectSettings}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {pendingDeleteProject ? (
        <div className="project-delete-modal" role="dialog" aria-modal="true" aria-label="Delete project confirmation">
          <div className="project-delete-modal__card">
            <h3>Delete Project</h3>
            <p>Are you sure you want to delete the project "{pendingDeleteProject.name}"?</p>
            <p>If so, exactly type out the project name:</p>
            <p className="project-delete-modal__phrase">{requiredDeletePhrase}</p>

            <input
              className="project-delete-modal__input"
              value={deleteConfirmationText}
              autoFocus
              onChange={(event) => {
                setDeleteConfirmationText(event.target.value)
                if (deleteError) {
                  setDeleteError("")
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault()
                  confirmDelete()
                }
              }}
              placeholder="Type confirmation text exactly"
            />

            {deleteError ? <p className="project-delete-modal__error">{deleteError}</p> : null}

            <div className="project-delete-modal__actions">
              <button type="button" className="project-delete-modal__cancel" onClick={closeDeleteConfirmation}>
                Cancel
              </button>
              <button type="button" className="project-delete-modal__delete" onClick={confirmDelete}>
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
