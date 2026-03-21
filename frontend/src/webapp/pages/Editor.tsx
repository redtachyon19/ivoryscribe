import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react"
import TextEditor from "../components/editor/TextEditor.tsx"
import MarkdownEditor from "../components/editor/MarkdownEditor"
import PinboardEditor from "../components/editor/PinboardEditor"
import AppShell from "../components/layout/AppShell"
import Modal from "../components/ui/Modal"
import { EXPORT_ALL_TABS_PDF_EVENT } from "../../core/editorEvents"
import { countWordsFromContent, downloadProjectAsMarkdown } from "../../core/markdown"
import { exportProjectAsPdf } from "../../core/pdfExport"
import { collectTabIds, getProjectEntryTerms, type Project } from "../../core/projects"
import type { VersionSettingsEntry } from "../../core/versioning"
import Library, { type ProjectFolder } from "./Library"
import "./Library.css"
import "./Editor.css"

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

export type EditorProps = {
  sessionToken: string
  project: Project | null
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
  // Library integration
  view: "projects" | "editor"
  activeProjectId: string | null
  setActiveProjectId: Dispatch<SetStateAction<string | null>>
  bookCounter: number
  blogCounter: number
  setBookCounter: Dispatch<SetStateAction<number>>
  setBlogCounter: Dispatch<SetStateAction<number>>
  onProjectCreated?: (project: Project) => void
  onOpenProjectInNewTab: (projectId: string) => void
  activeProjectVersionsByProjectId?: Record<string, VersionSettingsEntry[]>
  onShowVersionHistory?: (projectId: string) => void
}

export default function Editor({
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
  view,
  activeProjectId,
  setActiveProjectId,
  bookCounter,
  blogCounter,
  setBookCounter,
  setBlogCounter,
  onProjectCreated,
  onOpenProjectInNewTab,
  activeProjectVersionsByProjectId = {},
  onShowVersionHistory,
}: EditorProps) {
  const entryTerms = project ? getProjectEntryTerms(project.kind) : { singular: "Chapter", plural: "Chapters", untitled: "Untitled" }
  const markdownEditorEnabled = project ? Boolean(project.markdownEditorEnabled) : false
  const [selectedWordCount, setSelectedWordCount] = useState<number | null>(null)
  const [isWordStatsOpen, setIsWordStatsOpen] = useState(false)
  const [isDetailedWordStatsOpen, setIsDetailedWordStatsOpen] = useState(false)
  const [includedTabsById, setIncludedTabsById] = useState<Record<string, boolean>>({})

  const activeDocumentTitle = useMemo(() => {
    if (!project || !project.activeId) {
      return entryTerms.untitled
    }

    return findTabTitleById(project.tabs, project.activeId) ?? entryTerms.untitled
  }, [project, entryTerms.untitled])

  const activeDocumentWordCount = useMemo(() => countWordsFromContent(activeContent), [activeContent])
  const activeDocumentCharacterCount = useMemo(() => activeContent.length, [activeContent])
  const flatTabWordStats = useMemo(
    () => project ? flattenTabWordStats(project.tabs, project.contentById) : [],
    [project],
  )
  const totalDocumentWordCount = useMemo(
    () => project ? totalWordsAcrossTabs(project.tabs, project.contentById) : 0,
    [project],
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
  const orderedTabIds = useMemo(() => project ? collectTabIds(project.tabs) : [], [project])
  const activeTabIndex = useMemo(() => {
    if (!project?.activeId) {
      return -1
    }

    return orderedTabIds.indexOf(project.activeId)
  }, [orderedTabIds, project])
  const previousTabId = activeTabIndex > 0 ? orderedTabIds[activeTabIndex - 1] : null
  const nextTabId = activeTabIndex >= 0 && activeTabIndex < orderedTabIds.length - 1 ? orderedTabIds[activeTabIndex + 1] : null
  const activeTabPath = useMemo(() => {
    if (!project?.activeId) {
      return [] as Array<{ id: string; title: string }>
    }

    return findTabPathById(project.tabs, project.activeId) ?? []
  }, [project])

  const currentCountLabel = selectedWordCount === null
    ? `${activeDocumentWordCount.toLocaleString()} ${activeDocumentWordCount === 1 ? "word" : "words"}`
    : `${selectedWordCount.toLocaleString()} ${selectedWordCount === 1 ? "word" : "words"} selected`





  useEffect(() => {
    setSelectedWordCount(null)
    setIsWordStatsOpen(false)
    setIsDetailedWordStatsOpen(false)
  }, [project?.activeId])

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
    // Menu action emits a global event; this page handles it for the current project.
    const onExportRequest = () => {
      if (!project) return
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
    <AppShell
      menuBarEnabled={menuBarEnabled}
      isEditorTyping={isEditorTyping}
      view={view}
      project={project}
      activeFolderName={activeFolderName}
      previousTabId={previousTabId}
      nextTabId={nextTabId}
      activeTabPath={activeTabPath}
      onProjectChange={onProjectChange}
      onToggleSettings={onToggleSettings}
      projects={projects}
      folders={folders}
      showWordCount={showWordCount}
      currentCountLabel={currentCountLabel}
      isWordStatsOpen={isWordStatsOpen}
      setProjects={setProjects}
      setFolders={setFolders}
      onCreateProject={onCreateProject}
      onCreateFolder={onCreateFolder}
      onOpenProject={onOpenProject}
      onOpenProjectSettings={onOpenProjectSettings}
      onReturnToDashboard={onReturnToDashboard}
      onToggleWordStats={() => setIsWordStatsOpen((prev) => !prev)}
      sessionToken={sessionToken}
      tuskAiActivated={tuskAiActivated}
      isStartingTuskCheckout={isStartingTuskCheckout}
      onStartTuskCheckout={onStartTuskCheckout}
    >
      {view === "projects" ? (
            <Library
              projects={projects}
              folders={folders}
              activeProjectId={activeProjectId}
              bookCounter={bookCounter}
              blogCounter={blogCounter}
              setBookCounter={setBookCounter}
              setBlogCounter={setBlogCounter}
              onOpenProject={onOpenProject}
              onOpenProjectInNewTab={onOpenProjectInNewTab}
              onProjectCreated={onProjectCreated}
              activeProjectVersionsByProjectId={activeProjectVersionsByProjectId}
              onShowVersionHistory={onShowVersionHistory}
              setProjects={setProjects}
              setFolders={setFolders}
              setActiveProjectId={setActiveProjectId}
            />
          ) : project ? (
            /* ── Editor Content ── */
            <>
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
                <TextEditor
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
            </>
          ) : null}

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
    </AppShell>
  )
}
