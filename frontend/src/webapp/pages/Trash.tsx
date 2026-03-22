import { useCallback, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react"
import { Pencil, Shredder, SquareArrowOutUpRight, Trash2, Undo2 } from "lucide-react"
import type { Project } from "../../core/projects"
import ProjectCard from "../components/library/ProjectCard"

import { useViewMode, useSortMode, applySortMode, ViewToggle, ProjectListView } from "../components/library/useViewMode"
import ProjectContextMenu, { type ProjectContextMenuState } from "../components/library/ProjectContextMenu"
import TypingConfirmation from "../components/library/TypingConfirmation"
import { splitGraphemes } from "../../core/libraryUtils"
import Modal from "../components/ui/Modal"
import Button from "../components/ui/Button"
import useMultiSelect from "../components/library/useMultiSelect"

type TrashViewProps = {
  projects: Project[]
  setProjects: Dispatch<SetStateAction<Project[]>>
  onOpenProject: (projectId: string) => void
  onOpenProjectInNewTab: (projectId: string) => void
}

export default function TrashView({ projects, setProjects, onOpenProject, onOpenProjectInNewTab }: TrashViewProps) {
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null)
  const { viewMode, toggle: toggleView } = useViewMode()
  const { sortMode, cycleSortMode } = useSortMode("context-desc")
  const [contextMenu, setContextMenu] = useState<ProjectContextMenuState>(null)
  const closeContextMenu = useCallback(() => setContextMenu(null), [])

  /* ── shred-confirmation state ── */
  const [pendingShredIds, setPendingShredIds] = useState<Set<string>>(new Set())
  const [pendingShredName, setPendingShredName] = useState("")
  const [confirmationText, setConfirmationText] = useState("")
  const [confirmationError, setConfirmationError] = useState("")
  const confirmationInputRef = useRef<HTMLInputElement | null>(null)

  const requiredPhrase = pendingShredName ? `I wish to shred ${pendingShredName}` : ""
  const requiredCharacters = splitGraphemes(requiredPhrase)
  const enteredCharacters = splitGraphemes(confirmationText)

  const openShredConfirmation = (projectId: string) => {
    const p = projects.find((entry) => entry.id === projectId)
    setPendingShredIds(new Set([projectId]))
    setPendingShredName(p?.name ?? "")
    setConfirmationText("")
    setConfirmationError("")
  }

  const openMultiShredConfirmation = (ids: Set<string>) => {
    setPendingShredIds(new Set(ids))
    setPendingShredName(`${ids.size} projects`)
    setConfirmationText("")
    setConfirmationError("")
  }

  const closeShredConfirmation = () => {
    setPendingShredIds(new Set())
    setConfirmationText("")
    setConfirmationError("")
  }

  const confirmShred = () => {
    if (pendingShredIds.size === 0) return
    if (confirmationText !== requiredPhrase) {
      setConfirmationError("The confirmation text must match exactly.")
      return
    }
    setProjects((cur) => cur.filter((p) => !pendingShredIds.has(p.id)))
    closeShredConfirmation()
    multiSelect.clearSelection()
  }

  const trashed = useMemo(
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

  const multiSelect = useMultiSelect({
    onDeleteSelection: (ids) => {
      openMultiShredConfirmation(ids)
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
            <Trash2 size={20} aria-hidden={true} />
            <h3>Trash</h3>
          </div>
          <p className="project-hub__folder-detail-desc">Trashed projects can be restored or permanently shredded</p>
          <p className="project-hub__folder-detail-count">{trashed.length} {trashed.length === 1 ? "project" : "projects"}</p>
        </div>

        <ViewToggle viewMode={viewMode} onToggle={toggleView} sortMode={sortMode} onCycleSort={cycleSortMode} />

        {trashed.length > 0 ? (
          viewMode === "list" ? (
            <ProjectListView
              projects={trashed}
              ariaLabel="Trashed projects list"
              onOpenProject={onOpenProject}
              getDate={(p) => p.deletedAt!}
              onDragStart={multiSelect.handleMultiSectionDragStart}
              selectedIds={multiSelect.liveSelectedIds}
              onContextMenu={handleProjectContextMenu}
            />
          ) : (
          <ul className="project-hub__grid-view">
            {trashed.map((project) => (
              <li key={project.id}>
                <ProjectCard
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
              </li>
            ))}
          </ul>
          )
        ) : (
          <p className="project-hub__empty">No trashed projects.</p>
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
                  { label: `Restore ${multiSelect.selectedIds.size} items`, icon: <Undo2 size={14} strokeWidth={2} aria-hidden={true} />, action: () => { for (const id of multiSelect.selectedIds) restoreProject(id); multiSelect.clearSelection() } },
                  { label: `Shred ${multiSelect.selectedIds.size} items`, icon: <Shredder size={14} strokeWidth={2} aria-hidden={true} />, action: () => openMultiShredConfirmation(multiSelect.selectedIds), danger: true },
                ]
              : [
                  { label: "Open in New Tab", icon: <SquareArrowOutUpRight size={14} strokeWidth={2} aria-hidden={true} />, action: () => onOpenProjectInNewTab(contextMenu.projectId) },
                  { label: "Rename", icon: <Pencil size={14} strokeWidth={2} aria-hidden={true} />, action: () => setEditingProjectId(contextMenu.projectId) },
                  { label: "Restore", icon: <Undo2 size={14} strokeWidth={2} aria-hidden={true} />, action: () => restoreProject(contextMenu.projectId) },
                  { label: "Shred", icon: <Shredder size={14} strokeWidth={2} aria-hidden={true} />, action: () => openShredConfirmation(contextMenu.projectId), danger: true },
                ]
          }
        />
      ) : null}

      {pendingShredIds.size > 0 && (
        <Modal
          isOpen={pendingShredIds.size > 0}
          onClose={closeShredConfirmation}
          title={pendingShredIds.size > 1 ? `Shred ${pendingShredName}?` : `Shred \u201c${pendingShredName}\u201d?`}
          panelClassName="project-delete-modal__panel"
          actions={
            <>
              <Button variant="footer" onClick={closeShredConfirmation}>Cancel</Button>
              <Button variant="footer-danger" onClick={confirmShred}>Shred</Button>
            </>
          }
        >
          <p className="project-delete-modal__copy">This action cannot be undone. Type the phrase below to confirm.</p>
          <div className="project-delete-modal__spacer" />

          <TypingConfirmation
            requiredCharacters={requiredCharacters}
            enteredCharacters={enteredCharacters}
            confirmationText={confirmationText}
            inputRef={confirmationInputRef}
            onTextChange={(value) => { setConfirmationText(value); setConfirmationError("") }}
            onConfirm={confirmShred}
          />

          {confirmationError && <p className="project-delete-modal__copy" style={{ color: "#f39a9a", marginTop: 8 }}>{confirmationError}</p>}
        </Modal>
      )}
    </div>
  )
}