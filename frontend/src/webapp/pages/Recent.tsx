import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from "react"
import { Clock } from "lucide-react"
import type { Project } from "../../core/projects"
import ProjectCard from "../components/library/ProjectCard"
import { handleSectionDragStart } from "../components/library/useSectionDrop"
import { useViewMode, useSortMode, applySortMode, ViewToggle, ProjectListView } from "../components/library/useViewMode"
import ProjectContextMenu, { buildProjectActions, type ProjectContextMenuState } from "../components/library/ProjectContextMenu"

type RecentViewProps = {
  projects: Project[]
  setProjects: Dispatch<SetStateAction<Project[]>>
  onOpenProject: (projectId: string) => void
  onOpenProjectInNewTab: (projectId: string) => void
}

export default function RecentView({ projects, setProjects, onOpenProject, onOpenProjectInNewTab }: RecentViewProps) {
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null)
  const { viewMode, toggle: toggleView } = useViewMode()
  const { sortMode, cycleSortMode } = useSortMode("context-desc")
  const [contextMenu, setContextMenu] = useState<ProjectContextMenuState>(null)
  const closeContextMenu = useCallback(() => setContextMenu(null), [])
  const handleProjectContextMenu = useCallback((projectId: string, x: number, y: number) => {
    setContextMenu({ x, y, projectId })
  }, [])

  const sorted = useMemo(
    () => applySortMode(
      projects.filter((p) => !p.archivedAt && !p.deletedAt),
      sortMode,
      (p) => p.createdAt,
    ),
    [projects, sortMode],
  )

  const noop = () => {}
  const noopDragEl = (_e: React.DragEvent<HTMLElement>) => {}

  return (
    <div className="project-hub__main">
      <div className="project-hub__main-scroll">
        <div className="project-hub__folder-detail-header">
          <div className="project-hub__folder-detail-title">
            <Clock size={20} aria-hidden={true} />
            <h3>Recently Opened</h3>
          </div>
          <p className="project-hub__folder-detail-desc">Your projects, sorted by most recently opened</p>
          <p className="project-hub__folder-detail-count">{sorted.length} {sorted.length === 1 ? "project" : "projects"}</p>
        </div>

        <ViewToggle viewMode={viewMode} onToggle={toggleView} sortMode={sortMode} onCycleSort={cycleSortMode} />

        {sorted.length > 0 ? (
          viewMode === "list" ? (
            <ProjectListView
              projects={sorted}
              ariaLabel="Recent projects list"
              onOpenProject={onOpenProject}
              getDate={(p) => p.createdAt}
              onDragStart={handleSectionDragStart}
            />
          ) : (
          <ul className="project-hub__grid-view">
            {sorted.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                isDragging={false}
                dropClassName=""
                onOpenProject={onOpenProject}
                onDragStart={handleSectionDragStart}
                onDragEnd={noop}
                onDragEnter={noopDragEl}
                onDragOver={noopDragEl}
                onDrop={noopDragEl}
                setEditingProjectId={setEditingProjectId}
                editingProjectId={editingProjectId}
                setProjects={setProjects}
                onContextMenu={handleProjectContextMenu}
              />
            ))}
          </ul>
          )
        ) : (
          <p className="project-hub__empty">No projects yet. Create one to begin writing.</p>
        )}
      </div>

      {contextMenu ? (
        <ProjectContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={closeContextMenu}
          actions={buildProjectActions({
            projectId: contextMenu.projectId,
            onOpenInNewTab: onOpenProjectInNewTab,
            onRename: (id) => setEditingProjectId(id),
            onArchive: (id) => {
              setProjects((cur) => cur.map((p) => p.id === id ? { ...p, archivedAt: new Date().toISOString() } : p))
            },
            onTrash: (id) => {
              setProjects((cur) => cur.map((p) => p.id === id ? { ...p, deletedAt: new Date().toISOString() } : p))
            },
          })}
        />
      ) : null}
    </div>
  )
}