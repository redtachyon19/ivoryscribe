import { useEffect, useRef, useState, type CSSProperties, type DragEvent, type MouseEvent as ReactMouseEvent } from "react"
import { BookText } from "lucide-react"
import { collectTabIds, getProjectEntryTerms, type Project } from "../../../core/projects"

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

function formatRelativeTime(dateValue: string) {
  const parsed = new Date(dateValue)
  if (Number.isNaN(parsed.getTime())) {
    return "—"
  }

  const now = Date.now()
  const diffMs = now - parsed.getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return "Just now"
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay === 1) return "Yesterday"
  if (diffDay < 7) return `${diffDay}d ago`
  const diffWk = Math.floor(diffDay / 7)
  if (diffWk < 5) return `${diffWk}w ago`
  const diffMo = Math.floor(diffDay / 30)
  if (diffMo < 12) return `${diffMo}mo ago`
  return `${Math.floor(diffDay / 365)}y ago`
}

export type ProjectCardProps = {
  project: Project
  isDragging: boolean
  dropClassName: string
  onOpenProject: (projectId: string) => void
  onDragStart: (projectId: string, event: DragEvent<HTMLElement>) => void
  onDragEnd: () => void
  onDragEnter: (event: DragEvent<HTMLElement>) => void
  onDragOver: (event: DragEvent<HTMLElement>) => void
  onDrop: (event: DragEvent<HTMLElement>) => void
  setEditingProjectId: (id: string | null) => void
  editingProjectId: string | null
  setProjects: React.Dispatch<React.SetStateAction<Project[]>>
  onContextMenu?: (projectId: string, x: number, y: number) => void
  marqueeSelected?: boolean
}

export default function ProjectCard({
  project,
  isDragging,
  dropClassName,
  onOpenProject,
  onDragStart,
  onDragEnd,
  onDragEnter,
  onDragOver,
  onDrop,
  setEditingProjectId,
  editingProjectId,
  setProjects,
  onContextMenu,
  marqueeSelected,
}: ProjectCardProps) {
  const [editingName, setEditingName] = useState("")
  const renameTextareaRef = useRef<HTMLTextAreaElement | null>(null)

  const isEditing = editingProjectId === project.id

  const cancelRename = () => {
    setEditingProjectId(null)
    setEditingName("")
  }

  const commitRename = () => {
    if (!isEditing) return

    const trimmed = editingName.trim()
    if (trimmed) {
      setProjects((current) =>
        current.map((p) =>
          p.id === project.id ? { ...p, name: trimmed } : p,
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
    const maxHeight = lineHeight * 2 + verticalPadding
    const nextHeight = Math.min(element.scrollHeight, maxHeight)
    element.style.height = `${nextHeight}px`
    element.style.overflowY = element.scrollHeight > maxHeight ? "auto" : "hidden"
  }

  useEffect(() => {
    if (!isEditing || !renameTextareaRef.current) return
    resizeRenameTextarea(renameTextareaRef.current)
  }, [isEditing, editingName])

  const entryCount = collectTabIds(project.tabs).length
  const { singular, plural } = getProjectEntryTerms(project.kind)
  const entryLabel = entryCount === 1 ? singular.toLowerCase() : plural.toLowerCase()

  const handleProjectCardClick = (event: ReactMouseEvent<HTMLElement>) => {
    if (isEditing) return
    const target = event.target
    if (target instanceof Element && target.closest("button, input, textarea, select, label")) return
    onOpenProject(project.id)
  }

  return (
    <li
      data-selectable-id={project.id}
      className={`project-card ${dropClassName} ${isDragging ? "project-card--dragging" : ""} ${marqueeSelected ? "project-card--marquee-selected" : ""}`.trim()}
      style={
        {
          "--project-accent": project.color,
          "--project-accent-soft": hexToRgba(project.color, 0.14),
        } as CSSProperties
      }
      draggable
      onDragStart={(event) => onDragStart(project.id, event)}
      onDragEnd={() => onDragEnd()}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onClick={handleProjectCardClick}
      onContextMenu={(event) => {
        if (onContextMenu) {
          event.preventDefault()
          onContextMenu(project.id, event.clientX, event.clientY)
        }
      }}
    >
      <div className="project-card__thumb" aria-hidden="true">
        <BookText size={28} strokeWidth={1.6} />
      </div>

      <div className="project-card__info">
        {isEditing ? (
          <div className="project-card__rename-wrap">
            <textarea
              className="project-card__rename-input"
              value={editingName}
              autoFocus
              rows={1}
              ref={(element) => {
                renameTextareaRef.current = element
                if (element) resizeRenameTextarea(element)
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
              onBlur={() => commitRename()}
            />
          </div>
        ) : (
          <strong>{project.name}</strong>
        )}
        <span>{entryCount} {entryLabel} &middot; {formatRelativeTime(project.createdAt)}</span>
      </div>
    </li>
  )
}
