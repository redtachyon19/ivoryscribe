import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react"
import { BookCopy, BookOpenText, BookPlus, FileText, Folder, FolderPlus, LayoutGrid, List, NotebookPen, ScrollText, Trash2 } from "lucide-react"
import Button from "../components/ui/Button"
import Modal from "../components/ui/Modal"
import { PROJECTS_CREATE_BLOG_EVENT, PROJECTS_CREATE_BOOK_EVENT, PROJECTS_CREATE_FOLDER_EVENT } from "../../core/editorEvents"
import { downloadProjectAsMarkdown } from "../../core/markdown"
import { exportProjectAsPdf } from "../../core/pdfExport"
import { createProject, type Project, type ProjectKind } from "../../core/projects"
import { createLocalId } from "../../core/libraryUtils"
import type { VersionSettingsEntry } from "../../core/versioning"
import ProjectSettings from "../components/settings/ProjectSettings"
import ProjectCard from "../components/library/ProjectCard"
import ProjectFolderItem from "../components/library/ProjectFolder"
import TypingConfirmation from "../components/library/TypingConfirmation"
import useProjectDrag from "../components/library/useProjectDrag"
import useProjectSettings from "../components/library/useProjectSettings"
import useProjectDelete from "../components/library/useProjectDelete"
import "./Library.css"

export type ProjectFolder = {
  id: string
  name: string
  description: string
}

export type LibraryProps = {
  projects: Project[]
  folders: ProjectFolder[]
  activeProjectId: string | null
  bookCounter: number
  blogCounter: number
  setBookCounter: Dispatch<SetStateAction<number>>
  setBlogCounter: Dispatch<SetStateAction<number>>
  onOpenProject: (projectId: string) => void
  onOpenProjectInNewTab: (projectId: string) => void
  onProjectCreated?: (project: Project) => void
  activeProjectVersionsByProjectId?: Record<string, VersionSettingsEntry[]>
  onShowVersionHistory?: (projectId: string) => void
  setProjects: Dispatch<SetStateAction<Project[]>>
  setFolders: Dispatch<SetStateAction<ProjectFolder[]>>
  setActiveProjectId: Dispatch<SetStateAction<string | null>>
}

