import { useEffect, useRef, useState, type CSSProperties, type Dispatch, type DragEvent, type MouseEvent as ReactMouseEvent, type SetStateAction } from "react"
import { BookCopy, BookText, Folder, GripVertical, NotebookText, Plus, ScrollText, Settings2, Trash2, X } from "lucide-react"
import { PROJECTS_CREATE_BLOG_EVENT, PROJECTS_CREATE_BOOK_EVENT, PROJECTS_CREATE_FOLDER_EVENT } from "../../core/editorEvents"
import { downloadProjectAsMarkdown } from "../../core/markdown"
import { exportProjectAsPdf } from "../../core/pdfExport"
import { collectTabIds, getProjectEntryTerms, type Project, type ProjectKind } from "../../core/projects"
import ProjectPreferencesFields from "../components/ProjectPreferencesFields"
import "./ProjectLibrary.css"

export type ProjectFolder = {
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

function formatProjectDate(dateValue: string) {
  const parsed = new Date(dateValue)
  if (Number.isNaN(parsed.getTime())) {
    return "--.--.----"
  }

  const month = String(parsed.getMonth() + 1).padStart(2, "0")
  const day = String(parsed.getDate()).padStart(2, "0")
  const year = parsed.getFullYear()
  return `${month}.${day}.${year}`
}

function splitGraphemes(value: string) {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" })
    return Array.from(segmenter.segment(value), (segment) => segment.segment)
  }

  return Array.from(value)
}

function extractEmojiTokens(value: string, maxCount = 3) {
  const emojiPattern = /\p{Extended_Pictographic}/u
  const tokens: string[] = []

  for (const grapheme of splitGraphemes(value)) {
    if (!emojiPattern.test(grapheme)) {
      continue
    }

    tokens.push(grapheme)
    if (tokens.length >= maxCount) {
      break
    }
  }

  return tokens
}

function normalizeProjectEmojiWallpaper(value: string) {
  return extractEmojiTokens(value, 3).join(" ")
}

function normalizeProjectColor(value: string | null | undefined) {
  const normalized = (value ?? "").trim().toUpperCase()
  if (/^#[0-9A-F]{6}$/.test(normalized)) {
    return normalized
  }

  return "#7EA8FF"
}

function buildDuplicateProjectName(baseName: string, existingNames: string[]) {
  const taken = new Set(existingNames.map((name) => name.trim().toLowerCase()))
  let suffix = 1

  while (true) {
    const candidate = suffix === 1 ? `${baseName} Copy` : `${baseName} Copy ${suffix}`
    if (!taken.has(candidate.trim().toLowerCase())) {
      return candidate
    }

    suffix += 1
  }
}

function buildProjectEmojiWallpaperRows(value: string) {
  const emojis = extractEmojiTokens(value, 3)
  if (!emojis.length) {
    return [] as string[]
  }

  const rowCount = 22
  const symbolsPerRow = 30
  const seedSource = emojis.join("|")
  let seed = 0

  for (let i = 0; i < seedSource.length; i += 1) {
    seed = (seed * 31 + seedSource.charCodeAt(i)) >>> 0
  }

  // Deterministic PRNG so the pattern remains stable for a given emoji set.
  const nextRandom = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 4294967296
  }

  return Array.from({ length: rowCount }, () => {
    let previousIndex = -1

    return Array.from({ length: symbolsPerRow }, () => {
      let index = Math.floor(nextRandom() * emojis.length)

      // Prevent long runs of the same emoji when multiple choices exist.
      if (emojis.length > 1 && index === previousIndex) {
        index = (index + 1 + Math.floor(nextRandom() * (emojis.length - 1))) % emojis.length
      }

      previousIndex = index
      return emojis[index]
    }).join(" ")
  })
}

type ProjectLibraryProps = {
  projects: Project[]
  folders: ProjectFolder[]
  activeProjectId: string | null
  onCreateProject: (kind: ProjectKind, folderId?: string) => void
  onOpenProject: (projectId: string) => void
  setProjects: Dispatch<SetStateAction<Project[]>>
  setFolders: Dispatch<SetStateAction<ProjectFolder[]>>
  setActiveProjectId: Dispatch<SetStateAction<string | null>>
}

