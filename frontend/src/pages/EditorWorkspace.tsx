import { useEffect, useMemo } from "react"
import { BookText, Library, NotebookText } from "lucide-react"
import Editor from "../Editor"
import DocumentTabs from "../components/DocumentTabs"
import TuskAiTab from "../components/TuskAiTab"
import { EXPORT_ALL_TABS_PDF_EVENT } from "../core/editorEvents"
import { exportProjectAsPdf } from "../core/pdfExport"
import { getProjectEntryTerms, normalizeProjectAfterTabs, type Project } from "../core/projects"
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

type EditorWorkspaceProps = {
  project: Project
  activeContent: string
  menuBarEnabled: boolean
  flagsEnabled: boolean
  isEditorTyping: boolean
  onReturnToDashboard: () => void
  onProjectChange: (updater: (project: Project) => Project) => void
  onEditorTypingStateChange: (isTyping: boolean) => void
}

export default function EditorWorkspace({
  project,
  activeContent,
  menuBarEnabled,
  flagsEnabled,
  isEditorTyping,
  onReturnToDashboard,
  onProjectChange,
  onEditorTypingStateChange,
}: EditorWorkspaceProps) {
  const entryTerms = getProjectEntryTerms(project.kind)
  const ProjectIcon = project.kind === "Book" ? BookText : NotebookText

  const activeDocumentTitle = useMemo(() => {
    if (!project.activeId) {
      return entryTerms.untitled
    }

    return findTabTitleById(project.tabs, project.activeId) ?? entryTerms.untitled
  }, [project.tabs, project.activeId, entryTerms.untitled])

  useEffect(() => {
    // Menu action emits a global event; this page handles it for the current project.
    const onExportRequest = () => {
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
          aria-label="Return to project dashboard"
          onClick={onReturnToDashboard}
        >
          <span className="editor-workspace__project-label-content editor-workspace__project-label-content--default" aria-hidden={true}>
            <ProjectIcon size={14} strokeWidth={2} />
            <span>{project.name}</span>
          </span>
          <span className="editor-workspace__project-label-content editor-workspace__project-label-content--return" aria-hidden={true}>
            <Library size={14} strokeWidth={2} />
            <span>Return to project dashboard</span>
          </span>
        </button>
      </div>
      <DocumentTabs
        tabs={project.tabs}
        projectKind={project.kind}
        activeId={project.activeId}
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
      <TuskAiTab hideToggle={isEditorTyping} />
      <Editor
        documentId={project.activeId}
        documentTitle={activeDocumentTitle}
        content={activeContent}
        flagsEnabled={flagsEnabled}
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
    </>
  )
}
