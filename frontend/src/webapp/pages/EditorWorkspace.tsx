import { useEffect, useMemo, useState } from "react"
import { BookText, Library, NotebookText } from "lucide-react"
import Editor from "../components/editor/Editor.tsx"
import MarkdownEditor from "../components/editor/MarkdownEditor"
import DocumentTabs from "../components/editor/DocumentTabs"
import TuskAiTab from "../components/editor/TuskAiTab"
import { EXPORT_ALL_TABS_PDF_EVENT } from "../../core/editorEvents"
import { countWordsFromContent, downloadProjectAsMarkdown } from "../../core/markdown"
import { exportProjectAsPdf } from "../../core/pdfExport"
import { getProjectEntryTerms, normalizeProjectAfterTabs, type Project } from "../../core/projects"
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

function formatWordCount(value: number) {
  if (value < 1_000) {
    return `${value}`
  }

  if (value < 10_000) {
    const compact = Math.round(value / 100) / 10
    return Number.isInteger(compact) ? `${compact.toFixed(0)}k` : `${compact.toFixed(1)}k`
  }

  return `${Math.round(value / 1_000)}k`
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
  onReturnToDashboard: () => void
  onStartTuskCheckout: () => void
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
  onReturnToDashboard,
  onStartTuskCheckout,
  onProjectChange,
  onEditorTypingStateChange,
}: EditorWorkspaceProps) {
  const entryTerms = getProjectEntryTerms(project.kind)
  const ProjectIcon = project.kind === "Book" ? BookText : NotebookText
  const markdownEditorEnabled = Boolean(project.markdownEditorEnabled)
  const [selectedWordCount, setSelectedWordCount] = useState<number | null>(null)

  const activeDocumentTitle = useMemo(() => {
    if (!project.activeId) {
      return entryTerms.untitled
    }

    return findTabTitleById(project.tabs, project.activeId) ?? entryTerms.untitled
  }, [project.tabs, project.activeId, entryTerms.untitled])

  const activeDocumentWordCount = useMemo(() => countWordsFromContent(activeContent), [activeContent])
  const totalDocumentWordCount = useMemo(
    () => totalWordsAcrossTabs(project.tabs, project.contentById),
    [project.tabs, project.contentById],
  )

  const currentCountLabel = selectedWordCount === null
    ? `${activeDocumentWordCount.toLocaleString()} ${activeDocumentWordCount === 1 ? "word" : "words"}`
    : `${selectedWordCount.toLocaleString()} ${selectedWordCount === 1 ? "word" : "words"} selected`

  useEffect(() => {
    setSelectedWordCount(null)
  }, [project.activeId])

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
    <>
      <div
        className="editor-workspace__project-label-wrap"
        aria-live="polite"
      >
        <button
          type="button"
          className={`editor-workspace__project-label ${menuBarEnabled ? "editor-workspace__project-label--with-menu" : ""} ${isEditorTyping ? "editor-workspace__project-label--hidden" : ""}`.trim()}
          aria-label="Return to project library"
          onClick={onReturnToDashboard}
        >
          <span className="editor-workspace__project-label-content editor-workspace__project-label-content--default" aria-hidden={true}>
            <ProjectIcon size={14} strokeWidth={2} />
            <span>{project.name}</span>
          </span>
          <span className="editor-workspace__project-label-content editor-workspace__project-label-content--return" aria-hidden={true}>
            <Library size={14} strokeWidth={2} />
            <span>Return to project library</span>
          </span>
        </button>
      </div>
      <DocumentTabs
        tabs={project.tabs}
        projectKind={project.kind}
        activeId={project.activeId}
        showWordCount={showWordCount}
        activeDocumentWordCount={activeDocumentWordCount}
        totalDocumentWordCount={totalDocumentWordCount}
        activeToTotalWordCountLabel={`${formatWordCount(activeDocumentWordCount)}/${formatWordCount(totalDocumentWordCount)} words`}
        hideToggle={isEditorTyping}
        onTabsChange={(updater) => {
          // Tab operations can add/reorder/nest docs, so normalize project invariants afterward.
          onProjectChange((currentProject) => normalizeProjectAfterTabs(currentProject, updater(currentProject.tabs)))
        }}
        onSelect={(id) => {
          onProjectChange((currentProject) => ({
            ...currentProject,
            activeId: id,
          }))
        }}
      />
      <TuskAiTab
        hideToggle={isEditorTyping}
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
      {markdownEditorEnabled ? (
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
            // Persist content under the active tab so switching tabs restores previous text.
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
      {showWordCount ? (
        <div className="editor-workspace__word-count" aria-live="polite" aria-atomic="true">
          {currentCountLabel}
        </div>
      ) : null}
    </>
  )
}
