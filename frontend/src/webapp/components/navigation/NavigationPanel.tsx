import type { Dispatch, SetStateAction } from "react"
import { ArrowLeft, BookPlus, FilePlus2, FolderPlus, HardDrive, PanelLeft, Presentation } from "lucide-react"
import DocumentTabsPanel from "./DocumentTabsPanel"
import ProjectBrowserPanel from "./ProjectBrowserPanel"
import { getProjectEntryTerms, normalizeProjectAfterTabs, type Project } from "../../../core/projects"
import type { ProjectFolder } from "../../pages/Library"

const STORAGE_LIMIT_GB = 15

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
  onOpenProjectSettings: (projectId: string) => void
  onReturnToDashboard: () => void
  onProjectChange: (updater: (project: Project) => Project) => void
  onToggleWordStats: () => void
}

export default function NavigationPanel({
  project,
  projects,
  folders,
  view,
  sidebarSlide,
  isOpen,
  showWordCount,
  storageUsagePercent,
  storageUsedLabel,
  currentCountLabel,
  isWordStatsOpen,
  setProjects,
  setFolders,
  onSetSidebarSlide,
  onClose,
  onCreateProject,
  onCreateFolder,
  onOpenProject,
  onOpenProjectSettings,
  onReturnToDashboard,
  onProjectChange,
  onToggleWordStats,
}: NavigationPanelProps) {
  const entryTerms = project ? getProjectEntryTerms(project.kind) : { singular: "Chapter", plural: "Chapters", untitled: "Untitled" }

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
              onClick={() => {
                onCreateProject()
                onSetSidebarSlide(2)
              }}
            >
              <BookPlus size={14} aria-hidden={true} />
              <span>Create Project</span>
            </button>
            <button
              type="button"
              className="editor-workspace__rail-create editor-workspace__rail-create-pinboard"
              aria-label="Create Folder"
              onClick={onCreateFolder}
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
              onClick={() => {
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
              }}
            >
              <FilePlus2 size={14} aria-hidden={true} />
              <span>Create {entryTerms.singular}</span>
            </button>
            <button
              type="button"
              className="editor-workspace__rail-create editor-workspace__rail-create-pinboard"
              aria-label="Create Pinboard"
              onClick={() => {
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
              }}
            >
              <Presentation size={14} aria-hidden={true} />
              <span>Create Pinboard</span>
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
              projects={projects}
              folders={folders}
              activeProjectId={project?.id ?? null}
              isLibraryView={view === "projects"}
              onNavigateLibrary={onReturnToDashboard}
              onOpenProject={onOpenProject}
              onOpenProjectSettings={(projectId) => {
                onOpenProjectSettings(projectId)
                onSetSidebarSlide(2)
              }}
              setFolders={setFolders}
              setProjects={setProjects}
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
              />
            ) : null}
          </div>
        </div>
      </aside>
      {sidebarSlide === 1 ? (
        <div className="editor-workspace__word-count-wrap">
          <div className="project-hub__storage">
            <div className="project-hub__storage-label">
              <HardDrive size={15} aria-hidden={true} />
              <span>Storage</span>
            </div>
            <div className="project-hub__storage-bar" aria-hidden={true}>
              <span style={{ width: `${storageUsagePercent}%` }} />
            </div>
            <p>{storageUsedLabel} GB of {STORAGE_LIMIT_GB} GB used</p>
          </div>
        </div>
      ) : showWordCount ? (
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
    </div>
  )
}
