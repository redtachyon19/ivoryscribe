import { useMemo, type Dispatch, type SetStateAction } from "react"
import AppShell from "../components/layout/AppShell"
import LibraryRouter from "../components/library/LibraryRouter"
import EditorWorkspace from "../components/editor/EditorWorkspace"
import WordStatsModal from "../components/editor/WordStatsModal"
import { useNavigationHistory } from "../../core/hooks/useNavigationHistory"
import { useFindReplaceModal } from "../../core/hooks/useFindReplaceModal"
import { useLibraryNavigation } from "../components/library/useLibraryNavigation"
import { useTabViewMode } from "../components/editor/hooks/useTabViewMode"
import { useTabMarkdownViewMode } from "../components/editor/hooks/useTabMarkdownViewMode"
import { useViewModeShortcuts } from "../components/editor/hooks/useViewModeShortcuts"
import { useDocumentStats } from "../components/editor/hooks/useDocumentStats"
import { useProjectExport } from "../components/editor/hooks/useProjectExport"
import { useProposedEditReview } from "../components/editor/hooks/useProposedEditReview"
import { useSpellCheckOrchestration } from "../components/editor/hooks/useSpellCheckOrchestration"
import {
  collectTabSequence,
  findTabPathById,
  findTabTitleById,
  getProjectEntryTerms,
  getProjectMarkdownIds,
  type Project,
} from "../../core/utils/projects"
import type { ProjectFolder } from "./Library"
import type { PendingShareRequest } from "../../core/api"
import type { VersionSettingsEntry } from "../../core/state/versioning"
import "./Library.css"
import "./Editor.css"

export type EditorProps = {
  sessionToken: string
  project: Project | null
  tuskAiActivated: boolean
  isStartingTuskCheckout: boolean
  activeContent: string
  /** Current workspace root from settings. Read-only kinds (PDFs) store
   *  paths relative to this and resolve to absolute at render time, so
   *  the path always reflects the chosen workspace and never a cached
   *  absolute string. Null in cloud / web mode. */
  workspaceRoot?: string | null
  /** Settings toggle: PDFViewer rasterises pages with the app palette
   *  background + text colour when true. Forwarded as-is. */
  matchPdfToPalette?: boolean
  editorFontSize: number
  menuBarEnabled: boolean
  translucentNavPanel: boolean
  flagsEnabled: boolean
  showWordCount: boolean
  isEditorTyping: boolean
  activeFolderName?: string | null
  projects: Project[]
  folders: ProjectFolder[]
  setProjects: Dispatch<SetStateAction<Project[]>>
  setFolders: Dispatch<SetStateAction<ProjectFolder[]>>
  onOpenProject: (projectId: string) => void
  onCreateProject: (kind: import("../../core/utils/projects").ProjectKind) => void
  onCreateFolder: () => void
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
  setBookCounter: Dispatch<SetStateAction<number>>
  onProjectCreated?: (project: Project) => void
  onOpenProjectInNewTab: (projectId: string) => void
  activeProjectVersionsByProjectId?: Record<string, VersionSettingsEntry[]>
  onShowVersionHistory?: (projectId: string) => void
  projectDocumentMap: Record<string, string>
  onPermanentlyDeleteProjects?: (ids: Set<string>) => Promise<void>
  userEmail?: string
  sharedProjectIds?: Set<string>
  ownerEmailByProjectId?: Map<string, string>
  pendingShareRequests: PendingShareRequest[]
  onAcceptShareRequest: (shareId: string) => void
  onRejectShareRequest: (shareId: string) => void
  onRefreshPendingShareRequests: () => void
  /** Local mode: upload the local file as a cloud Document and stamp it with
   *  the returned cloud-id. Wired through to ShareDialog so the user can
   *  enable cloud sharing for a previously local-only project. */
  onEnableCloudSharing?: (projectId: string) => Promise<string | null>
  /** Promote a local project to cloud: upload + trash local file.
   *  Returns the new cloud doc id, or null if it failed / cancelled. */
  onMoveProjectToCloud?: (projectId: string) => Promise<string | null>
  /** Copy the project's absolute on-disk path to the clipboard. Only
   *  defined for local projects in Electron. */
  onCopyProjectPath?: (projectId: string) => void
  /** Reveal the project's on-disk file in the OS file manager. Only
   *  defined for local projects in Electron. */
  onShowProjectInFinder?: (projectId: string) => void
  /** Spawn a new BrowserWindow rooted at this folder's on-disk directory.
   *  Only defined for local mode (cloud folders have no directory). */
  onOpenFolderInNewWindow?: (folderId: string) => void
  /** macOS Finder label painter — fires alongside in-app color changes so
   *  the folder gets the same color in Finder. No-op on other OSes or
   *  when there's no on-disk folder. */
  onApplyFolderFinderColor?: (folderId: string, color: string | null | undefined) => void
}