export default function ProjectLibrary({
  projects,
  folders,
  activeProjectId,
  onCreateProject,
  onOpenProject,
  setProjects,
  setFolders,
  setActiveProjectId,
}: ProjectLibraryProps) {
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState("")
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null)
  const [editingFolderName, setEditingFolderName] = useState("")
  const [editingFolderDescriptionId, setEditingFolderDescriptionId] = useState<string | null>(null)
  const [editingFolderDescription, setEditingFolderDescription] = useState("")
  const [isCreateMenuOpen, setIsCreateMenuOpen] = useState(false)
  const [openFolderCreateMenuId, setOpenFolderCreateMenuId] = useState<string | null>(null)
  const [openProjectSettingsId, setOpenProjectSettingsId] = useState<string | null>(null)
  const [isProjectSettingsRendered, setIsProjectSettingsRendered] = useState(false)
  const [isProjectSettingsClosing, setIsProjectSettingsClosing] = useState(false)
  const [projectSettingsName, setProjectSettingsName] = useState("")
  const [projectSettingsColor, setProjectSettingsColor] = useState("#7ea8ff")
  const [projectSettingsKind, setProjectSettingsKind] = useState<ProjectKind>("Book")
  const [projectSettingsMarkdownEditorEnabled, setProjectSettingsMarkdownEditorEnabled] = useState(false)
  const [projectSettingsWallpaperEmojis, setProjectSettingsWallpaperEmojis] = useState("")
  const [projectSettingsError, setProjectSettingsError] = useState("")
  const [pendingDeleteProjectId, setPendingDeleteProjectId] = useState<string | null>(null)
  const [isDeleteModalRendered, setIsDeleteModalRendered] = useState(false)
  const [isDeleteModalClosing, setIsDeleteModalClosing] = useState(false)
  const [deleteModalProjectName, setDeleteModalProjectName] = useState("")
  const [deleteConfirmationText, setDeleteConfirmationText] = useState("")
  const [deleteError, setDeleteError] = useState("")
  const [draggingProjectId, setDraggingProjectId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)
  const [draggingFolderId, setDraggingFolderId] = useState<string | null>(null)
  const [folderDropTarget, setFolderDropTarget] = useState<FolderDropTarget | null>(null)
  const createMenuWrapRef = useRef<HTMLDivElement | null>(null)
  const dragPreviewElementRef = useRef<HTMLElement | null>(null)
  const renameTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  const deleteConfirmationInputRef = useRef<HTMLInputElement | null>(null)
  const titleScrollFrameRef = useRef<number | null>(null)
  const titleScrollDirectionRef = useRef<1 | -1>(1)

  const closeCreateMenus = () => {
    setIsCreateMenuOpen(false)
    setOpenFolderCreateMenuId(null)
  }

  const stopTitleAutoScroll = (resetElement?: HTMLHeadingElement) => {
    if (titleScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(titleScrollFrameRef.current)
      titleScrollFrameRef.current = null
    }

    titleScrollDirectionRef.current = 1

    if (resetElement) {
      resetElement.scrollTop = 0
    }
  }

  const startTitleAutoScroll = (element: HTMLHeadingElement) => {
    stopTitleAutoScroll()

    const maxScroll = element.scrollHeight - element.clientHeight
    if (maxScroll <= 0) {
      return
    }

    let previousTime = performance.now()
    const speed = 18
    let currentTop = element.scrollTop

    const step = (time: number) => {
      const elapsedSeconds = (time - previousTime) / 1000
      previousTime = time

      const maxTop = element.scrollHeight - element.clientHeight
      if (maxTop <= 0) {
        stopTitleAutoScroll(element)
        return
      }

      const nextTop = Math.min(maxTop, currentTop + speed * elapsedSeconds)

      currentTop = nextTop
      element.scrollTop = currentTop

      if (currentTop >= maxTop) {
        titleScrollFrameRef.current = null
        return
      }

      titleScrollFrameRef.current = window.requestAnimationFrame(step)
    }

    titleScrollFrameRef.current = window.requestAnimationFrame(step)
  }

  useEffect(() => {
    return () => {
      stopTitleAutoScroll()
    }
  }, [])

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
  const isProjectSettingsOpen = Boolean(settingsProject)
  const isDeleteModalOpen = Boolean(pendingDeleteProject)
  const deleteProjectName = pendingDeleteProject?.name ?? deleteModalProjectName

  const requiredDeletePhrase = deleteProjectName ? `I wish to delete ${deleteProjectName}` : ""
  const requiredDeleteCharacters = splitGraphemes(requiredDeletePhrase)
  const enteredDeleteCharacters = splitGraphemes(deleteConfirmationText)

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

  const resizeRenameTextarea = (element: HTMLTextAreaElement) => {
    element.style.height = "0px"
    const computed = window.getComputedStyle(element)
    const lineHeight = Number.parseFloat(computed.lineHeight) || 20
    const verticalPadding = Number.parseFloat(computed.paddingTop) + Number.parseFloat(computed.paddingBottom)
    const maxHeight = lineHeight * 3 + verticalPadding
    const nextHeight = Math.min(element.scrollHeight, maxHeight)
    element.style.height = `${nextHeight}px`
    element.style.overflowY = element.scrollHeight > maxHeight ? "auto" : "hidden"
  }

  useEffect(() => {
    if (!editingProjectId || !renameTextareaRef.current) {
      return
    }

    resizeRenameTextarea(renameTextareaRef.current)
  }, [editingProjectId, editingName])

  const renderProjectRenameEditor = () => {
    return (
      <div className="project-card__rename-wrap">
        <textarea
          className="project-card__rename-input"
          value={editingName}
          autoFocus
          rows={1}
          ref={(element) => {
            renameTextareaRef.current = element
            if (element) {
              resizeRenameTextarea(element)
            }
          }}
          onFocus={(event) => {
            event.target.select()
            resizeRenameTextarea(event.target)
          }}
          onChange={(event) => {
            setEditingName(event.target.value)
            resizeRenameTextarea(event.target)
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
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
    )
  }

  const openProjectSettings = (project: Project) => {
    setOpenProjectSettingsId(project.id)
    setProjectSettingsName(project.name)
    setProjectSettingsColor(normalizeProjectColor(project.color))
    setProjectSettingsKind(project.kind)
    setProjectSettingsMarkdownEditorEnabled(Boolean(project.markdownEditorEnabled))
    setProjectSettingsWallpaperEmojis(project.wallpaperEmojis ?? "")
    setProjectSettingsError("")
  }

  const closeProjectSettings = () => {
    setOpenProjectSettingsId(null)
    setProjectSettingsError("")
  }

  useEffect(() => {
    if (!settingsProject) {
      return
    }

    const trimmedName = projectSettingsName.trim()
    if (!trimmedName) {
      setProjectSettingsError("Project name cannot be empty.")
      return
    }

    setProjectSettingsError((current) => (current ? "" : current))

    const normalizedWallpaper = normalizeProjectEmojiWallpaper(projectSettingsWallpaperEmojis)

    setProjects((current) => {
      let hasChanges = false
      const normalizedColor = normalizeProjectColor(projectSettingsColor)

      const nextProjects = current.map((project) => {
        if (project.id !== settingsProject.id) {
          return project
        }

        if (
          project.name === trimmedName &&
          project.color === normalizedColor &&
          project.kind === projectSettingsKind &&
          Boolean(project.markdownEditorEnabled) === projectSettingsMarkdownEditorEnabled &&
          (project.wallpaperEmojis ?? "") === normalizedWallpaper
        ) {
          return project
        }

        hasChanges = true
        return {
          ...project,
          name: trimmedName,
          color: normalizedColor,
          kind: projectSettingsKind,
          markdownEditorEnabled: projectSettingsMarkdownEditorEnabled,
          wallpaperEmojis: normalizedWallpaper,
        }
      })

      return hasChanges ? nextProjects : current
    })
  }, [
    projectSettingsColor,
    projectSettingsKind,
    projectSettingsMarkdownEditorEnabled,
    projectSettingsName,
    projectSettingsWallpaperEmojis,
    setProjects,
    settingsProject,
  ])

  const duplicateProjectFromSettings = () => {
    if (!settingsProject) {
      return
    }

    setProjects((current) => {
      const sourceIndex = current.findIndex((project) => project.id === settingsProject.id)
      if (sourceIndex === -1) {
        return current
      }

      const source = current[sourceIndex]
      const tabIdMap = new Map<string, string>()

      const cloneTabsWithNewIds = (tabs: Project["tabs"]): Project["tabs"] => {
        return tabs.map((tab) => {
          const nextId = createLocalId()
          tabIdMap.set(tab.id, nextId)

          return {
            ...tab,
            id: nextId,
            children: cloneTabsWithNewIds(tab.children),
          }
        })
      }

      const nextTabs = cloneTabsWithNewIds(source.tabs)
      const nextContentById: Project["contentById"] = {}
      tabIdMap.forEach((nextId, oldId) => {
        nextContentById[nextId] = source.contentById[oldId] ?? ""
      })

      const duplicate: Project = {
        ...source,
        id: createLocalId(),
        name: buildDuplicateProjectName(source.name, current.map((project) => project.name)),
        createdAt: new Date().toISOString(),
        tabs: nextTabs,
        activeId: source.activeId ? (tabIdMap.get(source.activeId) ?? (nextTabs[0]?.id ?? null)) : (nextTabs[0]?.id ?? null),
        contentById: nextContentById,
      }

      const nextProjects = [...current]
      nextProjects.splice(sourceIndex + 1, 0, duplicate)
      return nextProjects
    })

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
    const project = projects.find((entry) => entry.id === projectId)
    setPendingDeleteProjectId(projectId)
    setDeleteModalProjectName(project?.name ?? "")
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

  useEffect(() => {
    if (isProjectSettingsOpen) {
      setIsProjectSettingsRendered(true)
      setIsProjectSettingsClosing(false)
      return
    }

    if (!isProjectSettingsRendered) {
      return
    }

    setIsProjectSettingsClosing(true)
    const timeoutId = window.setTimeout(() => {
      setIsProjectSettingsRendered(false)
      setIsProjectSettingsClosing(false)
    }, 170)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [isProjectSettingsOpen, isProjectSettingsRendered])

  useEffect(() => {
    if (!isProjectSettingsRendered) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeProjectSettings()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [isProjectSettingsRendered])

  useEffect(() => {
    if (isDeleteModalOpen) {
      setIsDeleteModalRendered(true)
      setIsDeleteModalClosing(false)
      if (pendingDeleteProject) {
        setDeleteModalProjectName(pendingDeleteProject.name)
      }
      return
    }

    if (!isDeleteModalRendered) {
      return
    }

    setIsDeleteModalClosing(true)
    const timeoutId = window.setTimeout(() => {
      setIsDeleteModalRendered(false)
      setIsDeleteModalClosing(false)
      setDeleteModalProjectName("")
    }, 170)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [isDeleteModalOpen, isDeleteModalRendered, pendingDeleteProject])

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
    dragPreview.style.height = `${Math.round(bounds.height)}px`
    dragPreview.style.minHeight = `${Math.round(bounds.height)}px`
    dragPreview.style.maxHeight = `${Math.round(bounds.height)}px`
    dragPreview.style.boxSizing = "border-box"
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

  const renderProjectCard = (project: Project) => {
    const entryCount = collectTabIds(project.tabs).length
    const { singular, plural } = getProjectEntryTerms(project.kind)
    const entryLabel = entryCount === 1 ? singular.toLowerCase() : plural.toLowerCase()
    const wallpaperRows = buildProjectEmojiWallpaperRows(project.wallpaperEmojis ?? "")

    const handleProjectCardClick = (event: ReactMouseEvent<HTMLElement>) => {
      if (editingProjectId === project.id) {
        return
      }

      const target = event.target
      if (target instanceof Element && target.closest("button, input, textarea, select, label")) {
        return
      }

      onOpenProject(project.id)
    }

    const updateProjectDropTarget = (event: DragEvent<HTMLElement>) => {
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
    }

    return (
      <li
        key={project.id}
        className={`project-card ${getProjectDropClassName(project.id)} ${draggingProjectId === project.id ? "project-card--dragging" : ""}`.trim()}
        style={
          {
            "--project-accent": project.color,
            "--project-accent-soft": hexToRgba(project.color, 0.14),
          } as CSSProperties
        }
        onDragEnter={updateProjectDropTarget}
        onDragOver={updateProjectDropTarget}
        onDrop={(event) => {
          if (!draggingProjectId || draggingProjectId === project.id) {
            return
          }

          event.preventDefault()
          event.stopPropagation()
          handleProjectDrop()
        }}
        onClick={handleProjectCardClick}
      >
        {wallpaperRows.length ? (
          <div className="project-card__emoji-wallpaper" aria-hidden="true">
            <div className="project-card__emoji-wallpaper-grid">
              {wallpaperRows.map((row, index) => (
                <span key={`${project.id}-wallpaper-row-${index}`} className="project-card__emoji-wallpaper-row">
                  {row}
                </span>
              ))}
            </div>
          </div>
        ) : null}

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
            <div className="project-card__actions">
              <button
                type="button"
                className="project-card__icon-btn"
                aria-label={openProjectSettingsId === project.id ? "Cancel" : `Edit ${project.name}`}
                onClick={() => {
                  if (openProjectSettingsId === project.id) {
                    closeProjectSettings()
                    return
                  }

                  openProjectSettings(project)
                }}
              >
                {openProjectSettingsId === project.id ? <X size={14} strokeWidth={2} aria-hidden={true} /> : <Settings2 size={14} strokeWidth={2} aria-hidden={true} />}
                <span className="project-card__icon-btn-label">{openProjectSettingsId === project.id ? "Cancel" : "Edit Project"}</span>
              </button>
            </div>
          </div>

          {editingProjectId === project.id ? (
            renderProjectRenameEditor()
          ) : (
            <h2
              onMouseEnter={(event) => {
                startTitleAutoScroll(event.currentTarget)
              }}
              onWheel={() => {
                stopTitleAutoScroll()
              }}
              onMouseLeave={(event) => {
                stopTitleAutoScroll(event.currentTarget)
              }}
            >
              {project.name}
            </h2>
          )}

          <div className="project-card__details" aria-label={`Type ${project.kind}, ${entryCount} ${entryLabel}, last edited ${formatProjectDate(project.createdAt)}`}>
            <div className="project-card__meta">
              <span className="project-card__meta-kind">
                {project.kind === "Book" ? (
                  <BookText size={13} strokeWidth={1.9} aria-hidden="true" />
                ) : (
                  <NotebookText size={13} strokeWidth={1.9} aria-hidden="true" />
                )}
                <span>{project.kind}</span>
              </span>
              <span className="project-card__meta-separator" aria-hidden="true">&middot;</span>
              <span className="project-card__meta-count">{`${entryCount} ${entryLabel}`}</span>
            </div>
            <span className="project-card__last-edited">{`Last edited ${formatProjectDate(project.createdAt)}`}</span>
          </div>

        </div>
      </li>
    )
  }

  return (
    <section className="project-hub" aria-label="Projects home">
      <div className={`project-hub__content ${isDeleteModalRendered || isProjectSettingsRendered ? "project-hub__content--blurred" : ""}`.trim()}>
        <header className="project-hub__header">
          <div className="project-hub__title-row">
            <h1>Project Library</h1>
            <div className="project-hub__create-menu-wrap" ref={createMenuWrapRef}>
              <button
                type="button"
                className="project-hub__plus-btn"
                aria-label={isCreateMenuOpen ? "Cancel" : "Create project"}
                onClick={() => {
                  setOpenFolderCreateMenuId(null)
                  setIsCreateMenuOpen((open) => !open)
                }}
              >
                {isCreateMenuOpen ? <X size={16} strokeWidth={2} aria-hidden={true} /> : <Plus size={16} strokeWidth={2} aria-hidden={true} />}
                <span className="project-hub__plus-btn-label">{isCreateMenuOpen ? "Cancel" : "Create Project"}</span>
              </button>

              <div
                className={`project-hub__create-menu ${isCreateMenuOpen ? "project-hub__create-menu--open" : "project-hub__create-menu--closed"}`.trim()}
                role="menu"
                aria-label="Create project type"
                aria-hidden={!isCreateMenuOpen}
              >
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

          {topRootProjects.map((project) => renderProjectCard(project))}

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
                    className="project-hub__plus-btn project-folder__plus-btn"
                    aria-label={openFolderCreateMenuId === folder.id ? "Cancel" : `Create project in ${folder.name}`}
                    aria-expanded={openFolderCreateMenuId === folder.id}
                    onClick={() => {
                      setIsCreateMenuOpen(false)
                      setOpenFolderCreateMenuId((currentId) => (currentId === folder.id ? null : folder.id))
                    }}
                  >
                    {openFolderCreateMenuId === folder.id ? <X size={16} strokeWidth={2} aria-hidden={true} /> : <Plus size={16} strokeWidth={2} aria-hidden={true} />}
                    <span className="project-hub__plus-btn-label project-folder__plus-btn-label">{openFolderCreateMenuId === folder.id ? "Cancel" : "Create Project"}</span>
                  </button>

                  <div
                    className={`project-hub__create-menu ${openFolderCreateMenuId === folder.id ? "project-hub__create-menu--open" : "project-hub__create-menu--closed"}`.trim()}
                    role="menu"
                    aria-label={`Create project in ${folder.name}`}
                    aria-hidden={openFolderCreateMenuId !== folder.id}
                  >
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
            ...getProjectsForFolder(folder.id).map((project) => renderProjectCard(project)),
          ])}

          {/* Existing projects list acts as the launchpad into the editor workspace. */}
          {bottomRootProjects.map((project) => renderProjectCard(project))}

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

      {isProjectSettingsRendered ? (
        <>
          <div
            className={`project-settings-modal__overlay ${isProjectSettingsClosing ? "project-settings-modal__overlay--closing" : "project-settings-modal__overlay--opening"}`.trim()}
            onMouseDown={closeProjectSettings}
            aria-hidden="true"
          />
          <div className="project-settings-modal__frame">
            <button
              type="button"
              className={`project-settings-modal__floating-close ${isProjectSettingsClosing ? "project-settings-modal__floating-close--closing" : "project-settings-modal__floating-close--opening"}`.trim()}
              onClick={closeProjectSettings}
              aria-label="Close project settings"
            >
              <X size={16} strokeWidth={2} aria-hidden="true" />
              <span className="project-settings-modal__floating-close-label">Close Settings</span>
            </button>
            <div
              className={`project-settings-modal__modal ${isProjectSettingsClosing ? "project-settings-modal__modal--closing" : "project-settings-modal__modal--opening"}`.trim()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="project-settings-title"
            >
              <div className="project-settings-modal__header">
                <h3 id="project-settings-title" className="project-settings-modal__title">
                  <ScrollText size={19} strokeWidth={1.9} aria-hidden="true" />
                  <span>Project Preferences</span>
                </h3>
              </div>

            <ProjectPreferencesFields
              fieldClassName="project-settings-modal__field"
              projectName={projectSettingsName}
              projectKind={projectSettingsKind}
              markdownEditorEnabled={projectSettingsMarkdownEditorEnabled}
              projectColor={projectSettingsColor}
              projectWallpaperEmojis={projectSettingsWallpaperEmojis}
              showVersionHistory={false}
              onProjectNameChange={(nextName) => {
                setProjectSettingsName(nextName)
                if (projectSettingsError) {
                  setProjectSettingsError("")
                }
              }}
              onProjectKindChange={setProjectSettingsKind}
              onMarkdownEditorEnabledChange={setProjectSettingsMarkdownEditorEnabled}
              onProjectColorChange={setProjectSettingsColor}
              onProjectWallpaperEmojisChange={setProjectSettingsWallpaperEmojis}
              onExportProject={() => {
                if (!settingsProject) {
                  return
                }

                if (projectSettingsMarkdownEditorEnabled) {
                  downloadProjectAsMarkdown(settingsProject)
                  return
                }

                exportProjectAsPdf(settingsProject)
              }}
              onMarkdownPromptDismissed={closeProjectSettings}
            />

            {projectSettingsError ? <p className="project-settings-modal__error">{projectSettingsError}</p> : null}

              <div className="project-settings-modal__actions">
                <button
                  type="button"
                  className="project-settings-modal__btn"
                  onClick={duplicateProjectFromSettings}
                  disabled={!settingsProject}
                >
                  <BookCopy size={14} strokeWidth={2} aria-hidden={true} />
                  Duplicate
                </button>
                <button
                  type="button"
                  className="project-settings-modal__btn project-settings-modal__btn--danger"
                  onClick={() => {
                    if (!settingsProject) {
                      return
                    }

                    closeProjectSettings()
                    openDeleteConfirmation(settingsProject.id)
                  }}
                >
                  <Trash2 size={14} strokeWidth={2} aria-hidden={true} />
                  Delete
                </button>
              </div>
            </div>
          </div>
        </>
      ) : null}

      {isDeleteModalRendered ? (
        <>
          <div
            className={`project-settings-modal__overlay ${isDeleteModalClosing ? "project-settings-modal__overlay--closing" : "project-settings-modal__overlay--opening"}`.trim()}
            onMouseDown={closeDeleteConfirmation}
            aria-hidden="true"
          />
          <div className="project-settings-modal__frame">
            <button
              type="button"
              className={`project-settings-modal__floating-close ${isDeleteModalClosing ? "project-settings-modal__floating-close--closing" : "project-settings-modal__floating-close--opening"}`.trim()}
              onClick={closeDeleteConfirmation}
              aria-label="Close delete confirmation"
            >
              <X size={16} strokeWidth={2} aria-hidden="true" />
              <span className="project-settings-modal__floating-close-label">Cancel</span>
            </button>

            <div
              className={`project-settings-modal__modal ${isDeleteModalClosing ? "project-settings-modal__modal--closing" : "project-settings-modal__modal--opening"} project-delete-modal__modal`.trim()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="project-delete-title"
            >
              <div className="project-settings-modal__header">
                <h3 id="project-delete-title" className="project-settings-modal__title">
                  <Trash2 size={19} strokeWidth={1.9} aria-hidden="true" />
                  <span>Delete Project</span>
                </h3>
              </div>

              <p className="project-delete-modal__copy">
                This project is about to go extinct? Are you sure you want to delete "{deleteProjectName}"? (This
                action is not reversable.)
              </p>
              <p className="project-delete-modal__copy">Type the exact phrase below to confirm deletion.</p>

              <div className="project-delete-modal__spacer" aria-hidden="true" />

              <div
                className="project-delete-modal__typing-box"
                onClick={() => {
                  deleteConfirmationInputRef.current?.focus()
                }}
              >
                <p className="project-delete-modal__typing-text" aria-hidden="true">
                  {requiredDeleteCharacters.map((character, index) => {
                    const typedCharacter = enteredDeleteCharacters[index]
                    const stateClassName =
                      typedCharacter === undefined
                        ? "project-delete-modal__typing-char--pending"
                        : typedCharacter === character
                          ? "project-delete-modal__typing-char--correct"
                          : "project-delete-modal__typing-char--wrong"

                    return (
                      <span key={`required-${index}`} className={`project-delete-modal__typing-char ${stateClassName}`}>
                        {character}
                      </span>
                    )
                  })}
                  {enteredDeleteCharacters.slice(requiredDeleteCharacters.length).map((character, index) => (
                    <span
                      key={`overflow-${index}`}
                      className="project-delete-modal__typing-char project-delete-modal__typing-char--wrong"
                    >
                      {character}
                    </span>
                  ))}
                </p>

                <input
                  ref={deleteConfirmationInputRef}
                  className="project-delete-modal__typing-input"
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
                  spellCheck={false}
                  autoCapitalize="none"
                  autoCorrect="off"
                  aria-label="Type the required delete confirmation phrase"
                />
              </div>

              {deleteError ? <p className="project-settings-modal__error">{deleteError}</p> : null}

              <div className="project-settings-modal__actions">
                <button
                  type="button"
                  className="project-settings-modal__btn project-settings-modal__btn--danger"
                  onClick={confirmDelete}
                >
                  <Trash2 size={14} strokeWidth={2} aria-hidden={true} />
                  Delete
                </button>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </section>
  )
}
