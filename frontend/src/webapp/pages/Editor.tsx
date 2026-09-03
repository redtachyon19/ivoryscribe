import { useEffect, useMemo, type Dispatch, type SetStateAction } from "react"
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
import type { PendingShareRequest } from "@shared/api"
import type { VersionSettingsEntry } from "../../core/state/versioning"
import "./Library.css"
import "./Editor.css"

export type EditorProps = {
  sessionToken: string
  project: Project | null
  tuskAiActivated: boolean
  isStartingTuskCheckout: boolean
  activeContent: string
  workspaceRoot?: string | null
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
  onEnableCloudSharing?: (projectId: string) => Promise<string | null>
  onMoveProjectToCloud?: (projectId: string) => Promise<string | null>
  onCopyProjectPath?: (projectId: string) => void
  onShowProjectInFinder?: (projectId: string) => void
  onOpenFolderInNewWindow?: (folderId: string) => void
  onApplyFolderFinderColor?: (folderId: string, color: string | null | undefined) => void
}

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

  const library = useLibraryNavigation()
  const viewModeState = useTabViewMode(project)
  const markdownViewModeState = useTabMarkdownViewMode(project)
  const documentStats = useDocumentStats(project, activeContent)
  const proposedEditReview = useProposedEditReview({ project, activeContent, onProjectChange })

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

  useEffect(() => {
    const editing = view === "editor" && Boolean(activeTabId)
    document.title = editing ? (activeDocumentTitle.trim() || untitledLabel) : "ivoryscribe"
    return () => {
      document.title = "ivoryscribe"
    }
  }, [view, activeTabId, activeDocumentTitle, untitledLabel])

  const projectExport = useProjectExport(project)
  const spellCheck = useSpellCheckOrchestration({ view, project, activeContent, activeDocumentType, onProjectChange })

  const { canGoBack, canGoForward, goBack, goForward } = useNavigationHistory({
    view,
    activeId: project?.activeId ?? null,
    librarySection: library.librarySection,
    openFolderId: library.openFolderId,
    onOpenProject,
    onReturnToDashboard,
    onProjectChange,
    onLibrarySectionChange: library.setLibrarySection,
    onOpenFolder: library.setOpenFolderId,
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
          openFolderId={library.openFolderId}
          setOpenFolderId={library.setOpenFolderId}
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
