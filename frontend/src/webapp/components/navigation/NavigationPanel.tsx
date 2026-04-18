import { useCallback, useEffect, useState, type Dispatch, type MouseEvent, type SetStateAction } from "react"
import { ArrowLeft, BookPlus, FilePlus2, FileText, FolderPlus, ListPlus, PanelLeft, Presentation } from "lucide-react"
import DocumentTabsPanel from "./DocumentTabsPanel"
import ProjectBrowserPanel from "./ProjectBrowserPanel"
import { getProjectEntryTerms, normalizeProjectAfterTabs, type Project } from "../../../core/projects"
import type { ProjectFolder } from "../../pages/Library"
import ProjectContextMenu, { type ContextMenuAction } from "../library/ProjectContextMenu"



function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function collectEntryNumbers(tabs: Project["tabs"], singular: string): number[] {
  const matcher = new RegExp(`^${escapeRegex(singular)}\\s+(\\d+)$`, "i")

  return tabs.flatMap((tab) => {
    const match = tab.title.match(matcher)
    const current = match ? [Number.parseInt(match[1], 10)] : []
    return [...current, ...collectEntryNumbers(tab.children, singular)]
  })
}

function getNextEntryName(tabs: Project["tabs"], singular: string): string {
  const used = new Set(collectEntryNumbers(tabs, singular))
  let candidate = 1

  while (used.has(candidate)) {
    candidate += 1
  }

  return `${singular} ${candidate}`
}

export type NavigationPanelProps = {
  project: Project | null
  projects: Project[]
  folders: ProjectFolder[]
  view: "projects" | "editor"
  sidebarSlide: 1 | 2
  isOpen: boolean
  showWordCount: boolean
  storageUsagePercent: number
  storageUsedLabel: string
  currentCountLabel: string
  isWordStatsOpen: boolean
  setProjects: Dispatch<SetStateAction<Project[]>>
  setFolders: Dispatch<SetStateAction<ProjectFolder[]>>
  onSetSidebarSlide: (slide: 1 | 2) => void
  onClose: () => void
  onCreateProject: () => void
  onCreateFolder: () => void
  onOpenProject: (projectId: string) => void
  onReturnToDashboard: () => void
  onProjectChange: (updater: (project: Project) => Project) => void
  onToggleWordStats: () => void
  sessionToken: string
  projectDocumentMap: Record<string, string>
}

