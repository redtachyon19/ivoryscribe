import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from "react"
import { Archive, BookCopy, Clock, Trash2 } from "lucide-react"
import type { Project } from "../../core/projects"
import { duplicateProject } from "../../core/libraryUtils"
import ProjectCard from "../components/library/ProjectCard"

import { useViewMode, useSortMode, applySortMode, ViewToggle, ProjectListView } from "../components/library/useViewMode"
import ProjectContextMenu, { buildProjectActions, type ProjectContextMenuState } from "../components/library/ProjectContextMenu"
import useMultiSelect from "../components/library/useMultiSelect"

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

  const sorted = useMemo(
    () => applySortMode(
      projects.filter((p) => !p.archivedAt && !p.deletedAt),
      sortMode,
      (p) => p.createdAt,
    ),
    [projects, sortMode],
  )

  const trashProject = (projectId: string) => {
    setProjects((cur) => cur.map((p) => p.id === projectId ? { ...p, deletedAt: new Date().toISOString() } : p))
  }

  const multiSelect = useMultiSelect({
    onDeleteSelection: (ids) => {
      for (const id of ids) trashProject(id)
    },
  })

  const handleProjectContextMenu = useCallback((projectId: string, x: number, y: number) => {
    if (multiSelect.isMultiSelectTarget(projectId)) {
      setContextMenu({ x, y, projectId, isMultiSelect: true })
    } else {
      setContextMenu({ x, y, projectId })
    }
  }, [multiSelect.isMultiSelectTarget])

  const noop = () => { multiSelect.handleMultiSectionDragEnd() }
  const noopDragEl = (_e: React.DragEvent<HTMLElement>) => {}

  return (
    <div className="project-hub__main">
      <div ref={multiSelect.scrollContainerRef} className={`project-hub__main-scroll ${multiSelect.scrollClassName}`} onMouseDown={multiSelect.handleMouseDown}>
        {multiSelect.isMarqueeActive && multiSelect.marqueeRect ? (
          <div
            className="marquee-selection"
            style={{
              left: multiSelect.marqueeRect.x,
              top: multiSelect.marqueeRect.y,
              width: multiSelect.marqueeRect.width,
              height: multiSelect.marqueeRect.height,
            }}
          />
        ) : null}

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
              onDragStart={multiSelect.handleMultiSectionDragStart}
              selectedIds={multiSelect.liveSelectedIds}
              onContextMenu={handleProjectContextMenu}
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
                  onDragStart={multiSelect.handleMultiSectionDragStart}
                onDragEnd={noop}
                onDragEnter={noopDragEl}
                onDragOver={noopDragEl}
                onDrop={noopDragEl}
                setEditingProjectId={setEditingProjectId}
                editingProjectId={editingProjectId}
                setProjects={setProjects}
                onContextMenu={handleProjectContextMenu}
                marqueeSelected={multiSelect.liveSelectedIds.has(project.id)}
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
          actions={
            contextMenu.isMultiSelect
              ? [
                  { label: `Duplicate ${multiSelect.selectedIds.size} items`, icon: <BookCopy size={14} strokeWidth={2} aria-hidden={true} />, action: () => { for (const id of multiSelect.selectedIds) setProjects((cur) => duplicateProject(cur, id)); multiSelect.clearSelection() } },
                  { label: `Archive ${multiSelect.selectedIds.size} items`, icon: <Archive size={14} strokeWidth={2} aria-hidden={true} />, action: () => { for (const id of multiSelect.selectedIds) setProjects((cur) => cur.map((p) => p.id === id ? { ...p, archivedAt: new Date().toISOString() } : p)); multiSelect.clearSelection() } },
                  { label: `Trash ${multiSelect.selectedIds.size} items`, icon: <Trash2 size={14} strokeWidth={2} aria-hidden={true} />, action: () => { for (const id of multiSelect.selectedIds) trashProject(id); multiSelect.clearSelection() }, danger: true },
                ]
              : buildProjectActions({
                  projectId: contextMenu.projectId,
                  onOpenInNewTab: onOpenProjectInNewTab,
                  onRename: (id) => setEditingProjectId(id),
                  onArchive: (id) => {
                    setProjects((cur) => cur.map((p) => p.id === id ? { ...p, archivedAt: new Date().toISOString() } : p))
                  },
                  onTrash: (id) => trashProject(id),
                })
          }
        />
      ) : null}
    </div>
  )
}