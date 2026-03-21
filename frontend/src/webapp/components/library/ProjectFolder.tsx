import { useState, type DragEvent } from "react"
import { BookText, GripVertical, NotebookText, Plus, X } from "lucide-react"
import type { ProjectFolder as ProjectFolderType } from "../../pages/Library"
import type { ProjectKind } from "../../../core/projects"

export type ProjectFolderProps = {
  folder: ProjectFolderType
  dropClassName: string
  reorderClassName: string
  openFolderCreateMenuId: string | null
  onSetOpenFolderCreateMenuId: (id: string | null) => void
  onCloseCreateMenus: () => void
  onCreateNewProject: (kind: ProjectKind, folderId?: string) => void
  onFolderDragStart: (folderId: string, event: DragEvent<HTMLButtonElement>) => void
  onFolderDragEnd: () => void
  onDragOver: (event: DragEvent<HTMLElement>) => void
  onDrop: (event: DragEvent<HTMLElement>) => void
  setFolders: React.Dispatch<React.SetStateAction<ProjectFolderType[]>>
}

export default function ProjectFolder({
  folder,
  dropClassName,
  reorderClassName,
  openFolderCreateMenuId,
  onSetOpenFolderCreateMenuId,
  onCloseCreateMenus,
  onCreateNewProject,
  onFolderDragStart,
  onFolderDragEnd,
  onDragOver,
  onDrop,
  setFolders,
}: ProjectFolderProps) {
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null)
  const [editingFolderName, setEditingFolderName] = useState("")
  const [editingFolderDescriptionId, setEditingFolderDescriptionId] = useState<string | null>(null)
  const [editingFolderDescription, setEditingFolderDescription] = useState("")

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

  const commitFolderRename = () => {
    if (!editingFolderId) {
      return
    }

    const trimmed = editingFolderName.trim()
    if (trimmed) {
      setFolders((current) =>
        current.map((f) =>
          f.id === editingFolderId
            ? {
                ...f,
                name: trimmed,
              }
            : f,
        ),
      )
    }

    cancelFolderRename()
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
        current.map((f) =>
          f.id === editingFolderDescriptionId
            ? {
                ...f,
                description: trimmed,
              }
            : f,
        ),
      )
    }

    cancelFolderDescriptionRename()
  }

  return (
    <li
      className={`project-folder project-folder--inline ${dropClassName} ${reorderClassName}`.trim()}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div className="project-folder__title-row">
        <div className="project-folder__title-left">
          <button
            type="button"
            className="project-folder__drag-handle"
            aria-label={`Drag ${folder.name}`}
            draggable
            onDragStart={(event) => {
              onFolderDragStart(folder.id, event)
            }}
            onDragEnd={() => {
              onFolderDragEnd()
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
              onSetOpenFolderCreateMenuId(openFolderCreateMenuId === folder.id ? null : folder.id)
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
                onCreateNewProject("Book", folder.id)
                onCloseCreateMenus()
              }}
            >
              <BookText size={14} strokeWidth={2} aria-hidden="true" />
              <span>Book</span>
            </button>
            <button
              type="button"
              className="project-hub__create-option"
              onClick={() => {
                onCreateNewProject("Blog", folder.id)
                onCloseCreateMenus()
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
    </li>
  )
}
