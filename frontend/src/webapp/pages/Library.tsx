import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react"
import { Archive, BookCopy, BookOpenText, BookPlus, Folder, FolderPlus, LibraryBig as LibraryIcon, ScrollText, Trash2 } from "lucide-react"
import Button from "../components/ui/Button"
import Modal from "../components/ui/Modal"
import { PROJECTS_CREATE_BOOK_EVENT, PROJECTS_CREATE_FOLDER_EVENT } from "../../core/events/editorEvents"
import { exportProjectAsPdf } from "../components/export/pdfExport"
import { exportProjectAsDocx } from "../components/export/docxExport"
import { downloadProjectAsMarkdown } from "../components/export/markdownExport"
import { exportProjectAsTxt } from "../components/export/txtExport"
import { collectTabIds, createProject, generateUntitledName, type Project } from "../../core/utils/projects"
import { createLocalId, duplicateProject } from "../../core/utils/libraryUtils"
import type { VersionSettingsEntry } from "../../core/state/versioning"
import ProjectSettings from "../components/settings/ProjectSettings"
import ProjectCard from "../components/library/ProjectCard"
import { FolderDetailView } from "../components/library/ProjectFolder"
import ProjectFolderGrid from "../components/library/ProjectFolder"
import useProjectDrag from "../components/library/useProjectDrag"
import useProjectSettings from "../components/library/useProjectSettings"
import { useViewMode, ViewToggle, formatRelativeDate } from "../components/library/useViewMode"
import ProjectContextMenu, { buildCreateProjectActions, buildProjectActions, buildFolderActions, buildMultiSelectActions } from "../components/library/ProjectContextMenu"
import FolderSettingsModal from "../components/library/FolderSettingsModal"
import { setFolderMeta } from "../../core/state/folderMetaStorage"
import useMultiSelect from "../components/library/useMultiSelect"
import ShareDialog from "../components/settings/ShareDialog"
import ShareRequestList from "../components/library/ShareRequestList"
import type { PendingShareRequest } from "../../core/api"
import "./Library.css"

type LibraryContextMenuState =
  | null
  | { x: number; y: number; kind: "background" }
  | { x: number; y: number; kind: "item"; projectId: string; isFolder?: boolean; isMultiSelect?: boolean }

export type ProjectFolder = {
  id: string
  name: string
  description: string
  /** Parent folder id, or null for top-level folders. Allows nested folders
   *  to be hidden until the user navigates into their parent. */
  parentFolderId?: string | null
  /** Hex color (`#RRGGBB`) tinting the folder's icon and accents. Empty /
   *  undefined renders with the default editor-text color. */
  color?: string | null
  /** Single emoji that replaces the default Folder icon when set. */
  iconEmoji?: string | null
}

export type LibraryProps = {
  sessionToken: string
  projects: Project[]
  folders: ProjectFolder[]
  activeProjectId: string | null
  bookCounter: number
  projectDocumentMap: Record<string, string>
  setBookCounter: Dispatch<SetStateAction<number>>
  onOpenProject: (projectId: string) => void
  onOpenProjectInNewTab: (projectId: string) => void
  onProjectCreated?: (project: Project) => void
  activeProjectVersionsByProjectId?: Record<string, VersionSettingsEntry[]>
  onShowVersionHistory?: (projectId: string) => void
  setProjects: Dispatch<SetStateAction<Project[]>>
  setFolders: Dispatch<SetStateAction<ProjectFolder[]>>
  setActiveProjectId: Dispatch<SetStateAction<string | null>>
  pendingShareRequests: PendingShareRequest[]
  onAcceptShareRequest: (shareId: string) => void
  onRejectShareRequest: (shareId: string) => void
  onRefreshPendingShareRequests: () => void
  userEmail?: string
  sharedProjectIds?: Set<string>
  ownerEmailByProjectId?: Map<string, string>
  /** Local mode: upload the local file as a cloud Document and return its id.
   *  Returns null if the user needs to sign in (the orchestrator handles
   *  showing the auth overlay). Returns the existing id if already shared. */
  onEnableCloudSharing?: (projectId: string) => Promise<string | null>
  /** Upload a local project to cloud and trash its local file. */
  onMoveProjectToCloud?: (projectId: string) => Promise<string | null>
  onCopyProjectPath?: (projectId: string) => void
  onShowProjectInFinder?: (projectId: string) => void
  /** Local-only: spawn a new BrowserWindow whose workspace root is the
   *  folder's on-disk directory. Wired by the orchestration when the
   *  local FS handle is available; cloud-only folders pass undefined. */
  onOpenFolderInNewWindow?: (folderId: string) => void
  /** macOS-only: paint the folder's Finder color label to match the
   *  in-app color the user just picked. */
  onApplyFolderFinderColor?: (folderId: string, color: string | null | undefined) => void
}