function formatRelativeDate(iso: string) {
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

export default function Library({
  projects,
  folders,
  activeProjectId,
  bookCounter,
  blogCounter,
  setBookCounter,
  setBlogCounter,
  onOpenProject,
  onOpenProjectInNewTab,
  onProjectCreated,
  activeProjectVersionsByProjectId = {},
  onShowVersionHistory,
  setProjects,
  setFolders,
  setActiveProjectId,
}: LibraryProps) {
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null)
  const [openFolderCreateMenuId, setOpenFolderCreateMenuId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<"list" | "grid">("grid")
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)

  const drag = useProjectDrag({ projects, folders, setProjects, setFolders })
  const settings = useProjectSettings({ projects, setProjects })
  const deletion = useProjectDelete({ projects, setProjects, setActiveProjectId })
  const settingsProjectId = settings.settingsProject?.id ?? null

  const recentProjects = useMemo(
    () => [...projects].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 4),
    [projects],
  )

  const createNewProject = (kind: ProjectKind, folderId?: string) => {
    const nextName = kind === "Book" ? `Book ${bookCounter}` : `Blog ${blogCounter}`
    const nextProject = createProject(nextName, kind)
    setProjects((cur) => [{ ...nextProject, folderId: folderId ?? null, rootPosition: folderId ? nextProject.rootPosition : "top" }, ...cur])
    setActiveProjectId(nextProject.id)
    setSelectedProjectId(nextProject.id)
    if (kind === "Book") setBookCounter((c) => c + 1)
    else setBlogCounter((c) => c + 1)
    onProjectCreated?.(nextProject)
  }

  const closeCreateMenus = () => {
    setOpenFolderCreateMenuId(null)
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

  // Close folder create menus on outside click
  useEffect(() => {
    if (!openFolderCreateMenuId) return

    const handleDocumentMouseDown = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (target instanceof Element && target.closest(".project-folder__create-menu-wrap")) return
      closeCreateMenus()
    }

    document.addEventListener("mousedown", handleDocumentMouseDown)
    return () => { document.removeEventListener("mousedown", handleDocumentMouseDown) }
  }, [openFolderCreateMenuId])

  // Global create events from the menu bar
  useEffect(() => {
    const handleCreateBook = () => createNewProject("Book")
    const handleCreateBlog = () => createNewProject("Blog")
    const handleCreateFolder = () => createFolder()

    window.addEventListener(PROJECTS_CREATE_BOOK_EVENT, handleCreateBook)
    window.addEventListener(PROJECTS_CREATE_BLOG_EVENT, handleCreateBlog)
    window.addEventListener(PROJECTS_CREATE_FOLDER_EVENT, handleCreateFolder)

    return () => {
      window.removeEventListener(PROJECTS_CREATE_BOOK_EVENT, handleCreateBook)
      window.removeEventListener(PROJECTS_CREATE_BLOG_EVENT, handleCreateBlog)
      window.removeEventListener(PROJECTS_CREATE_FOLDER_EVENT, handleCreateFolder)
    }
  }, [bookCounter, blogCounter, folders.length])

  const renderProjectCard = (project: Project) => (
    <ProjectCard
      key={project.id}
      project={project}
      isDragging={drag.draggingProjectId === project.id}
      dropClassName={drag.getProjectDropClassName(project.id)}
      openProjectSettingsId={settings.openProjectSettingsId}
      onOpenProject={onOpenProject}
      onOpenProjectInNewTab={onOpenProjectInNewTab}
      onOpenProjectSettings={settings.open}
      onCloseProjectSettings={settings.close}
      onDragStart={drag.handleProjectDragStart}
      onDragEnd={drag.handleProjectDragEnd}
      onDragEnter={drag.updateProjectDropTarget(project)}
      onDragOver={drag.updateProjectDropTarget(project)}
      onDrop={drag.handleCardDrop(project)}
      setEditingProjectId={setEditingProjectId}
      editingProjectId={editingProjectId}
      setProjects={setProjects}
    />
  )

  return (
    <>
      <div className={`project-hub__main ${deletion.isOpen || settings.isOpen ? "project-hub__main--blurred" : ""}`.trim()}>
        <div className="project-hub__main-scroll">
            {/* Header */}
            <div className="project-hub__header">
              <h3>Library</h3>
              <span>Your herd of projects, organized in one place</span>
            </div>

            {/* Create Row */}
            <div className="project-hub__create-row" role="list" aria-label="Create actions">
              <button type="button" className="project-hub__create-card" role="listitem" onClick={() => createNewProject("Book")}>
                <BookPlus size={28} aria-hidden={true} />
                <span>Create book</span>
              </button>
              <button type="button" className="project-hub__create-card" role="listitem" onClick={() => createNewProject("Blog")}>
                <NotebookPen size={28} aria-hidden={true} />
                <span>Create blog</span>
              </button>
              <button type="button" className="project-hub__create-card" role="listitem" onClick={() => createFolder()}>
                <FolderPlus size={28} aria-hidden={true} />
                <span>Create folder</span>
              </button>
            </div>

            {/* Recently Opened */}
            {recentProjects.length > 0 ? (
              <div className="project-hub__recent-section">
                <p className="project-hub__section-label">Recently opened</p>
                <div className="project-hub__recent-grid">
                  {recentProjects.map((project) => (
                    <article
                      key={project.id}
                      className="project-hub__recent-item"
                      onClick={() => onOpenProject(project.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === "Enter") onOpenProject(project.id) }}
                    >
                      {project.kind === "Book" ? <BookOpenText size={16} aria-hidden={true} /> : <NotebookPen size={16} aria-hidden={true} />}
                      <div>
                        <strong>{project.name}</strong>
                        <span>{project.kind} project &bull; {formatRelativeDate(project.createdAt)}</span>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Toolbar */}
            <div className="project-hub__toolbar">
              <p>Library</p>
              <div className="project-hub__toolbar-actions">
                <div className="project-hub__chips">
                  <span>Folders {folders.length}</span>
                  <span>Projects {projects.length}</span>
                </div>
                <button
                  type="button"
                  className="project-hub__view-toggle"
                  aria-label={viewMode === "list" ? "Switch to grid view" : "Switch to list view"}
                  onClick={() => setViewMode((prev) => (prev === "list" ? "grid" : "list"))}
                >
                  {viewMode === "list" ? <LayoutGrid size={15} aria-hidden={true} /> : <List size={15} aria-hidden={true} />}
                </button>
              </div>
            </div>

            {/* Folders Grid */}
            {folders.length > 0 ? (
              <div className="project-hub__folders-grid" aria-label="Library folders">
                {folders.map((folder) => (
                  <article key={folder.id} className="project-hub__folder-card">
                    <Folder size={18} aria-hidden={true} />
                    <div>
                      <strong>{folder.name}</strong>
                      <span>{projects.filter((p) => p.folderId === folder.id).length} projects</span>
                    </div>
                  </article>
                ))}
              </div>
            ) : null}

            {/* Projects — List View */}
            {viewMode === "list" ? (
              projects.length > 0 ? (
                <div className="project-hub__list-view" aria-label="Library projects list">
                  {projects.map((project) => (
                    <article
                      key={project.id}
                      className={`project-hub__list-row ${project.id === (selectedProjectId ?? activeProjectId) ? "project-hub__list-row--selected" : ""}`.trim()}
                      onClick={() => { setSelectedProjectId(project.id); onOpenProject(project.id) }}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === "Enter") onOpenProject(project.id) }}
                    >
                      <div className="project-hub__list-row-main">
                        {project.kind === "Book" ? <BookOpenText size={17} aria-hidden={true} /> : <FileText size={17} aria-hidden={true} />}
                        <strong>{project.name}</strong>
                      </div>
                      <span>{project.kind}</span>
                      <span>{formatRelativeDate(project.createdAt)}</span>
                    </article>
                  ))}
                </div>
              ) : null
            ) : (
              /* Projects — Grid View (existing card components with drag/drop) */
              <ul className="project-hub__grid-view">
                <li
                  className={`project-hub__root-drop ${drag.getRootDropClassName("top")}`.trim()}
                  aria-hidden="true"
                  onDragOver={drag.handleRootDragOver("top")}
                  onDrop={drag.handleRootDrop("top")}
                />

                {drag.topRootProjects.map((project) => renderProjectCard(project))}

                {folders.flatMap((folder) => [
                  <ProjectFolderItem
                    key={folder.id}
                    folder={folder}
                    dropClassName={drag.getFolderDropClassName(folder.id)}
                    reorderClassName={drag.getFolderReorderClassName(folder.id)}
                    openFolderCreateMenuId={openFolderCreateMenuId}
                    onSetOpenFolderCreateMenuId={(id) => { setOpenFolderCreateMenuId(id) }}
                    onCloseCreateMenus={closeCreateMenus}
                    onCreateNewProject={createNewProject}
                    onFolderDragStart={drag.handleFolderDragStart}
                    onFolderDragEnd={drag.handleFolderDragEnd}
                    onDragOver={drag.handleFolderItemDragOver(folder)}
                    onDrop={drag.handleFolderItemDrop(folder)}
                    setFolders={setFolders}
                  />,
                  ...drag.getProjectsForFolder(folder.id).map((project) => renderProjectCard(project)),
                ])}

                {drag.bottomRootProjects.map((project) => renderProjectCard(project))}

                <li
                  className={`project-hub__root-drop ${drag.getRootDropClassName("bottom")}`.trim()}
                  aria-hidden="true"
                  onDragOver={drag.handleRootDragOver("bottom")}
                  onDrop={drag.handleRootDrop("bottom")}
                />
              </ul>
            )}

            {projects.length === 0 ? (
              <p className="project-hub__empty">No projects yet. Create one to begin writing.</p>
            ) : null}
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
              variant="footer-danger"
              onClick={() => {
                if (!settings.settingsProject) return
                settings.close()
                deletion.openConfirmation(settings.settingsProject.id)
              }}
            >
              <Trash2 size={14} strokeWidth={2} aria-hidden={true} />
              Delete
            </Button>
          </>
        }
      >
        <ProjectSettings
          fieldClassName="project-settings-modal__field"
          projectName={settings.projectName}
          projectKind={settings.projectKind}
          markdownEditorEnabled={settings.markdownEditorEnabled}
          projectColor={settings.projectColor}
          projectWallpaperEmojis={settings.wallpaperEmojis}
          projectVersions={settingsProjectId ? (activeProjectVersionsByProjectId[settingsProjectId] ?? []) : []}
          onProjectNameChange={(nextName) => {
            settings.setProjectName(nextName)
            if (settings.error) settings.setError("")
          }}
          onProjectKindChange={settings.setProjectKind}
          onMarkdownEditorEnabledChange={settings.setMarkdownEditorEnabled}
          onProjectColorChange={settings.setProjectColor}
          onProjectWallpaperEmojisChange={settings.setWallpaperEmojis}
          onShowVersionHistory={
            settingsProjectId && onShowVersionHistory
              ? () => {
                  onShowVersionHistory(settingsProjectId)
                }
              : undefined
          }
          onExportProject={() => {
            if (!settings.settingsProject) return
            if (settings.markdownEditorEnabled) { downloadProjectAsMarkdown(settings.settingsProject); return }
            exportProjectAsPdf(settings.settingsProject)
          }}
          onMarkdownPromptDismissed={settings.close}
        />
        {settings.error ? <p className="ui-modal__error">{settings.error}</p> : null}
      </Modal>

      <Modal
        isOpen={deletion.isOpen}
        onClose={deletion.closeConfirmation}
        title="Delete Project"
        titleIcon={<Trash2 size={19} strokeWidth={1.9} aria-hidden="true" />}
        closeLabel="Cancel"
        panelClassName="project-delete-modal__panel"
        actions={
          <Button variant="footer-danger" onClick={deletion.confirm}>
            <Trash2 size={14} strokeWidth={2} aria-hidden={true} />
            Delete
          </Button>
        }
      >
        <p className="project-delete-modal__copy">
          This project is about to go extinct? Are you sure you want to delete "{deletion.projectName}"? (This
          action is not reversable.)
        </p>
        <p className="project-delete-modal__copy">Type the exact phrase below to confirm deletion.</p>

        <div className="project-delete-modal__spacer" aria-hidden="true" />

        <TypingConfirmation
          requiredCharacters={deletion.requiredCharacters}
          enteredCharacters={deletion.enteredCharacters}
          confirmationText={deletion.confirmationText}
          inputRef={deletion.confirmationInputRef}
          onTextChange={(value) => {
            deletion.setConfirmationText(value)
            if (deletion.error) deletion.setError("")
          }}
          onConfirm={deletion.confirm}
        />

        {deletion.error ? <p className="ui-modal__error">{deletion.error}</p> : null}
      </Modal>
    </>
  )
}
