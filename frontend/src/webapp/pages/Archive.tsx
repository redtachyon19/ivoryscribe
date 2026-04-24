import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from "react"
import { Archive, ArchiveRestore, Pencil, SquareArrowOutUpRight, Trash2 } from "lucide-react"
import type { Project } from "../../core/projects"
import ProjectCard from "../components/library/ProjectCard"

import { useViewMode, useSortMode, applySortMode, ViewToggle, ProjectListView } from "../components/library/useViewMode"
import ProjectContextMenu, { type ProjectContextMenuState } from "../components/library/ProjectContextMenu"
import useMultiSelect from "../components/library/useMultiSelect"

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
  const [contextMenu, setContextMenu] = useState<ProjectContextMenuState>(null)
  const closeContextMenu = useCallback(() => setContextMenu(null), [])

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

  const trashProject = (projectId: string) => {
    setProjects((cur) => cur.map((p) => p.id === projectId ? { ...p, archivedAt: null, deletedAt: new Date().toISOString() } : p))
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

        <div className="project-hub__main-content">

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
              onDragStart={multiSelect.handleMultiSectionDragStart}
              selectedIds={multiSelect.liveSelectedIds}
              onContextMenu={handleProjectContextMenu}
            />
          ) : (
          <ul className="project-hub__grid-view">
            {archived.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                isDragging={false}
                dropClassName=""
                onOpenProject={onOpenProject}
                onOpenInNewTab={onOpenProjectInNewTab}
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
          <p className="project-hub__empty">No archived projects.</p>
        )}
        </div>
      </div>

      {contextMenu ? (
        <ProjectContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={closeContextMenu}
          actions={
            contextMenu.isMultiSelect
              ? [
                  { label: `Restore ${multiSelect.selectedIds.size} items`, icon: <ArchiveRestore size={14} strokeWidth={2} aria-hidden={true} />, action: () => { for (const id of multiSelect.selectedIds) restoreProject(id); multiSelect.clearSelection() } },
                  { label: `Trash ${multiSelect.selectedIds.size} items`, icon: <Trash2 size={14} strokeWidth={2} aria-hidden={true} />, action: () => { for (const id of multiSelect.selectedIds) trashProject(id); multiSelect.clearSelection() }, danger: true },
                ]
              : [
                  { label: "Open in New Tab", icon: <SquareArrowOutUpRight size={14} strokeWidth={2} aria-hidden={true} />, action: () => onOpenProjectInNewTab(contextMenu.projectId) },
                  { label: "Rename", icon: <Pencil size={14} strokeWidth={2} aria-hidden={true} />, action: () => setEditingProjectId(contextMenu.projectId) },
                  { label: "Restore", icon: <ArchiveRestore size={14} strokeWidth={2} aria-hidden={true} />, action: () => restoreProject(contextMenu.projectId) },
                  { label: "Trash", icon: <Trash2 size={14} strokeWidth={2} aria-hidden={true} />, action: () => trashProject(contextMenu.projectId), danger: true },
                ]
          }
        />
      ) : null}
    </div>
  )
}