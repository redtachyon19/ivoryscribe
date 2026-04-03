import { type DragEvent, type ReactNode } from "react"
import { ArrowLeft, BookPlus, Folder } from "lucide-react"
import type { ProjectFolder as ProjectFolderType } from "../../pages/Library"
import type { Project } from "../../../core/projects"

type ProjectFolderGridProps = {
  folders: ProjectFolderType[]
  projects: Project[]
  onOpenFolder: (folderId: string) => void
  onFolderDragStart?: (folderId: string, event: DragEvent<HTMLElement>) => void
  onFolderDragEnd?: () => void
  onFolderDragOver?: (folder: ProjectFolderType) => (event: DragEvent<HTMLElement>) => void
  onFolderDrop?: (folder: ProjectFolderType) => (event: DragEvent<HTMLElement>) => void
  getFolderDropClassName?: (folderId: string) => string
  getFolderReorderClassName?: (folderId: string) => string
  onFolderContextMenu?: (folderId: string, x: number, y: number) => void
  selectedIds?: Set<string>
  editingFolderId?: string | null
  editingFolderName?: string
  onEditingFolderNameChange?: (name: string) => void
  onCommitFolderRename?: () => void
  onCancelFolderRename?: () => void
}

export default function ProjectFolderGrid({
  folders, projects, onOpenFolder,
  onFolderDragStart, onFolderDragEnd, onFolderDragOver, onFolderDrop,
  getFolderDropClassName, getFolderReorderClassName, onFolderContextMenu,
  selectedIds,
  editingFolderId, editingFolderName, onEditingFolderNameChange, onCommitFolderRename, onCancelFolderRename,
}: ProjectFolderGridProps) {
  if (folders.length === 0) return null

  return (
    <div className="project-hub__folders-grid" aria-label="Library folders">
      {folders.map((folder) => (
        <article
          key={folder.id}
          data-selectable-id={folder.id}
          className={`project-hub__folder-card ${getFolderDropClassName?.(folder.id) ?? ""} ${getFolderReorderClassName?.(folder.id) ?? ""} ${selectedIds?.has(folder.id) ? "project-hub__folder-card--marquee-selected" : ""}`.trim()}
          role="button"
          tabIndex={0}
          draggable
          onClick={() => { if (editingFolderId !== folder.id) onOpenFolder(folder.id) }}
          onKeyDown={(e) => { if (e.key === "Enter" && editingFolderId !== folder.id) onOpenFolder(folder.id) }}
          onDragStart={(e) => onFolderDragStart?.(folder.id, e)}
          onDragEnd={onFolderDragEnd}
          onDragOver={onFolderDragOver?.(folder)}
          onDrop={onFolderDrop?.(folder)}
          onContextMenu={(e) => {
            if (onFolderContextMenu) {
              e.preventDefault()
              onFolderContextMenu(folder.id, e.clientX, e.clientY)
            }
          }}
        >
          <Folder size={18} aria-hidden={true} />
          <div>
            {editingFolderId === folder.id ? (
              <input
                className="project-hub__folder-rename-input"
                value={editingFolderName ?? ""}
                autoFocus
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => onEditingFolderNameChange?.(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); onCommitFolderRename?.() }
                  if (e.key === "Escape") { e.preventDefault(); onCancelFolderRename?.() }
                }}
                onBlur={() => onCommitFolderRename?.()}
              />
            ) : (
              <strong>{folder.name}</strong>
            )}
            <span>{projects.filter((p) => p.folderId === folder.id).length} projects</span>
          </div>
        </article>
      ))}
    </div>
  )
}

type FolderDetailViewProps = {
  folder: ProjectFolderType
  folderProjects: Project[]
  onBack: () => void
  onCreateBook: () => void
  renderProjectCard: (project: Project) => ReactNode
}

export function FolderDetailView({
  folder,
  folderProjects,
  onBack,
  onCreateBook,
  renderProjectCard,
}: FolderDetailViewProps) {
  return (
    <>
      <div className="project-hub__folder-detail-header">
        <button
          type="button"
          className="project-hub__folder-back"
          onClick={onBack}
          aria-label="Back to library"
        >
          <ArrowLeft size={16} aria-hidden={true} />
          Library
        </button>
        <div className="project-hub__folder-detail-title">
          <Folder size={20} aria-hidden={true} />
          <h3>{folder.name}</h3>
        </div>
        {folder.description ? (
          <p className="project-hub__folder-detail-desc">{folder.description}</p>
        ) : null}
        <p className="project-hub__folder-detail-count">{folderProjects.length} {folderProjects.length === 1 ? "project" : "projects"}</p>
      </div>

      {folderProjects.length === 0 ? (
        <div className="project-hub__create-row" role="list" aria-label="Create actions in folder">
          <button type="button" className="project-hub__create-card" role="listitem" onClick={onCreateBook}>
            <BookPlus size={28} aria-hidden={true} />
            <span>Create book</span>
          </button>
        </div>
      ) : null}

      {folderProjects.length > 0 ? (
        <ul className="project-hub__grid-view">
          {folderProjects.map((project) => renderProjectCard(project))}
        </ul>
      ) : (
        <p className="project-hub__empty">This folder is empty. Create a project to get started.</p>
      )}
    </>
  )
}
