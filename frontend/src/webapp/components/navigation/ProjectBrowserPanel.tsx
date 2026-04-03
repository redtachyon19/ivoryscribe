import { useCallback, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { Archive, BookCopy, BookText, ChevronDown, Clock3, Folder, LibraryBig, ScrollText, Trash2 } from "lucide-react"
import { requestNavigateArchive, requestNavigateTrash, requestNavigateLibrary, requestNavigateRecent } from "../../../core/editorEvents"
import type { Project } from "../../../core/projects"
import { duplicateProject } from "../../../core/libraryUtils"
import { downloadProjectAsMarkdown } from "../../../core/markdown"
import { exportProjectAsPdf } from "../../../core/pdfExport"
import type { ProjectFolder } from "../../pages/Library"
import { useListDrag } from "../editor/hooks/useListDrag"
import useSectionDrop from "../library/useSectionDrop"
import useProjectSettings from "../library/useProjectSettings"
import ProjectContextMenu, { buildProjectActions, buildFolderActions, type ProjectContextMenuState } from "../library/ProjectContextMenu"
import ProjectSettings from "../settings/ProjectSettings"
import ShareDialog from "../settings/ShareDialog"
import Modal from "../ui/Modal"
import Button from "../ui/Button"
import "./ProjectBrowserPanel.css"

type ProjectBrowserPanelProps = {
  projects: Project[]
  folders: ProjectFolder[]
  activeProjectId: string | null
  isLibraryView: boolean
  onNavigateLibrary: () => void
  onOpenProject: (projectId: string) => void
  setFolders: React.Dispatch<React.SetStateAction<ProjectFolder[]>>
  setProjects: React.Dispatch<React.SetStateAction<Project[]>>
  sessionToken: string
  projectDocumentMap: Record<string, string>
}

export default function ProjectBrowserPanel({
  projects,
  folders,
  activeProjectId,
  isLibraryView,
  onNavigateLibrary,
  onOpenProject,
  setFolders,
  setProjects,
  sessionToken,
  projectDocumentMap,
}: ProjectBrowserPanelProps) {
  const drag = useListDrag({ flatOnly: true })
  const sectionDrop = useSectionDrop({ folders, setProjects, setFolders })
  const settings = useProjectSettings({ projects, setProjects })
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({})
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null)
  const [editingFolderName, setEditingFolderName] = useState("")
  const [pendingTrashFolderId, setPendingTrashFolderId] = useState<string | null>(null)
  const [browserSection, setBrowserSection] = useState<"library" | "recent" | "archive" | "trash">("library")
  const [externalFolderDropId, setExternalFolderDropId] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<ProjectContextMenuState>(null)
  const closeContextMenu = useCallback(() => setContextMenu(null), [])
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null)
  const [editingProjectName, setEditingProjectName] = useState("")
  const [shareDialogProjectId, setShareDialogProjectId] = useState<string | null>(null)

  const shareDialogProject = shareDialogProjectId ? projects.find((p) => p.id === shareDialogProjectId) ?? null : null
  const shareDialogDocumentId = shareDialogProjectId ? (projectDocumentMap[shareDialogProjectId] ?? null) : null

  const openShareDialog = (projectId: string) => {
    if (projectDocumentMap[projectId]) {
      setShareDialogProjectId(projectId)
    }
  }

  const topRootProjects = projects.filter((p) => !p.folderId && p.rootPosition === "top")
  const bottomRootProjects = projects.filter((p) => !p.folderId && p.rootPosition === "bottom")

  // Build a flat ordering of visible item IDs for root list drag handlers
  const visibleItemIds = useMemo(() => {
    const ids: string[] = []
    for (const p of topRootProjects) ids.push(p.id)
    for (const f of folders) {
      ids.push(f.id)
      if (expandedFolders[f.id] !== false) {
        for (const p of projects.filter((pr) => pr.folderId === f.id)) ids.push(p.id)
      }
    }
    for (const p of bottomRootProjects) ids.push(p.id)
    return ids
  }, [projects, folders, expandedFolders, topRootProjects, bottomRootProjects])

  const rootListHandlers = drag.createRootListHandlers(visibleItemIds, "project-browser__item")

  const moveProjectToFolder = (projectId: string, folderId: string) => {
    setProjects((cur) =>
      cur.map((p) => (p.id === projectId ? { ...p, folderId, rootPosition: "top" as const, archivedAt: null, deletedAt: null } : p)),
    )
  }

  const commitProjectDrop = (targetId: string, mode: "before" | "after") => {
    if (!drag.draggingId) return

    const sourceId = drag.draggingId
    const sourceProject = projects.find((p) => p.id === sourceId)
    if (!sourceProject) {
      drag.handleDragEnd()
      return
    }

    const targetFolder = folders.find((f) => f.id === targetId)
    const targetProject = projects.find((p) => p.id === targetId)

    if (targetFolder) {
      // Dropping on a folder → move project into that folder
      setProjects((cur) =>
        cur.map((p) => (p.id === sourceId ? { ...p, folderId: targetFolder.id, rootPosition: "top" as const } : p)),
      )
    } else if (targetProject) {
      // Dropping on another project → place next to it with same folderId
      setProjects((cur) => {
        const moved = cur.find((p) => p.id === sourceId)
        if (!moved) return cur

        const updated = { ...moved, folderId: targetProject.folderId, rootPosition: targetProject.rootPosition }
        const without = cur.filter((p) => p.id !== sourceId)
        const targetIndex = without.findIndex((p) => p.id === targetId)
        if (targetIndex === -1) return cur

        const insertAt = mode === "after" ? targetIndex + 1 : targetIndex
        const next = [...without]
        next.splice(insertAt, 0, updated)
        return next
      })
    }

    drag.handleDragEnd()
  }

  const isFolderExpanded = (folderId: string) => expandedFolders[folderId] !== false

  const toggleFolder = (folderId: string) => {
    setExpandedFolders((current) => ({
      ...current,
      [folderId]: current[folderId] === false,
    }))
  }

  const startFolderRename = (folderId: string, currentName: string) => {
    setEditingFolderId(folderId)
    setEditingFolderName(currentName)
  }

  const cancelFolderRename = () => {
    setEditingFolderId(null)
    setEditingFolderName("")
  }

  const commitFolderRename = () => {
    if (!editingFolderId) return

    const trimmed = editingFolderName.trim()
    if (trimmed) {
      setFolders((current) =>
        current.map((f) => (f.id === editingFolderId ? { ...f, name: trimmed } : f)),
      )
    }

    cancelFolderRename()
  }

  const confirmTrashFolder = () => {
    if (!pendingTrashFolderId) return

    setProjects((current) =>
      current.map((p) =>
        p.folderId === pendingTrashFolderId
          ? { ...p, folderId: null, rootPosition: "top" as const }
          : p,
      ),
    )
    setFolders((current) => current.filter((f) => f.id !== pendingTrashFolderId))
    setPendingTrashFolderId(null)
  }

  const pendingTrashFolder = pendingTrashFolderId
    ? folders.find((f) => f.id === pendingTrashFolderId)
    : null

  const startProjectRename = (projectId: string, currentName: string) => {
    setEditingProjectId(projectId)
    setEditingProjectName(currentName)
  }

  const cancelProjectRename = () => {
    setEditingProjectId(null)
    setEditingProjectName("")
  }

  const commitProjectRename = () => {
    if (!editingProjectId) return
    const trimmed = editingProjectName.trim()
    if (trimmed) {
      setProjects((cur) => cur.map((p) => p.id === editingProjectId ? { ...p, name: trimmed } : p))
    }
    cancelProjectRename()
  }

  const renderProject = (project: Project, depth = 0) => {
    const isActive = project.id === activeProjectId
    const isDragging = drag.draggingId === project.id
    const isDropBefore = drag.dropTarget?.targetId === project.id && drag.dropTarget.mode === "before"
    const isDropAfter = drag.dropTarget?.targetId === project.id && drag.dropTarget.mode === "after"
    const Icon = BookText
    const isEditingProject = editingProjectId === project.id

    return (
      <li key={project.id} className="project-browser__item">
        <div
          className={`project-browser__drop-line project-browser__drop-line--top ${isDropBefore ? "project-browser__drop-line--visible" : ""}`.trim()}
          style={{ marginLeft: `${8 + depth * 16}px` }}
        />

        <div
          className={`project-browser__row ${isActive ? "project-browser__row--active" : ""}`.trim()}
          onDragOver={(event) => {
            if (!drag.draggingId) return
            drag.handleRowDragOver(event, project.id)
          }}
          onDrop={(event) => {
            if (!drag.draggingId) return
            const result = drag.handleRowDrop(event, project.id)
            if (result) commitProjectDrop(result.targetId, result.mode as "before" | "after")
          }}
        >
          {isEditingProject ? (
            <input
              className="project-browser__rename-input"
              value={editingProjectName}
              autoFocus
              onChange={(event) => setEditingProjectName(event.target.value)}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                if (event.key === "Enter") { event.preventDefault(); commitProjectRename() }
                if (event.key === "Escape") { event.preventDefault(); cancelProjectRename() }
              }}
              onBlur={commitProjectRename}
            />
          ) : (
            <button
              type="button"
              draggable
              className={`project-browser__label ${isDragging ? "project-browser__label--dragging" : ""}`.trim()}
              style={{ paddingLeft: `${8 + depth * 16}px` }}
              onClick={() => onOpenProject(project.id)}
              onDragStart={(event) => drag.handleDragStart(event, project.id, editingFolderId)}
              onDragEnd={() => drag.handleDragEnd()}
              onContextMenu={(event) => {
                event.preventDefault()
                setContextMenu({ x: event.clientX, y: event.clientY, projectId: project.id })
              }}
            >
              <span className="project-browser__icon">
                <Icon size={14} strokeWidth={1.8} aria-hidden="true" />
              </span>
              <span className="project-browser__label-text">{project.name}</span>
            </button>
          )}

        </div>

        <div
          className={`project-browser__drop-line project-browser__drop-line--bottom ${isDropAfter ? "project-browser__drop-line--visible" : ""}`.trim()}
          style={{ marginLeft: `${8 + depth * 16}px` }}
        />
      </li>
    )
  }

  const renderFolder = (folder: ProjectFolder) => {
    const isExpanded = isFolderExpanded(folder.id)
    const isEditing = editingFolderId === folder.id
    const folderProjects = projects.filter((p) => p.folderId === folder.id)
    const hasProjects = folderProjects.length > 0
    const isDropBefore = drag.dropTarget?.targetId === folder.id && drag.dropTarget.mode === "before"
    const isDropAfter = drag.dropTarget?.targetId === folder.id && drag.dropTarget.mode === "after"
    const isDropInside = (drag.dropTarget?.targetId === folder.id && drag.dropTarget.mode === "inside") || externalFolderDropId === folder.id

    return (
      <li key={folder.id} className={`project-browser__item ${isDropInside ? "project-browser__item--drop-inside" : ""}`.trim()}>
        <div
          className={`project-browser__drop-line project-browser__drop-line--top ${isDropBefore ? "project-browser__drop-line--visible" : ""}`.trim()}
        />

        <div
          className="project-browser__row project-browser__row--folder"
          onDragOver={(event) => {
            event.preventDefault()
            event.stopPropagation()
            if (drag.draggingId) {
              drag.setDropTarget({ targetId: folder.id, mode: "inside" })
            } else {
              setExternalFolderDropId(folder.id)
            }
          }}
          onDragLeave={(event) => {
            const related = event.relatedTarget as HTMLElement | null
            if (related && event.currentTarget.contains(related)) return
            if (externalFolderDropId === folder.id) setExternalFolderDropId(null)
          }}
          onDrop={(event) => {
            event.preventDefault()
            event.stopPropagation()
            if (drag.draggingId) {
              commitProjectDrop(folder.id, "after")
            } else {
              const projectId = event.dataTransfer.getData("text/plain")
              if (projectId) moveProjectToFolder(projectId, folder.id)
            }
            setExternalFolderDropId(null)
          }}
        >
          {isEditing ? (
            <input
              className="project-browser__rename-input"
              value={editingFolderName}
              autoFocus
              onChange={(event) => setEditingFolderName(event.target.value)}
              onClick={(event) => event.stopPropagation()}
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
              onBlur={commitFolderRename}
            />
          ) : (
            <>
              <button
                type="button"
                draggable
                className="project-browser__label"
                onClick={() => toggleFolder(folder.id)}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "move"
                  event.dataTransfer.setData("text/plain", folder.id)
                }}
                onContextMenu={(event) => {
                  event.preventDefault()
                  setContextMenu({ x: event.clientX, y: event.clientY, projectId: folder.id, isFolder: true })
                }}
              >
                <span className="project-browser__icon">
                  <Folder size={14} strokeWidth={1.8} aria-hidden="true" />
                </span>
                <span className="project-browser__label-text">{folder.name}</span>
              </button>

              {hasProjects ? (
                <button
                  type="button"
                  className={`project-browser__collapse-btn ${isExpanded ? "project-browser__collapse-btn--open" : ""}`.trim()}
                  aria-label={isExpanded ? `Collapse ${folder.name}` : `Expand ${folder.name}`}
                  aria-expanded={isExpanded}
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation()
                    toggleFolder(folder.id)
                  }}
                >
                  <ChevronDown size={15} strokeWidth={2} aria-hidden="true" />
                </button>
              ) : null}
            </>
          )}
        </div>

        <div
          className={`project-browser__drop-line project-browser__drop-line--bottom ${isDropAfter ? "project-browser__drop-line--visible" : ""}`.trim()}
        />

        {hasProjects && isExpanded ? (
          <ul className="project-browser__list project-browser__list--nested">
            {folderProjects.map((p) => renderProject(p, 1))}
          </ul>
        ) : null}
      </li>
    )
  }

  return (
    <div className="project-browser">
      <div className="project-browser__section-switcher" aria-label="Project browser sections">
        <div className="project-browser__section-divider" aria-hidden="true" />
        <div className="project-browser__section-buttons" role="tablist" aria-label="Project sections">
          <button
            type="button"
            role="tab"
            aria-selected={browserSection === "library" && isLibraryView}
            className={`project-browser__section-btn ${browserSection === "library" && isLibraryView ? "project-browser__section-btn--active" : ""} ${sectionDrop.getSectionDropClass("library")}`.trim()}
            onClick={() => {
              setBrowserSection("library")
              onNavigateLibrary()
              requestNavigateLibrary()
            }}
            onDragOver={sectionDrop.handleSectionDragOver("library")}
            onDragLeave={sectionDrop.handleSectionDragLeave}
            onDrop={sectionDrop.handleSectionDrop("library")}
          >
            <LibraryBig size={14} strokeWidth={1.9} aria-hidden="true" />
            <span>Library</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={browserSection === "recent"}
            className={`project-browser__section-btn ${browserSection === "recent" ? "project-browser__section-btn--active" : ""}`.trim()}
            onClick={() => {
              setBrowserSection("recent")
              onNavigateLibrary()
              requestNavigateRecent()
            }}
          >
            <Clock3 size={14} strokeWidth={1.9} aria-hidden="true" />
            <span>Recent</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={browserSection === "archive"}
            className={`project-browser__section-btn ${browserSection === "archive" ? "project-browser__section-btn--active" : ""} ${sectionDrop.getSectionDropClass("archive")}`.trim()}
            onClick={() => {
              setBrowserSection("archive")
              onNavigateLibrary()
              requestNavigateArchive()
            }}
            onDragOver={sectionDrop.handleSectionDragOver("archive")}
            onDragLeave={sectionDrop.handleSectionDragLeave}
            onDrop={sectionDrop.handleSectionDrop("archive")}
          >
            <Archive size={14} strokeWidth={1.9} aria-hidden="true" />
            <span>Archive</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={browserSection === "trash"}
            className={`project-browser__section-btn ${browserSection === "trash" ? "project-browser__section-btn--active" : ""} ${sectionDrop.getSectionDropClass("trash")}`.trim()}
            onClick={() => {
              setBrowserSection("trash")
              onNavigateLibrary()
              requestNavigateTrash()
            }}
            onDragOver={sectionDrop.handleSectionDragOver("trash")}
            onDragLeave={sectionDrop.handleSectionDragLeave}
            onDrop={sectionDrop.handleSectionDrop("trash")}
          >
            <Trash2 size={14} strokeWidth={1.9} aria-hidden="true" />
            <span>Trash</span>
          </button>
        </div>
        <div className="project-browser__section-divider" aria-hidden="true" />
      </div>

      <header className="project-browser__header">
        <p className="project-browser__title">Projects</p>
      </header>

      <div className="project-browser__list-shell">
        <ul
          className="project-browser__list"
          onDragOver={rootListHandlers.onDragOver}
          onDrop={(event) => {
            const result = rootListHandlers.onDrop(event)
            if (result) commitProjectDrop(result.targetId, result.mode as "before" | "after")
          }}
        >
          {topRootProjects.map((p) => renderProject(p))}
          {folders.map((f) => renderFolder(f))}
          {bottomRootProjects.map((p) => renderProject(p))}
        </ul>
      </div>

      {createPortal(
        <>
          <Modal
            isOpen={Boolean(pendingTrashFolderId)}
            onClose={() => setPendingTrashFolderId(null)}
            title="Trash Folder"
            titleIcon={<Trash2 size={19} strokeWidth={1.9} aria-hidden="true" />}
            closeLabel="Cancel"
            footer={
              <Button variant="footer-danger" onClick={confirmTrashFolder}>
                <Trash2 size={14} strokeWidth={2} aria-hidden="true" />
                Trash
              </Button>
            }
          >
            <p>
              Are you sure you want to trash <strong>{pendingTrashFolder?.name}</strong>?
              {projects.filter((p) => p.folderId === pendingTrashFolderId).length > 0
                ? " Projects inside will be moved to the root."
                : null}
            </p>
          </Modal>

          <Modal
            isOpen={settings.isOpen}
            onClose={settings.close}
            title="Project Preferences"
            titleIcon={<ScrollText size={19} strokeWidth={1.9} aria-hidden="true" />}
            closeLabel="Close Settings"
            actions={
              <>
                <Button variant="footer" onClick={settings.duplicate} disabled={!settings.settingsProject}>
                  <BookCopy size={14} strokeWidth={2} aria-hidden={true} />
                  Duplicate
                </Button>
                <Button
                  variant="footer"
                  onClick={() => {
                    if (!settings.settingsProject) return
                    setProjects((cur) => cur.map((p) => p.id === settings.settingsProject!.id ? { ...p, archivedAt: new Date().toISOString() } : p))
                    settings.close()
                  }}
                  disabled={!settings.settingsProject}
                >
                  <Archive size={14} strokeWidth={2} aria-hidden={true} />
                  Archive
                </Button>
                <Button
                  variant="footer-danger"
                  onClick={() => {
                    if (!settings.settingsProject) return
                    settings.close()
                    setProjects((cur) => cur.map((p) => p.id === settings.settingsProject!.id ? { ...p, deletedAt: new Date().toISOString() } : p))
                  }}
                >
                  <Trash2 size={14} strokeWidth={2} aria-hidden={true} />
                  Trash
                </Button>
              </>
            }
          >
            <ProjectSettings
              fieldClassName="project-settings-modal__field"
              projectName={settings.projectName}
              markdownEditorEnabled={settings.markdownEditorEnabled}
              projectColor={settings.projectColor}
              projectWallpaperEmojis={settings.wallpaperEmojis}
              onProjectNameChange={(nextName) => {
                settings.setProjectName(nextName)
                if (settings.error) settings.setError("")
              }}
              onMarkdownEditorEnabledChange={settings.setMarkdownEditorEnabled}
              onProjectColorChange={settings.setProjectColor}
              onProjectWallpaperEmojisChange={settings.setWallpaperEmojis}
              onExportProject={() => {
                if (!settings.settingsProject) return
                if (settings.markdownEditorEnabled) { downloadProjectAsMarkdown(settings.settingsProject); return }
                exportProjectAsPdf(settings.settingsProject)
              }}
              sessionToken={sessionToken}
              documentId={settings.settingsProject ? (projectDocumentMap[settings.settingsProject.id] ?? undefined) : undefined}
              onMarkdownPromptDismissed={settings.close}
            />
            {settings.error ? <p className="ui-modal__error">{settings.error}</p> : null}
          </Modal>
        </>,
        document.querySelector('.app') ?? document.body,
      )}

      {contextMenu ? (
        <ProjectContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={closeContextMenu}
          actions={
            contextMenu.isFolder
              ? buildFolderActions({
                  folderId: contextMenu.projectId,
                  onRename: (id) => {
                    const folder = folders.find((f) => f.id === id)
                    if (folder) startFolderRename(id, folder.name)
                  },
                  onArchive: (id) => {
                    setProjects((cur) => cur.map((p) => p.folderId === id ? { ...p, archivedAt: new Date().toISOString() } : p))
                    setFolders((cur) => cur.filter((f) => f.id !== id))
                  },
                  onTrash: (id) => setPendingTrashFolderId(id),
                })
              : buildProjectActions({
                  projectId: contextMenu.projectId,
                  onOpenInNewTab: onOpenProject,
                  onRename: (id) => {
                    const project = projects.find((p) => p.id === id)
                    if (project) startProjectRename(id, project.name)
                  },
                  onOpenSettings: (id) => {
                    const project = projects.find((p) => p.id === id)
                    if (project) settings.open(project)
                  },
                  onDuplicate: (id) => {
                    setProjects((current) => duplicateProject(current, id))
                  },
                  onArchive: (id) => {
                    setProjects((cur) => cur.map((p) => p.id === id ? { ...p, archivedAt: new Date().toISOString() } : p))
                  },
                  onTrash: (id) => {
                    setProjects((cur) => cur.map((p) => p.id === id ? { ...p, deletedAt: new Date().toISOString() } : p))
                  },
                  onShare: (id) => openShareDialog(id),
                })
          }
        />
      ) : null}

      {shareDialogProjectId && shareDialogDocumentId ? (
        <ShareDialog
          isOpen
          onClose={() => setShareDialogProjectId(null)}
          sessionToken={sessionToken}
          documentId={shareDialogDocumentId}
          projectName={shareDialogProject?.name ?? "Untitled"}
        />
      ) : null}
    </div>
  )
}
