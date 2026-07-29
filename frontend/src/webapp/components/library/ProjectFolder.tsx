import { type DragEvent, type ReactNode } from "react"
import { ArrowLeft, BookPlus, Folder } from "lucide-react"
import type { ProjectFolder as ProjectFolderType } from "../../pages/Library"
import type { Project } from "../../../core/utils/projects"
import MarqueeText from "../ui/MarqueeText"

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
          {folder.iconEmoji ? (
            <span className="project-hub__folder-emoji" aria-hidden={true} style={folder.color ? { color: folder.color } : undefined}>{folder.iconEmoji}</span>
          ) : (
            <Folder size={18} aria-hidden={true} style={folder.color ? { color: folder.color } : undefined} />
          )}
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
              <strong className="project-hub__folder-title" data-marquee-parent>
                <MarqueeText text={folder.name} />
              </strong>
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
  subFolders?: ProjectFolderType[]
  selectedIds?: Set<string>
  backLabel?: string
  onBack: () => void
  onOpenCreateMenu: (anchor: { x: number; y: number; folderId: string }) => void
  onOpenSubFolder?: (folderId: string) => void
  renderProjectCard: (project: Project) => ReactNode
  onFolderDragStart?: (folderId: string, event: DragEvent<HTMLElement>) => void
  onFolderDragEnd?: () => void
  onFolderDragOver?: (folder: ProjectFolderType) => (event: DragEvent<HTMLElement>) => void
  onFolderDrop?: (folder: ProjectFolderType) => (event: DragEvent<HTMLElement>) => void
  getFolderDropClassName?: (folderId: string) => string
  getFolderReorderClassName?: (folderId: string) => string
  onUnnestFolderDrop?: (event: DragEvent<HTMLElement>) => void
  onUnnestFolderDragOver?: (event: DragEvent<HTMLElement>) => void
  onUnnestFolderDragLeave?: (event: DragEvent<HTMLElement>) => void
  isUnnestDropActive?: boolean
}

export function FolderDetailView({
  folder,
  folderProjects,
  subFolders = [],
  selectedIds,
  backLabel = "Library",
  onBack,
  onOpenCreateMenu,
  onOpenSubFolder,
  renderProjectCard,
  onFolderDragStart,
  onFolderDragEnd,
  onFolderDragOver,
  onFolderDrop,
  getFolderDropClassName,
  getFolderReorderClassName,
  onUnnestFolderDrop,
  onUnnestFolderDragOver,
  onUnnestFolderDragLeave,
  isUnnestDropActive,
}: FolderDetailViewProps) {
  const isEmpty = folderProjects.length === 0 && subFolders.length === 0
  return (
    <>
      <div className="project-hub__folder-detail-header">
        <button
          type="button"
          className={`project-hub__folder-back ${isUnnestDropActive ? "project-hub__folder-back--drop-active" : ""}`.trim()}
          onClick={onBack}
          aria-label={`Back to ${backLabel}`}
          onDragOver={onUnnestFolderDragOver}
          onDragLeave={onUnnestFolderDragLeave}
          onDrop={onUnnestFolderDrop}
        >
          <ArrowLeft size={16} aria-hidden={true} />
          {backLabel}
        </button>
        <div className="project-hub__folder-detail-title">
          {folder.iconEmoji ? (
            <span className="project-hub__folder-detail-emoji" aria-hidden={true} style={folder.color ? { color: folder.color } : undefined}>{folder.iconEmoji}</span>
          ) : (
            <Folder size={20} aria-hidden={true} style={folder.color ? { color: folder.color } : undefined} />
          )}
          <h3>{folder.name}</h3>
        </div>
        {folder.description ? (
          <p className="project-hub__folder-detail-desc">{folder.description}</p>
        ) : null}
        <p className="project-hub__folder-detail-count">
          {subFolders.length > 0 ? `${subFolders.length} ${subFolders.length === 1 ? "folder" : "folders"} · ` : ""}
          {folderProjects.length} {folderProjects.length === 1 ? "project" : "projects"}
        </p>
      </div>

      {subFolders.length > 0 ? (
        <div className="project-hub__folders-grid" aria-label="Sub-folders">
          {subFolders.map((sub) => (
            <article
              key={sub.id}
              data-selectable-id={sub.id}
              className={`project-hub__folder-card ${getFolderDropClassName?.(sub.id) ?? ""} ${getFolderReorderClassName?.(sub.id) ?? ""} ${selectedIds?.has(sub.id) ? "project-hub__folder-card--marquee-selected" : ""}`.trim()}
              role="button"
              tabIndex={0}
              draggable={!!onFolderDragStart}
              onClick={() => onOpenSubFolder?.(sub.id)}
              onKeyDown={(e) => { if (e.key === "Enter") onOpenSubFolder?.(sub.id) }}
              onDragStart={onFolderDragStart ? (e) => onFolderDragStart(sub.id, e) : undefined}
              onDragEnd={onFolderDragEnd}
              onDragOver={onFolderDragOver?.(sub)}
              onDrop={onFolderDrop?.(sub)}
            >
              {sub.iconEmoji ? (
                <span className="project-hub__folder-emoji" aria-hidden={true} style={sub.color ? { color: sub.color } : undefined}>{sub.iconEmoji}</span>
              ) : (
                <Folder size={18} aria-hidden={true} style={sub.color ? { color: sub.color } : undefined} />
              )}
              <div>
                <strong className="project-hub__folder-title" data-marquee-parent>
                  <MarqueeText text={sub.name} />
                </strong>
                <span>Folder</span>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {isEmpty ? (
        <div className="project-hub__create-row" role="list" aria-label="Create actions in folder">
          <button
            type="button"
            className="project-hub__create-card"
            role="listitem"
            aria-haspopup="menu"
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect()
              onOpenCreateMenu({ x: rect.left, y: rect.bottom + 6, folderId: folder.id })
            }}
          >
            <BookPlus size={28} aria-hidden={true} />
            <span>Create project</span>
          </button>
        </div>
      ) : null}

      {folderProjects.length > 0 ? (
        <ul className="project-hub__grid-view">
          {folderProjects.map((project) => renderProjectCard(project))}
        </ul>
      ) : subFolders.length === 0 ? (
        <p className="project-hub__empty">This folder is empty. Create a project to get started.</p>
      ) : null}
    </>
  )
}
