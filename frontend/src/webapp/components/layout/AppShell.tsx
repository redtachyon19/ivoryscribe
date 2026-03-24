import { useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react"
import { ArrowLeft, ArrowRight, BookText, Folder, PanelLeft, PanelRight, Settings } from "lucide-react"
import NavigationPanel from "../navigation/NavigationPanel"
import TuskAiTab from "../ai/TuskAiTab"
import type { Project } from "../../../core/projects"
import type { ProjectFolder } from "../../pages/Library"
import "../../pages/Editor.css"

const STORAGE_LIMIT_GB = 15

export type AppShellProps = {
  menuBarEnabled: boolean
  isEditorTyping: boolean
  view: "projects" | "editor"
  project: Project | null
  activeFolderName?: string | null
  previousTabId: string | null
  nextTabId: string | null
  activeTabPath: Array<{ id: string; title: string }>
  onProjectChange: (updater: (project: Project) => Project) => void
  onToggleSettings: () => void
  projects: Project[]
  folders: ProjectFolder[]
  showWordCount: boolean
  currentCountLabel: string
  isWordStatsOpen: boolean
  setProjects: Dispatch<SetStateAction<Project[]>>
  setFolders: Dispatch<SetStateAction<ProjectFolder[]>>
  onCreateProject: () => void
  onCreateFolder: () => void
  onOpenProject: (projectId: string) => void
  onReturnToDashboard: () => void
  onToggleWordStats: () => void
  sessionToken: string
  projectDocumentMap: Record<string, string>
  tuskAiActivated: boolean
  isStartingTuskCheckout: boolean
  onStartTuskCheckout: () => void
  children: ReactNode
}

export default function AppShell({
  menuBarEnabled,
  isEditorTyping,
  view,
  project,
  activeFolderName = null,
  previousTabId,
  nextTabId,
  activeTabPath,
  onProjectChange,
  onToggleSettings,
  projects,
  folders,
  showWordCount,
  currentCountLabel,
  isWordStatsOpen,
  setProjects,
  setFolders,
  onCreateProject,
  onCreateFolder,
  onOpenProject,
  onReturnToDashboard,
  onToggleWordStats,
  sessionToken,
  projectDocumentMap,
  tuskAiActivated,
  isStartingTuskCheckout,
  onStartTuskCheckout,
  children,
}: AppShellProps) {
  const [isLeftRailOpen, setIsLeftRailOpen] = useState(true)
  const [isRightRailOpen, setIsRightRailOpen] = useState(false)
  const [leftPanelWidth, setLeftPanelWidth] = useState(300)
  const [rightPanelWidth, setRightPanelWidth] = useState(280)
  const [draggingPanel, setDraggingPanel] = useState<"left" | "right" | null>(null)
  const [sidebarSlide, setSidebarSlide] = useState<1 | 2>(view === "projects" ? 1 : 2)
  const bodyRef = useRef<HTMLDivElement | null>(null)

  const estimatedStorageBytes = useMemo(() => {
    const projectBytes = projects.reduce((total, item) => total + new Blob([JSON.stringify(item)]).size, 0)
    const folderBytes = folders.reduce((total, item) => total + new Blob([JSON.stringify(item)]).size, 0)
    return projectBytes + folderBytes
  }, [projects, folders])

  const storageUsedGb = estimatedStorageBytes / (1024 ** 3)
  const storageUsagePercent = Math.min(100, (storageUsedGb / STORAGE_LIMIT_GB) * 100)
  const storageUsedLabel = storageUsedGb >= 1 ? storageUsedGb.toFixed(1) : storageUsedGb.toFixed(2)

  // Sync sidebar slide when view changes
  useEffect(() => {
    setSidebarSlide(view === "projects" ? 1 : 2)
  }, [view])

  useEffect(() => {
    if (!draggingPanel) return

    const onMouseMove = (event: MouseEvent) => {
      const bounds = bodyRef.current?.getBoundingClientRect()
      if (!bounds) return

      if (draggingPanel === "left") {
        setLeftPanelWidth(Math.max(180, Math.min(360, event.clientX - bounds.left)))
        return
      }

      setRightPanelWidth(Math.max(190, Math.min(420, bounds.right - event.clientX)))
    }

    const onMouseUp = () => {
      setDraggingPanel(null)
    }

    window.addEventListener("mousemove", onMouseMove)
    window.addEventListener("mouseup", onMouseUp)

    return () => {
      window.removeEventListener("mousemove", onMouseMove)
      window.removeEventListener("mouseup", onMouseUp)
    }
  }, [draggingPanel])

  const handleOpenProject = (projectId: string) => {
    onOpenProject(projectId)
    setSidebarSlide(2)
  }

  const handleReturnToDashboard = () => {
    onReturnToDashboard()
    setSidebarSlide(1)
  }

  return (
    <div className={`editor-workspace ${menuBarEnabled ? "editor-workspace--with-menu" : ""}`.trim()}>
      <div
        className={`editor-workspace__topbar ${isEditorTyping ? "editor-workspace__topbar--hidden-controls" : ""}`.trim()}
        style={{ left: isLeftRailOpen ? leftPanelWidth : 0 }}
      >
        {!isLeftRailOpen ? (
          <button
            type="button"
            className="editor-workspace__panel-toggle"
            aria-label="Expand left panel"
            onClick={() => setIsLeftRailOpen(true)}
          >
            <PanelLeft size={16} aria-hidden={true} />
          </button>
        ) : null}
        {view === "editor" && project ? (
        <div className="editor-workspace__doc-path">
          <div className="editor-workspace__doc-nav" aria-label="Document navigation">
            <button
              type="button"
              className="editor-workspace__doc-nav-btn"
              aria-label="Go to previous tab"
              disabled={!previousTabId}
              onClick={() => {
                if (!previousTabId) return
                onProjectChange((currentProject) => ({
                  ...currentProject,
                  activeId: previousTabId,
                }))
              }}
            >
              <ArrowLeft size={16} aria-hidden={true} />
            </button>
            <button
              type="button"
              className="editor-workspace__doc-nav-btn"
              aria-label="Go to next tab"
              disabled={!nextTabId}
              onClick={() => {
                if (!nextTabId) return
                onProjectChange((currentProject) => ({
                  ...currentProject,
                  activeId: nextTabId,
                }))
              }}
            >
              <ArrowRight size={16} aria-hidden={true} />
            </button>
          </div>

          <div className="editor-workspace__doc-path-trail" aria-label="Current document path">
            {activeFolderName ? (
              <>
                <button
                  type="button"
                  className="editor-workspace__doc-path-btn editor-workspace__doc-path-segment editor-workspace__doc-path-segment--folder"
                  onClick={handleReturnToDashboard}
                  aria-label="Open project folder"
                >
                  <Folder size={14} aria-hidden={true} />
                  <span>{activeFolderName}</span>
                </button>
                <span className="editor-workspace__doc-path-separator" aria-hidden={true}>/</span>
                <button
                  type="button"
                  className="editor-workspace__doc-path-btn editor-workspace__doc-path-segment"
                  onClick={handleReturnToDashboard}
                  aria-label="Open library"
                >
                  {project.name}
                </button>
              </>
            ) : (
              <button
                type="button"
                className="editor-workspace__doc-path-btn editor-workspace__doc-path-segment editor-workspace__doc-path-segment--folder"
                onClick={handleReturnToDashboard}
                aria-label="Open library"
              >
                <BookText size={14} aria-hidden={true} />
                <span>{project.name}</span>
              </button>
            )}

            {activeTabPath.length > 0 ? <span className="editor-workspace__doc-path-separator" aria-hidden={true}>/</span> : null}

            {activeTabPath.map((node, index) => (
              <span key={node.id} className="editor-workspace__doc-path-part">
                <button
                  type="button"
                  className={`editor-workspace__doc-path-btn editor-workspace__doc-path-segment ${index === activeTabPath.length - 1 ? "editor-workspace__doc-path-segment--active" : ""}`.trim()}
                  onClick={() => {
                    onProjectChange((currentProject) => ({
                      ...currentProject,
                      activeId: node.id,
                    }))
                  }}
                  aria-label={`Open ${node.title}`}
                >
                  {node.title}
                </button>
                {index < activeTabPath.length - 1 ? <span className="editor-workspace__doc-path-separator" aria-hidden={true}>/</span> : null}
              </span>
            ))}
          </div>
        </div>
        ) : (
        <div className="editor-workspace__doc-path">
          <div className="editor-workspace__doc-path-trail" aria-label="Current view">
            <span className="editor-workspace__doc-path-segment editor-workspace__doc-path-segment--active" style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: "var(--app-ui-font)", fontSize: 14 }}>
              Library
            </span>
          </div>
        </div>
        )}
        <button
          type="button"
          className="editor-workspace__panel-toggle"
          aria-label={isRightRailOpen ? "Collapse right panel" : "Expand right panel"}
          onClick={() => setIsRightRailOpen((prev) => !prev)}
        >
          <PanelRight size={16} aria-hidden={true} />
        </button>
      </div>

      <div
        ref={bodyRef}
        className={`editor-workspace__body ${!isLeftRailOpen ? "editor-workspace__body--collapsed-left" : ""} ${!isRightRailOpen ? "editor-workspace__body--collapsed-right" : ""} ${draggingPanel ? "editor-workspace__body--dragging" : ""}`.trim()}
        style={{
          gridTemplateColumns: `${isLeftRailOpen ? leftPanelWidth : 0}px ${isLeftRailOpen ? 8 : 0}px 1fr ${isRightRailOpen ? 8 : 0}px ${isRightRailOpen ? rightPanelWidth : 0}px`,
        }}
      >
        <NavigationPanel
          project={project}
          projects={projects}
          folders={folders}
          view={view}
          sidebarSlide={sidebarSlide}
          isOpen={isLeftRailOpen}
          showWordCount={showWordCount}
          storageUsagePercent={storageUsagePercent}
          storageUsedLabel={storageUsedLabel}
          currentCountLabel={currentCountLabel}
          isWordStatsOpen={isWordStatsOpen}
          setProjects={setProjects}
          setFolders={setFolders}
          onSetSidebarSlide={setSidebarSlide}
          onClose={() => setIsLeftRailOpen(false)}
          onCreateProject={onCreateProject}
          onCreateFolder={onCreateFolder}
          onOpenProject={handleOpenProject}
          onReturnToDashboard={handleReturnToDashboard}
          onProjectChange={onProjectChange}
          onToggleWordStats={onToggleWordStats}
          sessionToken={sessionToken}
          projectDocumentMap={projectDocumentMap}
        />

        <div
          className={`editor-workspace__resizer editor-workspace__resizer--left ${draggingPanel === "left" ? "editor-workspace__resizer--dragging" : ""} ${!isLeftRailOpen ? "editor-workspace__resizer--hidden" : ""}`.trim()}
          role="separator"
          aria-label="Resize left panel"
          onMouseDown={() => setDraggingPanel("left")}
        />

        <div className="editor-workspace__editor-center">
          <button
            type="button"
            className={`editor-workspace__settings-btn ${isEditorTyping ? "editor-workspace__settings-btn--hidden" : ""}`.trim()}
            aria-label="Open settings"
            onClick={onToggleSettings}
          >
            <Settings size={14} aria-hidden={true} />
          </button>
          {children}
        </div>

        <div
          className={`editor-workspace__resizer editor-workspace__resizer--right ${draggingPanel === "right" ? "editor-workspace__resizer--dragging" : ""} ${!isRightRailOpen ? "editor-workspace__resizer--hidden" : ""}`.trim()}
          role="separator"
          aria-label="Resize right panel"
          onMouseDown={() => setDraggingPanel("right")}
        />

        <aside className="editor-workspace__right-rail">
          {project ? (
            <TuskAiTab
              sessionToken={sessionToken}
              hasAccess={tuskAiActivated}
              isUnlocking={isStartingTuskCheckout}
              onUnlock={onStartTuskCheckout}
              project={project}
              onApplyEdit={(tabId, nextContent) => {
                onProjectChange((currentProject) => {
                  if (!(tabId in currentProject.contentById)) {
                    return currentProject
                  }

                  return {
                    ...currentProject,
                    contentById: {
                      ...currentProject.contentById,
                      [tabId]: nextContent,
                    },
                  }
                })
              }}
            />
          ) : null}
        </aside>
      </div>
    </div>
  )
}