/**
 * The Editor page is a thin coordinator: it resolves the editing concerns into
 * focused hooks (library navigation, document stats, export, spell-check,
 * AI diff review, view mode) and renders the chrome (`AppShell`) around either
 * the library (`LibraryRouter`) or the editing surface (`EditorWorkspace`).
 */
export default function Editor({
  sessionToken,
  project,
  tuskAiActivated,
  isStartingTuskCheckout,
  activeContent,
  workspaceRoot,
  matchPdfToPalette,
  editorFontSize,
  menuBarEnabled,
  translucentNavPanel,
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
  onToggleSettings,
  onReturnToDashboard,
  onStartTuskCheckout,
  onProjectChange,
  onEditorTypingStateChange,
  view,
  activeProjectId,
  setActiveProjectId,
  bookCounter,
  setBookCounter,
  onProjectCreated,
  onOpenProjectInNewTab,
  activeProjectVersionsByProjectId = {},
  onShowVersionHistory,
  projectDocumentMap,
  onPermanentlyDeleteProjects,
  userEmail,
  sharedProjectIds,
  ownerEmailByProjectId,
  pendingShareRequests,
  onAcceptShareRequest,
  onRejectShareRequest,
  onRefreshPendingShareRequests,
  onEnableCloudSharing,
  onMoveProjectToCloud,
  onCopyProjectPath,
  onShowProjectInFinder,
  onOpenFolderInNewWindow,
  onApplyFolderFinderColor,
}: EditorProps) {
  const entryTerms = project
    ? getProjectEntryTerms(project.kind)
    : { singular: "Chapter", plural: "Chapters", untitled: "Untitled" }

  /* ── Editing concerns, each owned by a focused hook ── */
  const library = useLibraryNavigation()
  const viewModeState = useTabViewMode(project)
  const markdownViewModeState = useTabMarkdownViewMode(project)
  const documentStats = useDocumentStats(project, activeContent)
  const proposedEditReview = useProposedEditReview({ project, activeContent, onProjectChange })

  /* ── Derived facts about the active document. These are keyed on the
       specific project slices they read — `tabs`, `activeId`, the id arrays —
       all referentially stable across content keystrokes, rather than the
       whole `project` object (a fresh reference on every edit). Hoisting the
       slices into locals keeps the memo bodies and dependency lists aligned,
       which the React Compiler requires to preserve the memoization. ── */
  const projectTabs = project?.tabs ?? null
  const activeTabId = project?.activeId ?? null
  const projectPinboardIds = project?.pinboardIds
  const projectMarkdownIds = project?.markdownIds
  const projectPlaintextIds = project?.plaintextIds
  const projectPdfIds = project?.pdfIds
  const projectImageIds = project?.imageIds
  const projectMarkdownEditorEnabled = project?.markdownEditorEnabled
  const untitledLabel = entryTerms.untitled

  const activeDocumentType = useMemo<"prose" | "pinboard" | "markdown" | "plaintext" | "pdf" | "image">(() => {
    if (!activeTabId || !projectTabs) return "prose"
    if ((projectPinboardIds ?? []).includes(activeTabId)) return "pinboard"
    if ((projectPdfIds ?? []).includes(activeTabId)) return "pdf"
    if ((projectImageIds ?? []).includes(activeTabId)) return "image"
    if ((projectPlaintextIds ?? []).includes(activeTabId)) return "plaintext"
    const markdownIds = getProjectMarkdownIds({
      tabs: projectTabs,
      markdownIds: projectMarkdownIds,
      markdownEditorEnabled: projectMarkdownEditorEnabled,
    })
    if (markdownIds.includes(activeTabId)) return "markdown"
    return "prose"
  }, [activeTabId, projectTabs, projectPinboardIds, projectPdfIds, projectImageIds, projectPlaintextIds, projectMarkdownIds, projectMarkdownEditorEnabled])

  /* ── ⌘/Ctrl + 1/2/3 view switching. Prose: Draft / Typewriter. Markdown:
       Editor / Both / View. ── */
  useViewModeShortcuts({
    enabled: view === "editor" && !!project?.activeId,
    activeDocumentType,
    setProseViewMode: viewModeState.setViewMode,
    setMarkdownViewMode: markdownViewModeState.setMarkdownViewMode,
  })

  const activeTabPath = useMemo(() => {
    if (!activeTabId || !projectTabs) {
      return [] as Array<{ id: string; title: string }>
    }

    return findTabPathById(projectTabs, activeTabId) ?? []
  }, [activeTabId, projectTabs])

  const exportTabs = useMemo(
    () => (projectTabs ? collectTabSequence(projectTabs) : []),
    [projectTabs],
  )

  const activeDocumentTitle = useMemo(() => {
    if (!projectTabs || !activeTabId) {
      return untitledLabel
    }

    return findTabTitleById(projectTabs, activeTabId) ?? untitledLabel
  }, [projectTabs, activeTabId, untitledLabel])

  const projectExport = useProjectExport(project)
  const spellCheck = useSpellCheckOrchestration({ view, project, activeContent, activeDocumentType, onProjectChange })

  const { canGoBack, canGoForward, goBack, goForward } = useNavigationHistory({
    view,
    activeId: project?.activeId ?? null,
    librarySection: library.librarySection,
    onOpenProject,
    onReturnToDashboard,
    onProjectChange,
    onLibrarySectionChange: library.setLibrarySection,
    activeProjectId,
  })
  const findReplace = useFindReplaceModal({
    view,
    project,
    onProjectChange,
  })

  return (
    <AppShell
      menuBarEnabled={menuBarEnabled}
      translucentNavPanel={translucentNavPanel}
      isEditorTyping={isEditorTyping}
      view={view}
      project={project}
      activeDocumentType={activeDocumentType}
      activeFolderName={activeFolderName}
      canGoBack={canGoBack}
      canGoForward={canGoForward}
      onGoBack={goBack}
      onGoForward={goForward}
      activeTabPath={activeTabPath}
      onProjectChange={onProjectChange}
      onToggleSettings={() => {
        findReplace.close()
        onToggleSettings()
      }}
      projects={projects}
      folders={folders}
      showWordCount={showWordCount}
      currentCountLabel={documentStats.currentCountLabel}
      isWordStatsOpen={documentStats.isWordStatsOpen}
      setProjects={setProjects}
      setFolders={setFolders}
      onCreateProject={onCreateProject}
      onCreateFolder={onCreateFolder}
      onOpenProject={onOpenProject}
      onOpenProjectInNewTab={onOpenProjectInNewTab}
      onReturnToDashboard={onReturnToDashboard}
      librarySection={library.librarySection}
      setLibrarySection={library.setLibrarySection}
      onToggleWordStats={documentStats.toggleWordStats}
      sessionToken={sessionToken}
      projectDocumentMap={projectDocumentMap}
      onCopyProjectPath={onCopyProjectPath}
      onShowProjectInFinder={onShowProjectInFinder}
      onMoveProjectToCloud={onMoveProjectToCloud}
      onOpenFolderInNewWindow={onOpenFolderInNewWindow}
      onApplyFolderFinderColor={onApplyFolderFinderColor}
      sharedProjectIds={sharedProjectIds}
      ownerEmailByProjectId={ownerEmailByProjectId}
      userEmail={userEmail}
      tuskAiActivated={tuskAiActivated}
      isStartingTuskCheckout={isStartingTuskCheckout}
      onStartTuskCheckout={onStartTuskCheckout}
      pendingHunkCount={proposedEditReview.pendingHunkCount}
      pendingEditTabIds={proposedEditReview.pendingEditTabIds}
      onProposedEdits={proposedEditReview.handleProposedEdits}
      onAcceptAllPendingHunks={proposedEditReview.handleAcceptAllPendingHunks}
      onRejectAllProposedEdits={proposedEditReview.handleRejectAllProposedEdits}
      viewToggleAvailable={view === "editor" && activeDocumentType === "prose" && !!project?.activeId}
      viewMode={viewModeState.activeViewMode}
      onToggleViewMode={viewModeState.toggleViewMode}
      markdownViewToggleAvailable={view === "editor" && activeDocumentType === "markdown" && !!project?.activeId}
      markdownViewMode={markdownViewModeState.activeMarkdownViewMode}
      onSetMarkdownViewMode={markdownViewModeState.setMarkdownViewMode}
    >
      {view === "projects" ? (
        <LibraryRouter
          librarySection={library.librarySection}
          sessionToken={sessionToken}
          projects={projects}
          folders={folders}
          activeProjectId={activeProjectId}
          bookCounter={bookCounter}
          projectDocumentMap={projectDocumentMap}
          setBookCounter={setBookCounter}
          setProjects={setProjects}
          setFolders={setFolders}
          setActiveProjectId={setActiveProjectId}
          onOpenProject={onOpenProject}
          onOpenProjectInNewTab={onOpenProjectInNewTab}
          onProjectCreated={onProjectCreated}
          activeProjectVersionsByProjectId={activeProjectVersionsByProjectId}
          onShowVersionHistory={onShowVersionHistory}
          onPermanentlyDeleteProjects={onPermanentlyDeleteProjects}
          pendingShareRequests={pendingShareRequests}
          onAcceptShareRequest={onAcceptShareRequest}
          onRejectShareRequest={onRejectShareRequest}
          onRefreshPendingShareRequests={onRefreshPendingShareRequests}
          userEmail={userEmail}
          sharedProjectIds={sharedProjectIds}
          ownerEmailByProjectId={ownerEmailByProjectId}
          onEnableCloudSharing={onEnableCloudSharing}
          onMoveProjectToCloud={onMoveProjectToCloud}
          onCopyProjectPath={onCopyProjectPath}
          onShowProjectInFinder={onShowProjectInFinder}
          onOpenFolderInNewWindow={onOpenFolderInNewWindow}
      onApplyFolderFinderColor={onApplyFolderFinderColor}
        />
      ) : project ? (
        <EditorWorkspace
          project={project}
          activeContent={activeContent}
          workspaceRoot={workspaceRoot}
          matchPdfToPalette={matchPdfToPalette}
          editorFontSize={editorFontSize}
          flagsEnabled={flagsEnabled}
          activeViewMode={viewModeState.activeViewMode}
          activeMarkdownViewMode={markdownViewModeState.activeMarkdownViewMode}
          onSetMarkdownViewMode={markdownViewModeState.setMarkdownViewMode}
          activeDocumentType={activeDocumentType}
          activeDocumentTitle={activeDocumentTitle}
          exportTabs={exportTabs}
          onProjectChange={onProjectChange}
          onEditorTypingStateChange={onEditorTypingStateChange}
          setSelectedWordCount={documentStats.setSelectedWordCount}
          findReplace={findReplace}
          spellCheck={spellCheck}
          projectExport={projectExport}
          proposedEditReview={proposedEditReview}
        />
      ) : null}

      <WordStatsModal stats={documentStats} />
    </AppShell>
  )
}
