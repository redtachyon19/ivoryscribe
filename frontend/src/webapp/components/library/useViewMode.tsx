import { useMemo, useState } from "react"
import {
  ArrowDownAZ, ArrowUpAZ,
  BookOpenText, CalendarArrowDown, CalendarArrowUp,
  ClockArrowDown, ClockArrowUp,
  FileText, LayoutGrid, List,
} from "lucide-react"
import type { Project } from "../../../core/projects"

export type ViewMode = "grid" | "list"

export function useViewMode(initial: ViewMode = "grid") {
  const [viewMode, setViewMode] = useState<ViewMode>(initial)
  const toggle = () => setViewMode((prev) => (prev === "list" ? "grid" : "list"))
  return { viewMode, toggle } as const
}

/* ── Sort ── */

const sortModes = [
  "alpha-asc", "alpha-desc",
  "created-desc", "created-asc",
  "context-desc", "context-asc",
] as const
export type SortMode = (typeof sortModes)[number]

const sortIcons: Record<SortMode, React.ReactNode> = {
  "alpha-asc": <ArrowDownAZ size={15} aria-hidden />,
  "alpha-desc": <ArrowUpAZ size={15} aria-hidden />,
  "created-desc": <CalendarArrowDown size={15} aria-hidden />,
  "created-asc": <CalendarArrowUp size={15} aria-hidden />,
  "context-desc": <ClockArrowDown size={15} aria-hidden />,
  "context-asc": <ClockArrowUp size={15} aria-hidden />,
}

const sortLabels: Record<SortMode, string> = {
  "alpha-asc": "Sort A–Z",
  "alpha-desc": "Sort Z–A",
  "created-desc": "Newest created",
  "created-asc": "Oldest created",
  "context-desc": "Newest activity",
  "context-asc": "Oldest activity",
}

export function useSortMode(initial: SortMode = "alpha-asc") {
  const [sortMode, setSortMode] = useState<SortMode>(initial)
  const cycle = () => setSortMode((prev) => {
    const idx = sortModes.indexOf(prev)
    return sortModes[(idx + 1) % sortModes.length]
  })
  return { sortMode, cycleSortMode: cycle } as const
}

export function applySortMode(
  projects: Project[],
  sortMode: SortMode,
  getContextDate: (p: Project) => string,
): Project[] {
  const sorted = [...projects]
  switch (sortMode) {
    case "alpha-asc":
      return sorted.sort((a, b) => a.name.localeCompare(b.name))
    case "alpha-desc":
      return sorted.sort((a, b) => b.name.localeCompare(a.name))
    case "created-desc":
      return sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    case "created-asc":
      return sorted.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    case "context-desc":
      return sorted.sort((a, b) => new Date(getContextDate(b)).getTime() - new Date(getContextDate(a)).getTime())
    case "context-asc":
      return sorted.sort((a, b) => new Date(getContextDate(a)).getTime() - new Date(getContextDate(b)).getTime())
  }
}

export function ViewToggle({
  viewMode, onToggle, sortMode, onCycleSort,
}: {
  viewMode: ViewMode; onToggle: () => void
  sortMode?: SortMode; onCycleSort?: () => void
}) {
  return (
    <div className="project-hub__toolbar">
      <div className="project-hub__toolbar-actions">
        <button
          type="button"
          className="project-hub__view-toggle"
          aria-label={viewMode === "list" ? "Switch to grid view" : "Switch to list view"}
          onClick={onToggle}
        >
          {viewMode === "list" ? <LayoutGrid size={15} aria-hidden={true} /> : <List size={15} aria-hidden={true} />}
        </button>
        {sortMode != null && onCycleSort && (
          <button
            type="button"
            className="project-hub__view-toggle"
            aria-label={sortLabels[sortMode]}
            title={sortLabels[sortMode]}
            onClick={onCycleSort}
          >
            {sortIcons[sortMode]}
          </button>
        )}
      </div>
    </div>
  )
}

export function formatRelativeDate(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return "Just now"
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return "Yesterday"
  if (days < 7) return `${days}d ago`
  const weeks = Math.floor(days / 7)
  if (weeks < 5) return `${weeks}w ago`
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
}

type ProjectListViewProps = {
  projects: Project[]
  ariaLabel: string
  onOpenProject: (projectId: string) => void
  getDate: (project: Project) => string
  onDragStart?: (projectId: string, event: React.DragEvent<HTMLElement>) => void
  selectedIds?: Set<string>
  onContextMenu?: (projectId: string, x: number, y: number) => void
}

export function ProjectListView({ projects, ariaLabel, onOpenProject, getDate, onDragStart, selectedIds, onContextMenu }: ProjectListViewProps) {
  return (
    <div className="project-hub__list-view" aria-label={ariaLabel}>
      {projects.map((project) => (
        <article
          key={project.id}
          data-selectable-id={project.id}
          className={`project-hub__list-row ${selectedIds?.has(project.id) ? "project-hub__list-row--selected" : ""}`.trim()}
          onClick={() => onOpenProject(project.id)}
          role="button"
          tabIndex={0}
          draggable={!!onDragStart}
          onKeyDown={(e) => { if (e.key === "Enter") onOpenProject(project.id) }}
          onDragStart={onDragStart ? (e) => onDragStart(project.id, e) : undefined}
          onContextMenu={onContextMenu ? (e) => { e.preventDefault(); onContextMenu(project.id, e.clientX, e.clientY) } : undefined}
        >
          <div className="project-hub__list-row-main">
            {project.kind === "Book" ? <BookOpenText size={17} aria-hidden={true} /> : <FileText size={17} aria-hidden={true} />}
            <strong>{project.name}</strong>
          </div>
          <span>{project.kind}</span>
          <span>{formatRelativeDate(getDate(project))}</span>
        </article>
      ))}
    </div>
  )
}