export default function NavigationPanel({
  project,
  projects,
  folders,
  view,
  sidebarSlide,
  isOpen,
  showWordCount,

  currentCountLabel,
  isWordStatsOpen,
  setProjects,
  setFolders,
  onSetSidebarSlide,
  onClose,
  onCreateProject,
  onCreateFolder,
  onOpenProject,
  onReturnToDashboard,
  onProjectChange,
  onToggleWordStats,
  sessionToken,
  projectDocumentMap,
}: NavigationPanelProps) {
  const entryTerms = project ? getProjectEntryTerms(project.kind) : { singular: "Chapter", plural: "Chapters", untitled: "Untitled" }
  const [createMoreMenu, setCreateMoreMenu] = useState<{ x: number; y: number } | null>(null)
  const closeCreateMoreMenu = useCallback(() => {
    setCreateMoreMenu(null)
  }, [])

  useEffect(() => {
    closeCreateMoreMenu()
  }, [closeCreateMoreMenu, isOpen, project?.id, sidebarSlide])

  const handleCreateProject = () => {
    onCreateProject()
    onSetSidebarSlide(2)
  }

  const handleCreateFolder = () => {
    onCreateFolder()
  }

  const handleCreateEntry = () => {
    onProjectChange((currentProject) => {
      const nextId = createId()
      const nextTitle = getNextEntryName(currentProject.tabs, getProjectEntryTerms(currentProject.kind).singular)

      return {
        ...currentProject,
        activeId: nextId,
        tabs: [...currentProject.tabs, { id: nextId, title: nextTitle, children: [] }],
        contentById: {
          ...currentProject.contentById,
          [nextId]: "",
        },
      }
    })
  }

  const handleCreatePinboard = () => {
    onProjectChange((currentProject) => {
      const nextId = createId()
      const nextTitle = getNextEntryName(currentProject.tabs, "Pinboard")

      return {
        ...currentProject,
        activeId: nextId,
        pinboardIds: [...(currentProject.pinboardIds ?? []), nextId],
        tabs: [...currentProject.tabs, { id: nextId, title: nextTitle, children: [] }],
        contentById: {
          ...currentProject.contentById,
          [nextId]: "",
        },
      }
    })
  }

  const handleCreateMarkdown = () => {
    onProjectChange((currentProject) => {
      const nextId = createId()
      const nextTitle = getNextEntryName(currentProject.tabs, "Markdown")

      return {
        ...currentProject,
        activeId: nextId,
        markdownIds: [...(currentProject.markdownIds ?? []), nextId],
        tabs: [...currentProject.tabs, { id: nextId, title: nextTitle, children: [] }],
        contentById: {
          ...currentProject.contentById,
          [nextId]: "",
        },
      }
    })
  }

  const handleOpenCreateMoreMenu = (event: MouseEvent<HTMLButtonElement>) => {
    const buttonRect = event.currentTarget.getBoundingClientRect()
    setCreateMoreMenu({
      x: buttonRect.left,
      y: buttonRect.bottom + 6,
    })
  }

  const createMoreActions: ContextMenuAction[] = [
    {
      label: "Create Pinboard",
      icon: <Presentation size={14} strokeWidth={2} aria-hidden={true} />,
      action: handleCreatePinboard,
    },
    {
      label: "Create Markdown",
      icon: <FileText size={14} strokeWidth={2} aria-hidden={true} />,
      action: handleCreateMarkdown,
    },
  ]

  return (
    <div className="editor-workspace__left-rail-container">
      {isOpen ? (
        <button
          type="button"
          className="editor-workspace__panel-toggle editor-workspace__left-rail-toggle"
          aria-label="Collapse left panel"
          onClick={onClose}
        >
          <PanelLeft size={16} aria-hidden={true} />
        </button>
      ) : null}
      <aside className="editor-workspace__left-rail">
        <div className="editor-workspace__rail-header">
          {/* Slide 1 header: Project Browser */}
          <div className={`editor-workspace__rail-header-layer ${sidebarSlide === 1 ? "editor-workspace__rail-header-layer--active" : ""}`.trim()}>
            <div className="editor-workspace__rail-back-placeholder" aria-hidden="true" />
            <button
              type="button"
              className="editor-workspace__rail-create"
              aria-label="Create Project"
              onClick={handleCreateProject}
            >
              <BookPlus size={14} aria-hidden={true} />
              <span>Create Project</span>
            </button>
            <button
              type="button"
              className="editor-workspace__rail-create editor-workspace__rail-create-pinboard"
              aria-label="Create Folder"
              onClick={handleCreateFolder}
            >
              <FolderPlus size={14} aria-hidden={true} />
              <span>Create Folder</span>
            </button>
          </div>

          {/* Slide 2 header: Document Tabs */}
          <div className={`editor-workspace__rail-header-layer ${sidebarSlide === 2 ? "editor-workspace__rail-header-layer--active" : ""}`.trim()}>
            <button
              type="button"
              className="editor-workspace__rail-back"
              aria-label="Browse all projects"
              onClick={() => onSetSidebarSlide(1)}
            >
              <ArrowLeft size={14} aria-hidden={true} />
              <span>Back to Projects</span>
            </button>
            <button
              type="button"
              className="editor-workspace__rail-create"
              aria-label={`Create ${entryTerms.singular}`}
              onClick={handleCreateEntry}
            >
              <FilePlus2 size={14} aria-hidden={true} />
              <span>Create {entryTerms.singular}</span>
            </button>
            <button
              type="button"
              className="editor-workspace__rail-create editor-workspace__rail-create-pinboard"
              aria-label="Create More"
              aria-expanded={Boolean(createMoreMenu)}
              onClick={handleOpenCreateMoreMenu}
            >
              <ListPlus size={14} aria-hidden={true} />
              <span>Create More</span>
            </button>
          </div>
        </div>

        <div
          className="editor-workspace__rail-slider"
          style={{ transform: sidebarSlide === 1 ? "translateX(0)" : "translateX(-50%)" }}
        >
          {/* Slide 1: Project Browser */}
          <div className="editor-workspace__rail-slide">
            <ProjectBrowserPanel
              projects={projects.filter((p) => !p.archivedAt && !p.deletedAt)}
              folders={folders}
              activeProjectId={project?.id ?? null}
              isLibraryView={view === "projects"}
              onNavigateLibrary={onReturnToDashboard}
              onOpenProject={onOpenProject}
              setFolders={setFolders}
              setProjects={setProjects}
              sessionToken={sessionToken}
              projectDocumentMap={projectDocumentMap}
              onCreateProject={handleCreateProject}
              onCreateFolder={handleCreateFolder}
            />
          </div>

          {/* Slide 2: Document Tabs */}
          <div className="editor-workspace__rail-slide">
            {project ? (
              <DocumentTabsPanel
                projectName={project.name}
                tabs={project.tabs}
                projectKind={project.kind}
                activeId={project.activeId}
                isVisible={isOpen && sidebarSlide === 2}
                onTabsChange={(updater) => {
                  onProjectChange((currentProject) => normalizeProjectAfterTabs(currentProject, updater(currentProject.tabs)))
                }}
                onSelect={(id) => {
                  onProjectChange((currentProject) => ({
                    ...currentProject,
                    activeId: id,
                  }))
                }}
                onCreateEntry={handleCreateEntry}
                onCreatePinboard={handleCreatePinboard}
                onCreateMarkdown={handleCreateMarkdown}
              />
            ) : null}
          </div>
        </div>
      </aside>
      {sidebarSlide !== 1 && showWordCount ? (
        <div className="editor-workspace__word-count-wrap">
          <button
            type="button"
            className="editor-workspace__word-count"
            aria-live="polite"
            aria-atomic="true"
            aria-expanded={isWordStatsOpen}
            onClick={onToggleWordStats}
          >
            {currentCountLabel}
          </button>
        </div>
      ) : null}

      {createMoreMenu && sidebarSlide === 2 ? (
        <ProjectContextMenu
          x={createMoreMenu.x}
          y={createMoreMenu.y}
          actions={createMoreActions}
          onClose={closeCreateMoreMenu}
        />
      ) : null}
    </div>
  )
}
