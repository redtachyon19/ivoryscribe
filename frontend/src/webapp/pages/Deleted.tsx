import { useMemo, useState, type Dispatch, type SetStateAction } from "react"
import { Trash2, Undo2 } from "lucide-react"
import type { Project } from "../../core/projects"
import ProjectCard from "../components/library/ProjectCard"
import { handleSectionDragStart } from "../components/library/useSectionDrop"
import { useViewMode, useSortMode, applySortMode, ViewToggle, ProjectListView } from "../components/library/useViewMode"

type DeletedViewProps = {
  projects: Project[]
  setProjects: Dispatch<SetStateAction<Project[]>>
  onOpenProject: (projectId: string) => void
  onOpenProjectInNewTab: (projectId: string) => void
}

export default function DeletedView({ projects, setProjects, onOpenProject, onOpenProjectInNewTab }: DeletedViewProps) {
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null)
  const { viewMode, toggle: toggleView } = useViewMode()
  const { sortMode, cycleSortMode } = useSortMode("context-desc")

  const deleted = useMemo(
    () => applySortMode(
      projects.filter((p) => p.deletedAt),
      sortMode,
      (p) => p.deletedAt!,
    ),
    [projects, sortMode],
  )

  const restoreProject = (projectId: string) => {
    setProjects((cur) => cur.map((p) => p.id === projectId ? { ...p, deletedAt: null } : p))
  }

  const permanentlyDelete = (projectId: string) => {
    setProjects((cur) => cur.filter((p) => p.id !== projectId))
  }

  const noop = () => {}
  const noopDragEl = (_e: React.DragEvent<HTMLElement>) => {}

  return (
    <div className="project-hub__main">
      <div className="project-hub__main-scroll">
        <div className="project-hub__folder-detail-header">
          <div className="project-hub__folder-detail-title">
            <Trash2 size={20} aria-hidden={true} />
            <h3>Recently Deleted</h3>
          </div>
          <p className="project-hub__folder-detail-desc">Deleted projects can be restored or permanently removed</p>
          <p className="project-hub__folder-detail-count">{deleted.length} {deleted.length === 1 ? "project" : "projects"}</p>
        </div>

        <ViewToggle viewMode={viewMode} onToggle={toggleView} sortMode={sortMode} onCycleSort={cycleSortMode} />

        {deleted.length > 0 ? (
          viewMode === "list" ? (
            <ProjectListView
              projects={deleted}
              ariaLabel="Deleted projects list"
              onOpenProject={onOpenProject}
              getDate={(p) => p.deletedAt!}
              onDragStart={handleSectionDragStart}
            />
          ) : (
          <ul className="project-hub__grid-view">
            {deleted.map((project) => (
              <li key={project.id} className="project-hub__card-with-actions">
                <ProjectCard
                  project={project}
                  isDragging={false}
                  dropClassName=""
                  openProjectSettingsId={null}
                  onOpenProject={onOpenProject}
                  onOpenProjectInNewTab={onOpenProjectInNewTab}
                  onOpenProjectSettings={noop}
                  onCloseProjectSettings={noop}
                  onDragStart={handleSectionDragStart}
                  onDragEnd={noop}
                  onDragEnter={noopDragEl}
                  onDragOver={noopDragEl}
                  onDrop={noopDragEl}
                  setEditingProjectId={setEditingProjectId}
                  editingProjectId={editingProjectId}
                  setProjects={setProjects}
                />
                <div className="project-hub__card-actions">
                  <button type="button" onClick={() => restoreProject(project.id)} aria-label={`Restore ${project.name}`}>
                    <Undo2 size={13} aria-hidden={true} />
                    Restore
                  </button>
                  <button type="button" onClick={() => permanentlyDelete(project.id)} aria-label={`Permanently delete ${project.name}`}>
                    <Trash2 size={13} aria-hidden={true} />
                    Delete forever
                  </button>
                </div>
              </li>
            ))}
          </ul>
          )
        ) : (
          <p className="project-hub__empty">No deleted projects.</p>
        )}
      </div>
    </div>
  )
}