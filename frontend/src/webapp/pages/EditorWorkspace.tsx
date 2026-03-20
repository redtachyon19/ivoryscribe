import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react"
import { ArrowLeft, ArrowRight, BookPlus, BookText, FilePlus2, Folder, FolderPlus, PanelLeft, PanelRight, Presentation, Settings } from "lucide-react"
import Editor from "../components/editor/Editor.tsx"
import MarkdownEditor from "../components/editor/MarkdownEditor"
import PinboardEditor from "../components/editor/PinboardEditor"
import DocumentTabs from "../components/editor/DocumentTabs"
import ProjectBrowserPanel from "../components/editor/ProjectBrowserPanel"
import TuskAiTab from "../components/editor/TuskAiTab"
import Modal from "../components/ui/Modal"
import { EXPORT_ALL_TABS_PDF_EVENT } from "../../core/editorEvents"
import { countWordsFromContent, downloadProjectAsMarkdown } from "../../core/markdown"
import { exportProjectAsPdf } from "../../core/pdfExport"
import { collectTabIds, getProjectEntryTerms, normalizeProjectAfterTabs, type Project } from "../../core/projects"
import type { ProjectFolder } from "./ProjectLibrary"
import "./EditorWorkspace.css"

function findTabTitleById(tabs: Project["tabs"], targetId: string): string | null {
  for (const tab of tabs) {
    if (tab.id === targetId) {
      return tab.title
    }

    const nestedTitle = findTabTitleById(tab.children, targetId)
    if (nestedTitle) {
      return nestedTitle
    }
  }

  return null
}

function findTabPathById(
  tabs: Project["tabs"],
  targetId: string,
  ancestors: Array<{ id: string; title: string }> = [],
): Array<{ id: string; title: string }> | null {
  for (const tab of tabs) {
    const nextAncestors = [...ancestors, { id: tab.id, title: tab.title }]
    if (tab.id === targetId) {
      return nextAncestors
    }

    const nestedPath = findTabPathById(tab.children, targetId, nextAncestors)
    if (nestedPath) {
      return nestedPath
    }
  }

  return null
}

