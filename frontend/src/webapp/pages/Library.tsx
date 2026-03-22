import { useEffect, useState, type Dispatch, type SetStateAction } from "react"
import { Archive, BookCopy, BookOpenText, BookPlus, FileText, Folder, FolderPlus, Library as LibraryIcon, NotebookPen, ScrollText, Trash2 } from "lucide-react"
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
import { FolderDetailView } from "../components/library/ProjectFolder"
import ProjectFolderGrid from "../components/library/ProjectFolder"
import TypingConfirmation from "../components/library/TypingConfirmation"
import useProjectDrag from "../components/library/useProjectDrag"
import useProjectSettings from "../components/library/useProjectSettings"
import useProjectDelete from "../components/library/useProjectDelete"
import { useViewMode, ViewToggle, formatRelativeDate } from "../components/library/useViewMode"
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
  const { viewMode, toggle: toggleView } = useViewMode()
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [openFolderId, setOpenFolderId] = useState<string | null>(null)

  const activeProjects = projects.filter((p) => !p.archivedAt && !p.deletedAt)
  const openFolder = openFolderId ? folders.find((f) => f.id === openFolderId) ?? null : null
  const folderProjects = openFolderId ? activeProjects.filter((p) => p.folderId === openFolderId) : []

  const drag = useProjectDrag({ projects: activeProjects, folders, setProjects, setFolders })
  const settings = useProjectSettings({ projects, setProjects })
  const deletion = useProjectDelete({ projects, setProjects, setActiveProjectId })
  const settingsProjectId = settings.settingsProject?.id ?? null

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

  const createFolder = () => {
    const nextIndex = folders.length + 1
    const newFolder: ProjectFolder = {
      id: createLocalId(),
      name: `Folder ${nextIndex}`,
      description: "Add a folder description here. You don't have the memory of an elephant.",
    }
    setFolders((current) => [newFolder, ...current])
  }

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
          {openFolder ? (
            <FolderDetailView
              folder={openFolder}
              folderProjects={folderProjects}
              onBack={() => setOpenFolderId(null)}
              onCreateBook={() => createNewProject("Book", openFolderId!)}
              onCreateBlog={() => createNewProject("Blog", openFolderId!)}
              renderProjectCard={renderProjectCard}
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

            {/* Create Row */}
            {activeProjects.length === 0 ? (
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
            ) : null}

            {/* Toolbar */}
            <ViewToggle viewMode={viewMode} onToggle={toggleView} />

            {/* Folders */}
            {viewMode === "list" ? (
              folders.length > 0 ? (
                <div className="project-hub__list-view" aria-label="Library folders list">
                  {folders.map((folder) => (
                    <article
                      key={folder.id}
                      className={`project-hub__list-row project-hub__list-row--folder ${drag.getFolderDropClassName(folder.id)} ${drag.getFolderReorderClassName(folder.id)}`.trim()}
                      onClick={() => setOpenFolderId(folder.id)}
                      role="button"
                      tabIndex={0}
                      draggable
                      onKeyDown={(e) => { if (e.key === "Enter") setOpenFolderId(folder.id) }}
                      onDragStart={(e) => drag.handleFolderDragStart(folder.id, e)}
                      onDragEnd={drag.handleFolderDragEnd}
                      onDragOver={drag.handleFolderItemDragOver(folder)}
                      onDrop={drag.handleFolderItemDrop(folder)}
                    >
                      <div className="project-hub__list-row-main">
                        <Folder size={17} aria-hidden={true} />
                        <strong>{folder.name}</strong>
                      </div>
                      <span>Folder</span>
                      <span>{activeProjects.filter((p) => p.folderId === folder.id).length} projects</span>
                    </article>
                  ))}
                </div>
              ) : null
            ) : (
              <ProjectFolderGrid
                folders={folders}
                projects={activeProjects}
                onOpenFolder={setOpenFolderId}
                onFolderDragStart={drag.handleFolderDragStart}
                onFolderDragEnd={drag.handleFolderDragEnd}
                onFolderDragOver={drag.handleFolderItemDragOver}
                onFolderDrop={drag.handleFolderItemDrop}
                getFolderDropClassName={drag.getFolderDropClassName}
                getFolderReorderClassName={drag.getFolderReorderClassName}
              />
            )}

            {/* Projects — List View */}
            {viewMode === "list" ? (
              activeProjects.filter((p) => !p.folderId).length > 0 ? (
                <div className="project-hub__list-view" aria-label="Library projects list">
                  {activeProjects.filter((p) => !p.folderId).map((project) => (
                    <article
                      key={project.id}
                      className={`project-hub__list-row ${project.id === (selectedProjectId ?? activeProjectId) ? "project-hub__list-row--selected" : ""} ${drag.draggingProjectId === project.id ? "project-hub__list-row--dragging" : ""} ${drag.getProjectDropClassName(project.id).replace("project-card", "project-hub__list-row")}`.trim()}
                      onClick={() => { setSelectedProjectId(project.id); onOpenProject(project.id) }}
                      role="button"
                      tabIndex={0}
                      draggable
                      onKeyDown={(e) => { if (e.key === "Enter") onOpenProject(project.id) }}
                      onDragStart={(e) => drag.handleProjectDragStart(project.id, e)}
                      onDragEnd={drag.handleProjectDragEnd}
                      onDragEnter={drag.updateProjectDropTarget(project)}
                      onDragOver={drag.updateProjectDropTarget(project)}
                      onDrop={drag.handleCardDrop(project)}
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
                  className={`project-hub__root-drop ${drag.draggingProjectId ? "project-hub__root-drop--ready" : ""} ${drag.getRootDropClassName("top")}`.trim()}
                  aria-hidden="true"
                  onDragOver={drag.handleRootDragOver("top")}
                  onDrop={drag.handleRootDrop("top")}
                />

                {drag.topRootProjects.map((project) => renderProjectCard(project))}

                {drag.bottomRootProjects.map((project) => renderProjectCard(project))}

                <li
                  className={`project-hub__root-drop ${drag.draggingProjectId ? "project-hub__root-drop--ready" : ""} ${drag.getRootDropClassName("bottom")}`.trim()}
                  aria-hidden="true"
                  onDragOver={drag.handleRootDragOver("bottom")}
                  onDrop={drag.handleRootDrop("bottom")}
                />
              </ul>
            )}

            {activeProjects.length === 0 ? (
              <p className="project-hub__empty">No projects yet. Create one to begin writing.</p>
            ) : null}
            </>
          )}
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