export default function Library({
  sessionToken,
  projects,
  folders,
  activeProjectId,
  bookCounter,
  projectDocumentMap,
  onOpenProject,
  onOpenProjectInNewTab,
  onProjectCreated,
  activeProjectVersionsByProjectId = {},
  onShowVersionHistory,
  setProjects,
  setFolders,
  setActiveProjectId,
  pendingShareRequests,
  onAcceptShareRequest,
  onRejectShareRequest,
  userEmail,
  sharedProjectIds,
  ownerEmailByProjectId,
  onEnableCloudSharing,
  onMoveProjectToCloud,
  onCopyProjectPath,
  onShowProjectInFinder,
  onOpenFolderInNewWindow,
  onApplyFolderFinderColor,
}: LibraryProps) {
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null)
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null)
  const [folderSettingsId, setFolderSettingsId] = useState<string | null>(null)
  const folderSettingsTarget = folderSettingsId ? folders.find((f) => f.id === folderSettingsId) ?? null : null
  const [editingFolderName, setEditingFolderName] = useState("")
  const { viewMode, toggle: toggleView } = useViewMode()
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [openFolderId, setOpenFolderId] = useState<string | null>(null)
  const [shareDialogProjectId, setShareDialogProjectId] = useState<string | null>(null)

  const activeProjects = projects.filter((p) => !p.archivedAt && !p.deletedAt)
  const openFolder = openFolderId ? folders.find((f) => f.id === openFolderId) ?? null : null
  const folderProjects = openFolderId ? activeProjects.filter((p) => p.folderId === openFolderId) : []
  // Top-level folders (no parent) for the root library view; sub-folders of
  // the currently open folder for the folder-detail view. Folders that come
  // from disk-walked subdirectories carry a parentFolderId so we can keep
  // them hidden until the user navigates in.
  const topLevelFolders = useMemo(
    () => folders.filter((f) => !f.parentFolderId),
    [folders],
  )
  const childFolders = useMemo(
    () => (openFolderId ? folders.filter((f) => f.parentFolderId === openFolderId) : []),
    [folders, openFolderId],
  )

  const drag = useProjectDrag({ projects: activeProjects, folders, setProjects, setFolders })
  const settings = useProjectSettings({ projects, setProjects })
  const settingsProjectId = settings.settingsProject?.id ?? null

  const shareDialogProject = shareDialogProjectId ? projects.find((p) => p.id === shareDialogProjectId) ?? null : null
  const shareDialogDocumentId = shareDialogProjectId ? (projectDocumentMap[shareDialogProjectId] ?? null) : null

  // Open the share dialog regardless of whether the project has a cloud-id
  // yet. The dialog handles the "not yet shared" case with an upload CTA that
  // calls onEnableCloudSharing — which prompts sign-in if needed.
  const openShareDialog = (projectId: string) => {
    setShareDialogProjectId(projectId)
  }

  const moveToTrash = (projectId: string) => {
    setProjects((cur) => cur.map((p) => p.id === projectId ? { ...p, deletedAt: new Date().toISOString() } : p))
    setActiveProjectId((currentId) => {
      if (currentId !== projectId) return currentId
      const available = projects.filter((p) => p.id !== projectId && !p.deletedAt && !p.archivedAt)
      return available[0]?.id ?? null
    })
  }

  const folderIdSet = useMemo(() => new Set(folders.map((f) => f.id)), [folders])

  const multiSelect = useMultiSelect({
    onDeleteSelection: (ids) => {
      for (const id of ids) {
        if (folderIdSet.has(id)) {
          setProjects((cur) => cur.map((p) => p.folderId === id ? { ...p, folderId: null } : p))
          setFolders((cur) => cur.filter((f) => f.id !== id))
        } else {
          moveToTrash(id)
        }
      }
    },
    drag,
    folderIds: folderIdSet,
    setProjects,
  })

  const [contextMenu, setContextMenu] = useState<LibraryContextMenuState>(null)
  const closeContextMenu = useCallback(() => setContextMenu(null), [])
  /** Anchor for the kind-picker that opens from the empty-state "Create"
   *  card. Reuses the same ProjectContextMenu component as right-click
   *  menus so spacing/keyboard/dismiss behaviour is identical. */
  const [createKindMenu, setCreateKindMenu] = useState<{ x: number; y: number; folderId?: string } | null>(null)
  const closeCreateKindMenu = useCallback(() => setCreateKindMenu(null), [])

  const handleProjectContextMenu = useCallback((projectId: string, x: number, y: number) => {
    if (multiSelect.isMultiSelectTarget(projectId)) {
      setContextMenu({ x, y, kind: "item", projectId, isMultiSelect: true })
    } else {
      setContextMenu({ x, y, kind: "item", projectId })
    }
  }, [multiSelect.isMultiSelectTarget])

  const handleFolderContextMenu = useCallback((folderId: string, x: number, y: number) => {
    if (multiSelect.isMultiSelectTarget(folderId)) {
      setContextMenu({ x, y, kind: "item", projectId: folderId, isMultiSelect: true })
    } else {
      setContextMenu({ x, y, kind: "item", projectId: folderId, isFolder: true })
    }
  }, [multiSelect.isMultiSelectTarget])

  const handleLibraryBackgroundContextMenu = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null
    if (!target) return

    if (target.closest("[data-selectable-id]")) return
    if (target.closest("button, a, input, textarea, [contenteditable='true']")) return

    event.preventDefault()
    setContextMenu({ x: event.clientX, y: event.clientY, kind: "background" })
  }, [])

  const startFolderRename = (folderId: string) => {
    const folder = folders.find((f) => f.id === folderId)
    if (!folder) return
    setEditingFolderId(folderId)
    setEditingFolderName(folder.name)
  }

  const commitFolderRename = () => {
    if (!editingFolderId) return
    const trimmed = editingFolderName.trim()
    if (trimmed) {
      setFolders((cur) => cur.map((f) => f.id === editingFolderId ? { ...f, name: trimmed } : f))
    }
    setEditingFolderId(null)
    setEditingFolderName("")
  }

  const cancelFolderRename = () => {
    setEditingFolderId(null)
    setEditingFolderName("")
  }

  const createNewProject = (kind: import("../../core/utils/projects").ProjectKind = "Book", folderId?: string) => {
    const nextName = generateUntitledName(projects, kind)
    const nextProject = createProject(nextName, kind)
    setProjects((cur) => [{ ...nextProject, folderId: folderId ?? null, rootPosition: folderId ? nextProject.rootPosition : "top" }, ...cur])
    setActiveProjectId(nextProject.id)
    setSelectedProjectId(nextProject.id)
    onProjectCreated?.(nextProject)
  }

  const createFolder = () => {
    const nextIndex = folders.length + 1
    const newFolder: ProjectFolder = {
      id: createLocalId(),
      name: `Folder ${nextIndex}`,
      description: "Add a folder description here. You don't have the memory of an elephant.",
    }
    setFolders((current) => [newFolder, ...current])
  }

  // Global create events from the menu bar. The CREATE_BOOK event now
  // carries an optional `kind` so the same channel can request
  // Presentation/Markdown/PlainText projects too. Missing detail → Book.
  useEffect(() => {
    const handleCreateProject = (event: Event) => {
      const detail = (event as CustomEvent<import("../../core/events/editorEvents").CreateProjectEventDetail>).detail
      createNewProject(detail?.kind ?? "Book")
    }
    const handleCreateFolder = () => createFolder()

    window.addEventListener(PROJECTS_CREATE_BOOK_EVENT, handleCreateProject as EventListener)
    window.addEventListener(PROJECTS_CREATE_FOLDER_EVENT, handleCreateFolder)

    return () => {
      window.removeEventListener(PROJECTS_CREATE_BOOK_EVENT, handleCreateProject as EventListener)
      window.removeEventListener(PROJECTS_CREATE_FOLDER_EVENT, handleCreateFolder)
    }
  }, [bookCounter, folders.length])

  const renderProjectCard = (project: Project) => (
    <ProjectCard
      key={project.id}
      project={project}
      isDragging={drag.draggingProjectId === project.id || multiSelect.isMultiDragging(project.id, drag.draggingProjectId)}
      dropClassName={drag.getProjectDropClassName(project.id)}
      onOpenProject={onOpenProject}
      onOpenInNewTab={onOpenProjectInNewTab}
      onDragStart={multiSelect.handleMultiDragStart}
      onDragEnd={multiSelect.handleMultiDragEnd}
      onDragEnter={drag.updateProjectDropTarget(project)}
      onDragOver={drag.updateProjectDropTarget(project)}
      onDrop={multiSelect.handleMultiCardDrop(project)}
      setEditingProjectId={setEditingProjectId}
      editingProjectId={editingProjectId}
      setProjects={setProjects}
      onContextMenu={handleProjectContextMenu}
      marqueeSelected={multiSelect.liveSelectedIds.has(project.id)}
      // Cloud chip is driven by `project.source === "cloud"` inside the
      // card. We only need to tell it about share state here — a cloud
      // project that's also shared shows the Users icon instead of the
      // plain Cloud icon. Local projects ignore both signals.
      isShared={Boolean(sharedProjectIds?.has(project.id))}
    />
  )

  return (
    <>
      <div className={`project-hub__main ${settings.isOpen ? "project-hub__main--blurred" : ""}`.trim()}>
        <div
          ref={multiSelect.scrollContainerRef}
          className={`project-hub__main-scroll ${multiSelect.scrollClassName}`}
          onMouseDown={multiSelect.handleMouseDown}
          onContextMenu={handleLibraryBackgroundContextMenu}
        >
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
            {openFolder ? (
              <FolderDetailView
                folder={openFolder}
                folderProjects={folderProjects}
                subFolders={childFolders}
                backLabel={openFolder.parentFolderId ? folders.find((f) => f.id === openFolder.parentFolderId)?.name ?? "Library" : "Library"}
                onBack={() => setOpenFolderId(openFolder.parentFolderId ?? null)}
                onOpenCreateMenu={(anchor) => setCreateKindMenu(anchor)}
                onOpenSubFolder={(id) => setOpenFolderId(id)}
                renderProjectCard={renderProjectCard}
                onFolderDragStart={drag.handleFolderDragStart}
                onFolderDragEnd={drag.handleFolderDragEnd}
                onFolderDragOver={drag.handleFolderItemDragOver}
                onFolderDrop={multiSelect.handleMultiFolderDrop}
                getFolderDropClassName={drag.getFolderDropClassName}
                getFolderReorderClassName={drag.getFolderReorderClassName}
                isUnnestDropActive={!!drag.draggingFolderId}
                onUnnestFolderDragOver={(e) => {
                  if (!drag.draggingFolderId) return
                  e.preventDefault()
                  e.stopPropagation()
                }}
                onUnnestFolderDrop={(e) => {
                  if (!drag.draggingFolderId) return
                  e.preventDefault()
                  e.stopPropagation()
                  // Un-nest: move the dragged folder so its parent is this
                  // folder's parent (one level up). Cycle-safe by construction
                  // because we're moving UP the tree.
                  drag.moveFolderIntoFolder(drag.draggingFolderId, openFolder.parentFolderId ?? null)
                  drag.handleFolderDragEnd()
                }}
              />
            ) : (
              <>
            {/* Header */}
            <div className="project-hub__folder-detail-header">
              <div className="project-hub__folder-detail-title">
                <LibraryIcon size={20} aria-hidden={true} />
                <h3>Library</h3>
              </div>
              <p className="project-hub__folder-detail-desc">Your herd of projects, organized in one place</p>
              <p className="project-hub__folder-detail-count">{activeProjects.length} {activeProjects.length === 1 ? "project" : "projects"}</p>
            </div>

            {/* Toolbar */}
            <ViewToggle viewMode={viewMode} onToggle={toggleView} />

            {/* Share Requests */}
            {pendingShareRequests.length > 0 ? (
              <ShareRequestList
                requests={pendingShareRequests}
                onAccept={onAcceptShareRequest}
                onReject={onRejectShareRequest}
              />
            ) : null}

            {/* Folders — only top-level here; nested folders show inside their parent. */}
            {viewMode === "list" ? (
              topLevelFolders.length > 0 ? (
                <div className="project-hub__list-view" aria-label="Library folders list">
                  {topLevelFolders.map((folder) => (
                    <article
                      key={folder.id}
                      data-selectable-id={folder.id}
                      className={`project-hub__list-row project-hub__list-row--folder ${multiSelect.liveSelectedIds.has(folder.id) ? "project-hub__list-row--selected" : ""} ${drag.getFolderDropClassName(folder.id)} ${drag.getFolderReorderClassName(folder.id)}`.trim()}
                      onClick={() => { if (editingFolderId !== folder.id) setOpenFolderId(folder.id) }}
                      role="button"
                      tabIndex={0}
                      draggable
                      onKeyDown={(e) => { if (e.key === "Enter" && editingFolderId !== folder.id) setOpenFolderId(folder.id) }}
                      onDragStart={(e) => drag.handleFolderDragStart(folder.id, e)}
                      onDragEnd={drag.handleFolderDragEnd}
                      onDragOver={drag.handleFolderItemDragOver(folder)}
                      onDrop={multiSelect.handleMultiFolderDrop(folder)}
                      onContextMenu={(e) => {
                        e.preventDefault()
                        handleFolderContextMenu(folder.id, e.clientX, e.clientY)
                      }}
                    >
                      <div className="project-hub__list-row-main">
                        <Folder size={17} aria-hidden={true} />
                        {editingFolderId === folder.id ? (
                          <input
                            className="project-hub__folder-rename-input"
                            value={editingFolderName}
                            autoFocus
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => setEditingFolderName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") { e.preventDefault(); commitFolderRename() }
                              if (e.key === "Escape") { e.preventDefault(); cancelFolderRename() }
                            }}
                            onBlur={commitFolderRename}
                          />
                        ) : (
                          <strong>{folder.name}</strong>
                        )}
                      </div>
                      <span>Folder</span>
                      <span>{activeProjects.filter((p) => p.folderId === folder.id).length} projects</span>
                    </article>
                  ))}
                </div>
              ) : null
            ) : (
              <ProjectFolderGrid
                folders={topLevelFolders}
                projects={activeProjects}
                onOpenFolder={setOpenFolderId}
                onFolderDragStart={drag.handleFolderDragStart}
                onFolderDragEnd={drag.handleFolderDragEnd}
                onFolderDragOver={drag.handleFolderItemDragOver}
                onFolderDrop={multiSelect.handleMultiFolderDrop}
                getFolderDropClassName={drag.getFolderDropClassName}
                getFolderReorderClassName={drag.getFolderReorderClassName}
                onFolderContextMenu={handleFolderContextMenu}
                selectedIds={multiSelect.liveSelectedIds}
                editingFolderId={editingFolderId}
                editingFolderName={editingFolderName}
                onEditingFolderNameChange={setEditingFolderName}
                onCommitFolderRename={commitFolderRename}
                onCancelFolderRename={cancelFolderRename}
              />
            )}

            {/* Projects — List View */}
            {viewMode === "list" ? (
              activeProjects.filter((p) => !p.folderId).length > 0 ? (
                <div className="project-hub__list-view" aria-label="Library projects list">
                  {activeProjects.filter((p) => !p.folderId).map((project) => (
                    <article
                      key={project.id}
                      data-selectable-id={project.id}
                      className={`project-hub__list-row ${project.id === (selectedProjectId ?? activeProjectId) || multiSelect.liveSelectedIds.has(project.id) ? "project-hub__list-row--selected" : ""} ${drag.draggingProjectId === project.id ? "project-hub__list-row--dragging" : ""} ${drag.getProjectDropClassName(project.id).replace("project-card", "project-hub__list-row")}`.trim()}
                      onClick={() => { setSelectedProjectId(project.id); onOpenProject(project.id) }}
                      role="button"
                      tabIndex={0}
                      draggable
                      onKeyDown={(e) => { if (e.key === "Enter") onOpenProject(project.id) }}
                      onDragStart={(e) => multiSelect.handleMultiDragStart(project.id, e)}
                      onDragEnd={multiSelect.handleMultiDragEnd}
                      onDragEnter={drag.updateProjectDropTarget(project)}
                      onDragOver={drag.updateProjectDropTarget(project)}
                      onDrop={multiSelect.handleMultiCardDrop(project)}
                      onContextMenu={(e) => {
                        e.preventDefault()
                        handleProjectContextMenu(project.id, e.clientX, e.clientY)
                      }}
                    >
                      <div className="project-hub__list-row-main">
                        <BookOpenText size={17} aria-hidden={true} />
                        <strong>{project.name}</strong>
                      </div>
                      <span>{collectTabIds(project.tabs).length} docs</span>
                      <span>{formatRelativeDate(project.createdAt)}</span>
                    </article>
                  ))}
                </div>
              ) : null
            ) : (
              /* Projects — Grid View (existing card components with drag/drop) */
              <ul className="project-hub__grid-view">
                {drag.topRootProjects.map((project) => renderProjectCard(project))}

                {drag.bottomRootProjects.map((project) => renderProjectCard(project))}
              </ul>
            )}

            {activeProjects.length === 0 ? (
              <div className="project-hub__create-row project-hub__create-row--project-grid" role="list" aria-label="Create actions">
                <button
                  type="button"
                  className="project-hub__create-card project-hub__create-card--project-size"
                  role="listitem"
                  aria-haspopup="menu"
                  aria-expanded={Boolean(createKindMenu)}
                  // Empty-state "Create" card opens the kind picker rather
                  // than implicitly creating a Book — matches the sidebar
                  // "Create Project" button so the four kinds are reachable
                  // from every entry point.
                  onClick={(event) => {
                    const rect = event.currentTarget.getBoundingClientRect()
                    setCreateKindMenu({ x: rect.left, y: rect.bottom + 6 })
                  }}
                >
                  <BookPlus size={28} aria-hidden={true} />
                  <span>Create project</span>
                </button>
                <button type="button" className="project-hub__create-card project-hub__create-card--project-size" role="listitem" onClick={() => createFolder()}>
                  <FolderPlus size={28} aria-hidden={true} />
                  <span>Create folder</span>
                </button>
              </div>
            ) : null}
            </>
            )}
          </div>
        </div>
      </div>

      <Modal
        isOpen={settings.isOpen}
        onClose={settings.close}
        title="Project Preferences"
        titleIcon={<ScrollText size={19} strokeWidth={1.9} aria-hidden="true" />}
        closeLabel="Close Settings"
        actions={
          <>
            <Button variant="footer" onClick={settings.duplicate} disabled={!settings.settingsProject}>
              <BookCopy size={14} strokeWidth={2} aria-hidden={true} />
              Duplicate
            </Button>
            <Button
              variant="footer"
              onClick={() => {
                if (!settings.settingsProject) return
                setProjects((cur) => cur.map((p) => p.id === settings.settingsProject!.id ? { ...p, archivedAt: new Date().toISOString() } : p))
                settings.close()
              }}
              disabled={!settings.settingsProject}
            >
              <Archive size={14} strokeWidth={2} aria-hidden={true} />
              Archive
            </Button>
            <Button
              variant="footer-danger"
              onClick={() => {
                if (!settings.settingsProject) return
                settings.close()
                moveToTrash(settings.settingsProject.id)
              }}
            >
              <Trash2 size={14} strokeWidth={2} aria-hidden={true} />
              Trash
            </Button>
          </>
        }
      >
        <ProjectSettings
          fieldClassName="project-settings-modal__field"
          projectName={settings.projectName}
          projectColor={settings.projectColor}
          projectWallpaperEmojis={settings.wallpaperEmojis}
          projectVersions={settingsProjectId ? (activeProjectVersionsByProjectId[settingsProjectId] ?? []) : []}
          onProjectNameChange={(nextName) => {
            settings.setProjectName(nextName)
            if (settings.error) settings.setError("")
          }}
          onProjectColorChange={settings.setProjectColor}
          onProjectWallpaperEmojisChange={settings.setWallpaperEmojis}
          onShowVersionHistory={
            settingsProjectId && onShowVersionHistory
              ? () => {
                  onShowVersionHistory(settingsProjectId)
                }
              : undefined
          }
          onExportProject={(format) => {
            if (!settings.settingsProject) return
            if (format === "pdf") void exportProjectAsPdf(settings.settingsProject)
            else if (format === "docx") void exportProjectAsDocx(settings.settingsProject)
            else if (format === "md") void downloadProjectAsMarkdown(settings.settingsProject)
            else if (format === "txt") void exportProjectAsTxt(settings.settingsProject)
          }}
          sessionToken={sessionToken}
          documentId={settingsProjectId ? (projectDocumentMap[settingsProjectId] ?? undefined) : undefined}
        />
        {settings.error ? <p className="ui-modal__error">{settings.error}</p> : null}
      </Modal>

      {contextMenu ? (
        <ProjectContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={closeContextMenu}
          actions={
            contextMenu.kind === "background"
              ? [
                  // 4-kind picker inlined into the right-click menu so the
                  // user can pick a kind without an intermediate submenu.
                  ...buildCreateProjectActions((kind) =>
                    createNewProject(kind, openFolderId ?? undefined),
                  ),
                  {
                    label: "Create Folder",
                    icon: <FolderPlus size={14} strokeWidth={2} aria-hidden={true} />,
                    action: createFolder,
                  },
                ]
              : contextMenu.isMultiSelect
              ? buildMultiSelectActions({
                  ids: multiSelect.selectedIds,
                  onDuplicate: (ids) => {
                    for (const id of ids) {
                      if (!folderIdSet.has(id)) {
                        setProjects((cur) => duplicateProject(cur, id))
                      }
                    }
                    multiSelect.clearSelection()
                  },
                  onShare: (ids) => {
                    // Prefer projects that are already shared (have a cloud
                    // documentId) so the dialog opens straight into the
                    // collaborator list. Fall back to the first project — the
                    // dialog itself handles the "upload first" CTA.
                    const ranked = [...ids].filter((id) => !folderIdSet.has(id))
                    const targetId = ranked.find((id) => Boolean(projectDocumentMap[id])) ?? ranked[0]
                    if (targetId) openShareDialog(targetId)
                    multiSelect.clearSelection()
                  },
                  onArchive: (ids) => {
                    for (const id of ids) {
                      if (folderIdSet.has(id)) {
                        setProjects((cur) => cur.map((p) => p.folderId === id ? { ...p, archivedAt: new Date().toISOString() } : p))
                        setFolders((cur) => cur.filter((f) => f.id !== id))
                      } else {
                        setProjects((cur) => cur.map((p) => p.id === id ? { ...p, archivedAt: new Date().toISOString() } : p))
                      }
                    }
                    multiSelect.clearSelection()
                  },
                  onTrash: (ids) => {
                    for (const id of ids) {
                      if (folderIdSet.has(id)) {
                        setProjects((cur) => cur.map((p) => p.folderId === id ? { ...p, folderId: null } : p))
                        setFolders((cur) => cur.filter((f) => f.id !== id))
                      } else {
                        moveToTrash(id)
                      }
                    }
                    multiSelect.clearSelection()
                  },
                })
              : contextMenu.isFolder
              ? buildFolderActions({
                  folderId: contextMenu.projectId,
                  onOpenInNewWindow: onOpenFolderInNewWindow,
                  onRename: (id) => startFolderRename(id),
                  onOpenSettings: (id) => setFolderSettingsId(id),
                  onArchive: (id) => {
                    setProjects((cur) => cur.map((p) => p.folderId === id ? { ...p, archivedAt: new Date().toISOString() } : p))
                    setFolders((cur) => cur.filter((f) => f.id !== id))
                  },
                  onTrash: (id) => {
                    setProjects((cur) => cur.map((p) => p.folderId === id ? { ...p, folderId: null } : p))
                    setFolders((cur) => cur.filter((f) => f.id !== id))
                  },
                })
              : buildProjectActions({
                  projectId: contextMenu.projectId,
                  onOpenInNewTab: onOpenProjectInNewTab,
                  onRename: (id) => setEditingProjectId(id),
                  onOpenSettings: (id) => {
                    const project = projects.find((p) => p.id === id)
                    if (project) settings.open(project)
                  },
                  onDuplicate: (id) => setProjects((cur) => duplicateProject(cur, id)),
                  onShare: (id) => openShareDialog(id),
                  // Only offer "Move to Cloud" for local projects (cloud
                  // projects are already there). Hides the action when
                  // the orchestration didn't provide a handler (e.g.
                  // cloud-mode where every project is already cloud).
                  onMoveToCloud: (() => {
                    if (!onMoveProjectToCloud) return undefined
                    const target = projects.find((p) => p.id === contextMenu.projectId)
                    if (!target || target.source === "cloud") return undefined
                    return (id) => { void onMoveProjectToCloud(id) }
                  })(),
                  // Local-only: copy path / reveal in Finder. Hidden for
                  // cloud projects (no on-disk file) and on web (no Electron).
                  onCopyPath: (() => {
                    if (!onCopyProjectPath) return undefined
                    const target = projects.find((p) => p.id === contextMenu.projectId)
                    if (!target || target.source === "cloud") return undefined
                    return onCopyProjectPath
                  })(),
                  onShowInFinder: (() => {
                    if (!onShowProjectInFinder) return undefined
                    const target = projects.find((p) => p.id === contextMenu.projectId)
                    if (!target || target.source === "cloud") return undefined
                    return onShowProjectInFinder
                  })(),
                  onArchive: (id) => setProjects((cur) => cur.map((p) => p.id === id ? { ...p, archivedAt: new Date().toISOString() } : p)),
                  onTrash: (id) => moveToTrash(id),
                })
          }
        />
      ) : null}

      {createKindMenu ? (
        <ProjectContextMenu
          x={createKindMenu.x}
          y={createKindMenu.y}
          onClose={closeCreateKindMenu}
          actions={buildCreateProjectActions((kind) => {
            createNewProject(kind, createKindMenu.folderId ?? openFolderId ?? undefined)
            closeCreateKindMenu()
          })}
        />
      ) : null}

      {shareDialogProjectId ? (
        <ShareDialog
          isOpen={true}
          onClose={() => setShareDialogProjectId(null)}
          sessionToken={sessionToken}
          documentId={shareDialogDocumentId}
          projectName={shareDialogProject?.name ?? "Untitled"}
          isOwner={!sharedProjectIds?.has(shareDialogProjectId)}
          userEmail={userEmail ?? ""}
          ownerEmail={ownerEmailByProjectId?.get(shareDialogProjectId) ?? ""}
          onEnableCloudSharing={onEnableCloudSharing ? () => onEnableCloudSharing(shareDialogProjectId) : undefined}
        />
      ) : null}

      <FolderSettingsModal
        isOpen={folderSettingsTarget !== null}
        folder={folderSettingsTarget}
        onClose={() => setFolderSettingsId(null)}
        onChange={(patch) => {
          if (!folderSettingsTarget) return
          const targetId = folderSettingsTarget.id
          setFolders((current) => current.map((f) => f.id === targetId ? { ...f, ...patch } : f))
          // Mirror to the per-folder localStorage shadow so the change
          // survives reload in local mode (cloud mode also benefits — its
          // preferences sync will write back, but the local mirror keeps
          // the value visible until that round-trip lands).
          setFolderMeta(targetId, patch)
          // macOS only: also stamp the folder's Finder color label so a
          // user opening Finder sees the same accent. Snaps to the nearest
          // of Finder's seven preset colors (see macFolderLabels.ts).
          if (patch.color !== undefined) onApplyFolderFinderColor?.(targetId, patch.color)
        }}
      />
    </>
  )
}