function renameTabTitle(tabs: Project["tabs"], targetId: string, nextTitle: string): Project["tabs"] {
  return tabs.map((tab) => {
    if (tab.id === targetId) {
      return {
        ...tab,
        title: nextTitle,
      }
    }

    return {
      ...tab,
      children: renameTabTitle(tab.children, targetId, nextTitle),
    }
  })
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

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function totalWordsAcrossTabs(tabs: Project["tabs"], contentById: Project["contentById"]): number {
  return tabs.reduce((total, tab) => {
    const currentWords = countWordsFromContent(contentById[tab.id] ?? "")
    return total + currentWords + totalWordsAcrossTabs(tab.children, contentById)
  }, 0)
}

type FlattenedTabWordStat = {
  id: string
  title: string
  depth: number
  wordCount: number
}

function flattenTabWordStats(tabs: Project["tabs"], contentById: Project["contentById"], depth = 0): FlattenedTabWordStat[] {
  return tabs.flatMap((tab) => {
    const current: FlattenedTabWordStat = {
      id: tab.id,
      title: tab.title,
      depth,
      wordCount: countWordsFromContent(contentById[tab.id] ?? ""),
    }

    return [current, ...flattenTabWordStats(tab.children, contentById, depth + 1)]
  })
}

export type EditorWorkspaceProps = {
  sessionToken: string
  project: Project
  tuskAiActivated: boolean
  isStartingTuskCheckout: boolean
  activeContent: string
  editorFontSize: number
  menuBarEnabled: boolean
  flagsEnabled: boolean
  showWordCount: boolean
  isEditorTyping: boolean
  activeFolderName?: string | null
  projects: Project[]
  folders: ProjectFolder[]
  setProjects: Dispatch<SetStateAction<Project[]>>
  setFolders: Dispatch<SetStateAction<ProjectFolder[]>>
  onOpenProject: (projectId: string) => void
  onCreateProject: () => void
  onCreateFolder: () => void
  onOpenProjectSettings: (projectId: string) => void
  onReturnToDashboard: () => void
  onStartTuskCheckout: () => void
  onToggleSettings: () => void
  onProjectChange: (updater: (project: Project) => Project) => void
  onEditorTypingStateChange: (isTyping: boolean) => void
}

export default function EditorWorkspace({
  sessionToken,
  project,
  tuskAiActivated,
  isStartingTuskCheckout,
  activeContent,
  editorFontSize,
  menuBarEnabled,
  flagsEnabled,
  showWordCount,
  isEditorTyping,
  activeFolderName = null,
  projects,
  folders,
  setProjects,
  setFolders,
  onOpenProject,
  onCreateProject,
  onCreateFolder,
  onOpenProjectSettings,
  onToggleSettings,
  onReturnToDashboard,
  onStartTuskCheckout,
  onProjectChange,
  onEditorTypingStateChange,
}: EditorWorkspaceProps) {
  const entryTerms = getProjectEntryTerms(project.kind)
  const markdownEditorEnabled = Boolean(project.markdownEditorEnabled)
  const [selectedWordCount, setSelectedWordCount] = useState<number | null>(null)
  const [isWordStatsOpen, setIsWordStatsOpen] = useState(false)
  const [isDetailedWordStatsOpen, setIsDetailedWordStatsOpen] = useState(false)
  const [includedTabsById, setIncludedTabsById] = useState<Record<string, boolean>>({})
  const [isLeftRailOpen, setIsLeftRailOpen] = useState(true)
  const [isRightRailOpen, setIsRightRailOpen] = useState(false)
  const [leftPanelWidth, setLeftPanelWidth] = useState(300)
  const [rightPanelWidth, setRightPanelWidth] = useState(280)
  const [draggingPanel, setDraggingPanel] = useState<"left" | "right" | null>(null)
  const [showProjectBrowser, setShowProjectBrowser] = useState(false)
  const bodyRef = useRef<HTMLDivElement | null>(null)

  const activeDocumentTitle = useMemo(() => {
    if (!project.activeId) {
      return entryTerms.untitled
    }

    return findTabTitleById(project.tabs, project.activeId) ?? entryTerms.untitled
  }, [project.tabs, project.activeId, entryTerms.untitled])

  const activeDocumentWordCount = useMemo(() => countWordsFromContent(activeContent), [activeContent])
  const activeDocumentCharacterCount = useMemo(() => activeContent.length, [activeContent])
  const flatTabWordStats = useMemo(
    () => flattenTabWordStats(project.tabs, project.contentById),
    [project.tabs, project.contentById],
  )
  const totalDocumentWordCount = useMemo(
    () => totalWordsAcrossTabs(project.tabs, project.contentById),
    [project.tabs, project.contentById],
  )
  const selectedTotalDocumentWordCount = useMemo(
    () => flatTabWordStats.reduce((total, stat) => total + (includedTabsById[stat.id] === false ? 0 : stat.wordCount), 0),
    [flatTabWordStats, includedTabsById],
  )
  const includedChapterCount = useMemo(
    () => flatTabWordStats.reduce((total, stat) => total + (includedTabsById[stat.id] === false ? 0 : 1), 0),
    [flatTabWordStats, includedTabsById],
  )
  const tabIdSignature = useMemo(() => flatTabWordStats.map((stat) => stat.id).join("|"), [flatTabWordStats])
  const orderedTabIds = useMemo(() => collectTabIds(project.tabs), [project.tabs])
  const activeTabIndex = useMemo(() => {
    if (!project.activeId) {
      return -1
    }

    return orderedTabIds.indexOf(project.activeId)
  }, [orderedTabIds, project.activeId])
  const previousTabId = activeTabIndex > 0 ? orderedTabIds[activeTabIndex - 1] : null
  const nextTabId = activeTabIndex >= 0 && activeTabIndex < orderedTabIds.length - 1 ? orderedTabIds[activeTabIndex + 1] : null
  const activeTabPath = useMemo(() => {
    if (!project.activeId) {
      return [] as Array<{ id: string; title: string }>
    }

    return findTabPathById(project.tabs, project.activeId) ?? []
  }, [project.tabs, project.activeId])

  const currentCountLabel = selectedWordCount === null
    ? `${activeDocumentWordCount.toLocaleString()} ${activeDocumentWordCount === 1 ? "word" : "words"}`
    : `${selectedWordCount.toLocaleString()} ${selectedWordCount === 1 ? "word" : "words"} selected`

  useEffect(() => {
    setSelectedWordCount(null)
    setIsWordStatsOpen(false)
    setIsDetailedWordStatsOpen(false)
  }, [project.activeId])

  useEffect(() => {
    setIncludedTabsById((current) => {
      const next: Record<string, boolean> = {}
      for (const stat of flatTabWordStats) {
        next[stat.id] = current[stat.id] ?? true
      }
      return next
    })
  }, [tabIdSignature, flatTabWordStats])

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

  useEffect(() => {
    // Menu action emits a global event; this page handles it for the current project.
    const onExportRequest = () => {
      if (project.markdownEditorEnabled) {
        void downloadProjectAsMarkdown(project)
        return
      }

      exportProjectAsPdf(project)
    }

    window.addEventListener(EXPORT_ALL_TABS_PDF_EVENT, onExportRequest)
    return () => {
      window.removeEventListener(EXPORT_ALL_TABS_PDF_EVENT, onExportRequest)
    }
  }, [project])

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
        <div className="editor-workspace__doc-path">
          <div className="editor-workspace__doc-nav" aria-label="Document navigation">
            <button
              type="button"
              className="editor-workspace__doc-nav-btn"
              aria-label="Go to previous tab"
              disabled={!previousTabId}
              onClick={() => {
                if (!previousTabId) {
                  return
                }

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
                if (!nextTabId) {
                  return
                }

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
                  onClick={onReturnToDashboard}
                  aria-label="Open project folder"
                >
                  <Folder size={14} aria-hidden={true} />
                  <span>{activeFolderName}</span>
                </button>
                <span className="editor-workspace__doc-path-separator" aria-hidden={true}>/</span>
                <button
                  type="button"
                  className="editor-workspace__doc-path-btn editor-workspace__doc-path-segment"
                  onClick={onReturnToDashboard}
                  aria-label="Open project library"
                >
                  {project.name}
                </button>
              </>
            ) : (
              <button
                type="button"
                className="editor-workspace__doc-path-btn editor-workspace__doc-path-segment editor-workspace__doc-path-segment--folder"
                onClick={onReturnToDashboard}
                aria-label="Open project library"
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
        <div className="editor-workspace__left-rail-container">
          {isLeftRailOpen ? (
            <button
              type="button"
              className="editor-workspace__panel-toggle editor-workspace__left-rail-toggle"
              aria-label="Collapse left panel"
              onClick={() => setIsLeftRailOpen(false)}
            >
              <PanelLeft size={16} aria-hidden={true} />
            </button>
          ) : null}
          <aside className="editor-workspace__left-rail">
          <div className="editor-workspace__rail-header">
            <div className={`editor-workspace__rail-header-layer ${showProjectBrowser ? "editor-workspace__rail-header-layer--active" : ""}`.trim()}>
              <button
                type="button"
                className="editor-workspace__rail-back"
                aria-label="Back to project library"
                onClick={onReturnToDashboard}
              >
                <ArrowLeft size={14} aria-hidden={true} />
                <span>Back to Project Library</span>
              </button>
              <button
                type="button"
                className="editor-workspace__rail-create"
                aria-label="Create Project"
                onClick={() => {
                  onCreateProject()
                  setShowProjectBrowser(false)
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

            <div className={`editor-workspace__rail-header-layer ${!showProjectBrowser ? "editor-workspace__rail-header-layer--active" : ""}`.trim()}>
              <button
                type="button"
                className="editor-workspace__rail-back"
                aria-label="Browse all projects"
                onClick={() => setShowProjectBrowser(true)}
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
            style={{ transform: showProjectBrowser ? "translateX(0)" : "translateX(-50%)" }}
          >
            <div className="editor-workspace__rail-slide">
              <ProjectBrowserPanel
                projects={projects}
                folders={folders}
                activeProjectId={project.id}
                onOpenProject={(projectId) => {
                  onOpenProject(projectId)
                  setShowProjectBrowser(false)
                }}
                onOpenProjectSettings={(projectId) => {
                  onOpenProjectSettings(projectId)
                  setShowProjectBrowser(false)
                }}
                setFolders={setFolders}
                setProjects={setProjects}
              />
            </div>

            <div className="editor-workspace__rail-slide">
              <DocumentTabs
                projectName={project.name}
                tabs={project.tabs}
                projectKind={project.kind}
                activeId={project.activeId}
                isVisible={isLeftRailOpen && !showProjectBrowser}
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
            </div>
          </div>
        </aside>
          {showWordCount ? (
            <div className="editor-workspace__word-count-wrap">
              <button
                type="button"
                className="editor-workspace__word-count"
                aria-live="polite"
                aria-atomic="true"
                aria-expanded={isWordStatsOpen}
                onClick={() => setIsWordStatsOpen((prev) => !prev)}
              >
                {currentCountLabel}
              </button>
            </div>
          ) : null}
        </div>

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
          {project.activeId && (project.pinboardIds ?? []).includes(project.activeId) ? (
            <PinboardEditor
              documentId={project.activeId}
              content={activeContent}
              onContentChange={(nextContent) => {
                onProjectChange((currentProject) => {
                  if (!currentProject.activeId) {
                    return currentProject
                  }

                  return {
                    ...currentProject,
                    contentById: {
                      ...currentProject.contentById,
                      [currentProject.activeId]: nextContent,
                    },
                  }
                })
              }}
            />
          ) : markdownEditorEnabled ? (
            <MarkdownEditor
              documentId={project.activeId}
              content={activeContent}
              editorFontSize={editorFontSize}
              onWordCountChange={({ selectedWordCount: nextSelectionCount }) => {
                setSelectedWordCount(nextSelectionCount)
              }}
              onTypingStateChange={onEditorTypingStateChange}
              onContentChange={(nextContent) => {
                onProjectChange((currentProject) => {
                  if (!currentProject.activeId) {
                    return currentProject
                  }

                  return {
                    ...currentProject,
                    contentById: {
                      ...currentProject.contentById,
                      [currentProject.activeId]: nextContent,
                    },
                  }
                })
              }}
            />
          ) : (
            <Editor
              documentId={project.activeId}
              documentTitle={activeDocumentTitle}
              editorFontSize={editorFontSize}
              content={activeContent}
              flagsEnabled={flagsEnabled}
              onWordCountChange={({ selectedWordCount: nextSelectionCount }) => {
                setSelectedWordCount(nextSelectionCount)
              }}
              onTypingStateChange={onEditorTypingStateChange}
              onDocumentTitleChange={(nextTitle) => {
                onProjectChange((currentProject) => {
                  if (!currentProject.activeId) {
                    return currentProject
                  }

                  const trimmed = nextTitle.trim()
                  const fallbackTitle = getNextEntryName(currentProject.tabs, getProjectEntryTerms(currentProject.kind).singular)
                  const resolvedTitle = trimmed || fallbackTitle

                  return {
                    ...currentProject,
                    tabs: renameTabTitle(currentProject.tabs, currentProject.activeId, resolvedTitle),
                  }
                })
              }}
              onContentChange={(nextContent) => {
                onProjectChange((currentProject) => {
                  if (!currentProject.activeId) {
                    return currentProject
                  }

                  return {
                    ...currentProject,
                    contentById: {
                      ...currentProject.contentById,
                      [currentProject.activeId]: nextContent,
                    },
                  }
                })
              }}
            />
          )}
        </div>

        <div
          className={`editor-workspace__resizer editor-workspace__resizer--right ${draggingPanel === "right" ? "editor-workspace__resizer--dragging" : ""} ${!isRightRailOpen ? "editor-workspace__resizer--hidden" : ""}`.trim()}
          role="separator"
          aria-label="Resize right panel"
          onMouseDown={() => setDraggingPanel("right")}
        />

        <aside className="editor-workspace__right-rail">
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
        </aside>
      </div>

      <Modal
        isOpen={isWordStatsOpen}
        onClose={() => {
          setIsWordStatsOpen(false)
          setIsDetailedWordStatsOpen(false)
        }}
        title="Document Stats"
        closeLabel="Close stats"
        panelClassName="editor-workspace__word-stats-modal"
      >
        <div className="editor-workspace__word-stats-summary" role="group" aria-label="Summary metrics">
          <div className="editor-workspace__word-stats-row">
            <span>Current Tab Words</span>
            <strong>{activeDocumentWordCount.toLocaleString()}</strong>
          </div>
          <div className="editor-workspace__word-stats-row">
            <span>Current Tab Characters</span>
            <strong>{activeDocumentCharacterCount.toLocaleString()}</strong>
          </div>
          <div className="editor-workspace__word-stats-row editor-workspace__word-stats-row--highlight">
            <span>Selected Total Words</span>
            <strong>{selectedTotalDocumentWordCount.toLocaleString()}</strong>
          </div>
          <div className="editor-workspace__word-stats-row">
            <span>All Project Words</span>
            <strong>{totalDocumentWordCount.toLocaleString()}</strong>
          </div>
        </div>

        <button
          type="button"
          className="editor-workspace__word-stats-detail-toggle"
          aria-expanded={isDetailedWordStatsOpen}
          onClick={() => setIsDetailedWordStatsOpen((prev) => !prev)}
        >
          {isDetailedWordStatsOpen ? "Hide Detailed View" : "Show Detailed View"}
        </button>

        {isDetailedWordStatsOpen ? (
          <section className="editor-workspace__word-stats-detail" aria-label="Chapter selection for totals">
            <p className="editor-workspace__word-stats-detail-note">
              Included chapters: {includedChapterCount}/{flatTabWordStats.length}
            </p>
            <ul className="editor-workspace__word-stats-list">
              {flatTabWordStats.map((stat) => {
                const isIncluded = includedTabsById[stat.id] !== false
                return (
                  <li key={stat.id} className="editor-workspace__word-stats-item">
                    <label className="editor-workspace__word-stats-item-label" style={{ paddingLeft: `${stat.depth * 12}px` }}>
                      <input
                        type="checkbox"
                        checked={isIncluded}
                        onChange={(event) => {
                          const { checked } = event.target
                          setIncludedTabsById((current) => ({
                            ...current,
                            [stat.id]: checked,
                          }))
                        }}
                      />
                      <span className="editor-workspace__word-stats-item-title">{stat.title}</span>
                    </label>
                    <strong>{stat.wordCount.toLocaleString()}</strong>
                  </li>
                )
              })}
            </ul>
          </section>
        ) : null}
      </Modal>
    </div>
  )
}
