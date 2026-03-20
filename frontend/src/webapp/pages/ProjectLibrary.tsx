import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react"
import { BookCopy, BookText, Folder, NotebookText, Plus, ScrollText, Trash2, X } from "lucide-react"
import Button from "../components/ui/Button"
import Modal from "../components/ui/Modal"
import { PROJECTS_CREATE_BLOG_EVENT, PROJECTS_CREATE_BOOK_EVENT, PROJECTS_CREATE_FOLDER_EVENT } from "../../core/editorEvents"
import { downloadProjectAsMarkdown } from "../../core/markdown"
import { exportProjectAsPdf } from "../../core/pdfExport"
import { createProject, type Project, type ProjectKind } from "../../core/projects"
import { createLocalId } from "../../core/projectLibraryUtils"
import type { VersionSettingsEntry } from "../../core/versioning"
import ProjectSettings from "../components/settings/ProjectSettings"
import ProjectCard from "../components/project-library/ProjectCard"
import ProjectFolderItem from "../components/project-library/ProjectFolder"
import TypingConfirmation from "../components/project-library/TypingConfirmation"
import useProjectDrag from "../components/project-library/useProjectDrag"
import useProjectSettings from "../components/project-library/useProjectSettings"
import useProjectDelete from "../components/project-library/useProjectDelete"
import "./ProjectLibrary.css"

export type ProjectFolder = {
  id: string
  name: string
  description: string
}

export type ProjectLibraryProps = {
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

export default function ProjectLibrary({
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
}: ProjectLibraryProps) {
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null)
  const [isCreateMenuOpen, setIsCreateMenuOpen] = useState(false)
  const [openFolderCreateMenuId, setOpenFolderCreateMenuId] = useState<string | null>(null)
  const createMenuWrapRef = useRef<HTMLDivElement | null>(null)

  const drag = useProjectDrag({ projects, folders, setProjects, setFolders })
  const settings = useProjectSettings({ projects, setProjects })
  const deletion = useProjectDelete({ projects, setProjects, setActiveProjectId })
  const settingsProjectId = settings.settingsProject?.id ?? null

  const createNewProject = (kind: ProjectKind, folderId?: string) => {
    const nextName = kind === "Book" ? `Book ${bookCounter}` : `Blog ${blogCounter}`
    const nextProject = createProject(nextName, kind)
    setProjects((cur) => [{ ...nextProject, folderId: folderId ?? null, rootPosition: folderId ? nextProject.rootPosition : "top" }, ...cur])
    setActiveProjectId(nextProject.id)
    if (kind === "Book") setBookCounter((c) => c + 1)
    else setBlogCounter((c) => c + 1)
    onProjectCreated?.(nextProject)
  }

  const closeCreateMenus = () => {
    setIsCreateMenuOpen(false)
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

  useEffect(() => {
    if (!isCreateMenuOpen && !openFolderCreateMenuId) return

    const handleDocumentMouseDown = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (createMenuWrapRef.current?.contains(target)) return
      if (target instanceof Element && target.closest(".project-folder__create-menu-wrap")) return
      closeCreateMenus()
    }

    document.addEventListener("mousedown", handleDocumentMouseDown)
    return () => { document.removeEventListener("mousedown", handleDocumentMouseDown) }
  }, [isCreateMenuOpen, openFolderCreateMenuId])

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
  }, [createNewProject, folders.length])

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
    <section className="project-hub" aria-label="Projects home">
      <div className={`project-hub__content ${deletion.isOpen || settings.isOpen ? "project-hub__content--blurred" : ""}`.trim()}>
        <header className="project-hub__header">
          <div className="project-hub__title-row">
            <h1>Project Library</h1>
            <div className="project-hub__create-menu-wrap" ref={createMenuWrapRef}>
              <button
                type="button"
                className="project-hub__plus-btn"
                aria-label={isCreateMenuOpen ? "Cancel" : "Create project"}
                onClick={() => { setOpenFolderCreateMenuId(null); setIsCreateMenuOpen((open) => !open) }}
              >
                {isCreateMenuOpen ? <X size={16} strokeWidth={2} aria-hidden={true} /> : <Plus size={16} strokeWidth={2} aria-hidden={true} />}
                <span className="project-hub__plus-btn-label">{isCreateMenuOpen ? "Cancel" : "Create Project"}</span>
              </button>

              <div
                className={`project-hub__create-menu ${isCreateMenuOpen ? "project-hub__create-menu--open" : "project-hub__create-menu--closed"}`.trim()}
                role="menu"
                aria-label="Create project type"
                aria-hidden={!isCreateMenuOpen}
              >
                <Button variant="footer" className="project-hub__create-option" onClick={() => { createNewProject("Book"); closeCreateMenus() }}>
                  <BookText size={14} strokeWidth={2} aria-hidden="true" />
                  <span>Book</span>
                </Button>
                <Button variant="footer" className="project-hub__create-option" onClick={() => { createNewProject("Blog"); closeCreateMenus() }}>
                  <NotebookText size={14} strokeWidth={2} aria-hidden="true" />
                  <span>Blog</span>
                </Button>
                <Button variant="footer" className="project-hub__create-option" onClick={() => { createFolder(); closeCreateMenus() }}>
                  <Folder size={14} strokeWidth={2} aria-hidden="true" />
                  <span>Folder</span>
                </Button>
              </div>
            </div>
          </div>
          <p>Your herd of projects, organized in one place.</p>
        </header>

        <ul className="project-hub__list">
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
              onSetOpenFolderCreateMenuId={(id) => { setIsCreateMenuOpen(false); setOpenFolderCreateMenuId(id) }}
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

        {projects.length === 0 ? (
          <p className="project-hub__empty">No projects yet. Create one to begin writing.</p>
        ) : null}

        {activeProjectId ? null : projects.length ? (
          <p className="project-hub__empty">Select a project to continue.</p>
        ) : null}
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
    </section>
  )
}
