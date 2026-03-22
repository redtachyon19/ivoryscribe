import { useMemo, useState, type Dispatch, type SetStateAction } from "react"
import { Archive, ArchiveRestore, Trash2 } from "lucide-react"
import type { Project } from "../../core/projects"
import ProjectCard from "../components/library/ProjectCard"
import { handleSectionDragStart } from "../components/library/useSectionDrop"
import { useViewMode, useSortMode, applySortMode, ViewToggle, ProjectListView } from "../components/library/useViewMode"

type ArchiveViewProps = {
  projects: Project[]
  setProjects: Dispatch<SetStateAction<Project[]>>
  onOpenProject: (projectId: string) => void
  onOpenProjectInNewTab: (projectId: string) => void
}

export default function ArchiveView({ projects, setProjects, onOpenProject, onOpenProjectInNewTab }: ArchiveViewProps) {
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null)
  const { viewMode, toggle: toggleView } = useViewMode()
  const { sortMode, cycleSortMode } = useSortMode("context-desc")

  const archived = useMemo(
    () => applySortMode(
      projects.filter((p) => p.archivedAt && !p.deletedAt),
      sortMode,
      (p) => p.archivedAt!,
    ),
    [projects, sortMode],
  )

  const restoreProject = (projectId: string) => {
    setProjects((cur) => cur.map((p) => p.id === projectId ? { ...p, archivedAt: null } : p))
  }

  const deleteProject = (projectId: string) => {
    setProjects((cur) => cur.map((p) => p.id === projectId ? { ...p, archivedAt: null, deletedAt: new Date().toISOString() } : p))
  }

  const noop = () => {}
  const noopDragEl = (_e: React.DragEvent<HTMLElement>) => {}

  return (
    <div className="project-hub__main">
      <div className="project-hub__main-scroll">
        <div className="project-hub__folder-detail-header">
          <div className="project-hub__folder-detail-title">
            <Archive size={20} aria-hidden={true} />
            <h3>Archive</h3>
          </div>
          <p className="project-hub__folder-detail-desc">Projects you&apos;ve set aside for later</p>
          <p className="project-hub__folder-detail-count">{archived.length} {archived.length === 1 ? "project" : "projects"}</p>
        </div>

        <ViewToggle viewMode={viewMode} onToggle={toggleView} sortMode={sortMode} onCycleSort={cycleSortMode} />

        {archived.length > 0 ? (
          viewMode === "list" ? (
            <ProjectListView
              projects={archived}
              ariaLabel="Archived projects list"
              onOpenProject={onOpenProject}
              getDate={(p) => p.archivedAt!}
              onDragStart={handleSectionDragStart}
            />
          ) : (
          <ul className="project-hub__grid-view">
            {archived.map((project) => (
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
                    <ArchiveRestore size={13} aria-hidden={true} />
                    Restore
                  </button>
                  <button type="button" onClick={() => deleteProject(project.id)} aria-label={`Delete ${project.name}`}>
                    <Trash2 size={13} aria-hidden={true} />
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
          )
        ) : (
          <p className="project-hub__empty">No archived projects.</p>
        )}
      </div>
    </div>
  )
}