import { useMemo, useState } from "react"
import { BookText, ChevronDown, Folder, NotebookText, Pencil, Settings2, Trash2 } from "lucide-react"
import type { Project } from "../../../core/projects"
import type { ProjectFolder } from "../../pages/ProjectLibrary"
import { useListDrag } from "./hooks/useListDrag"
import Modal from "../ui/Modal"
import Button from "../ui/Button"
import "./ProjectBrowserPanel.css"

type ProjectBrowserPanelProps = {
  projects: Project[]
  folders: ProjectFolder[]
  activeProjectId: string | null
  onOpenProject: (projectId: string) => void
  onOpenProjectSettings: (projectId: string) => void
  setFolders: React.Dispatch<React.SetStateAction<ProjectFolder[]>>
  setProjects: React.Dispatch<React.SetStateAction<Project[]>>
}

export default function ProjectBrowserPanel({
  projects,
  folders,
  activeProjectId,
  onOpenProject,
  onOpenProjectSettings,
  setFolders,
  setProjects,
}: ProjectBrowserPanelProps) {
  const drag = useListDrag({ flatOnly: true })
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({})
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null)
  const [editingFolderName, setEditingFolderName] = useState("")
  const [pendingDeleteFolderId, setPendingDeleteFolderId] = useState<string | null>(null)

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

  const confirmDeleteFolder = () => {
    if (!pendingDeleteFolderId) return

    setProjects((current) =>
      current.map((p) =>
        p.folderId === pendingDeleteFolderId
          ? { ...p, folderId: null, rootPosition: "top" as const }
          : p,
      ),
    )
    setFolders((current) => current.filter((f) => f.id !== pendingDeleteFolderId))
    setPendingDeleteFolderId(null)
  }

  const pendingDeleteFolder = pendingDeleteFolderId
    ? folders.find((f) => f.id === pendingDeleteFolderId)
    : null

  const renderProject = (project: Project, depth = 0) => {
    const isActive = project.id === activeProjectId
    const isDragging = drag.draggingId === project.id
    const isDropBefore = drag.dropTarget?.targetId === project.id && drag.dropTarget.mode === "before"
    const isDropAfter = drag.dropTarget?.targetId === project.id && drag.dropTarget.mode === "after"
    const Icon = project.kind === "Book" ? BookText : NotebookText

    return (
      <li key={project.id} className="project-browser__item">
        <div
          className={`project-browser__drop-line project-browser__drop-line--top ${isDropBefore ? "project-browser__drop-line--visible" : ""}`.trim()}
          style={{ marginLeft: `${8 + depth * 16}px` }}
        />

        <div
          className={`project-browser__row ${isActive ? "project-browser__row--active" : ""}`.trim()}
          onDragOver={(event) => drag.handleRowDragOver(event, project.id)}
          onDrop={(event) => {
            const result = drag.handleRowDrop(event, project.id)
            if (result) commitProjectDrop(result.targetId, result.mode as "before" | "after")
          }}
        >
          <button
            type="button"
            draggable
            className={`project-browser__label ${isDragging ? "project-browser__label--dragging" : ""}`.trim()}
            style={{ paddingLeft: `${8 + depth * 16}px` }}
            onClick={() => onOpenProject(project.id)}
            onDragStart={(event) => drag.handleDragStart(event, project.id, editingFolderId)}
            onDragEnd={() => drag.handleDragEnd()}
          >
            <span className="project-browser__icon">
              <Icon size={14} strokeWidth={1.8} aria-hidden="true" />
            </span>
            <span className="project-browser__label-text">{project.name}</span>
          </button>

          <button
            type="button"
            className="project-browser__settings-btn"
            aria-label={`Settings for ${project.name}`}
            onClick={(event) => {
              event.stopPropagation()
              onOpenProjectSettings(project.id)
            }}
          >
            <Settings2 size={13} strokeWidth={2} aria-hidden="true" />
          </button>
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
    const isDropInside = drag.dropTarget?.targetId === folder.id && drag.dropTarget.mode === "inside"

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
            // Dropping on a folder always means "move inside"
            drag.setDropTarget({ targetId: folder.id, mode: "inside" })
          }}
          onDrop={(event) => {
            event.preventDefault()
            event.stopPropagation()
            if (drag.draggingId) {
              commitProjectDrop(folder.id, "after")
            }
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
                className="project-browser__label"
                onClick={() => toggleFolder(folder.id)}
                onContextMenu={(event) => {
                  event.preventDefault()
                  startFolderRename(folder.id, folder.name)
                }}
              >
                <span className="project-browser__icon">
                  <Folder size={14} strokeWidth={1.8} aria-hidden="true" />
                </span>
                <span className="project-browser__label-text">{folder.name}</span>
              </button>

              <button
                type="button"
                className="project-browser__edit-btn"
                aria-label={`Rename ${folder.name}`}
                onClick={(event) => {
                  event.stopPropagation()
                  startFolderRename(folder.id, folder.name)
                }}
              >
                <Pencil size={13} strokeWidth={2} aria-hidden="true" />
              </button>

              <button
                type="button"
                className="project-browser__delete-btn"
                aria-label={`Delete ${folder.name}`}
                onClick={(event) => {
                  event.stopPropagation()
                  setPendingDeleteFolderId(folder.id)
                }}
              >
                <Trash2 size={13} strokeWidth={2} aria-hidden="true" />
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

      <Modal
        isOpen={Boolean(pendingDeleteFolderId)}
        onClose={() => setPendingDeleteFolderId(null)}
        title="Delete Folder"
        titleIcon={<Trash2 size={19} strokeWidth={1.9} aria-hidden="true" />}
        closeLabel="Cancel"
        footer={
          <Button variant="footer-danger" onClick={confirmDeleteFolder}>
            <Trash2 size={14} strokeWidth={2} aria-hidden="true" />
            Delete
          </Button>
        }
      >
        <p>
          Are you sure you want to delete <strong>{pendingDeleteFolder?.name}</strong>?
          {projects.filter((p) => p.folderId === pendingDeleteFolderId).length > 0
            ? " Projects inside will be moved to the root."
            : null}
        </p>
      </Modal>
    </div>
  )
}
