// The editor-content surface: Find & Replace, Spell Check and Export modals,
// plus the four editing surfaces (Pinboard / Typewriter / Markdown / Drafting)
// with their AI diff-review wiring. Extracted from Editor.tsx.

import { Suspense, lazy, type Dispatch, type SetStateAction } from "react"
import DraftingEditor from "./DraftingEditor"
import MarkdownEditor from "./MarkdownEditor"
import PDFViewer from "./PDFViewer"
import PinboardEditor from "./PinboardEditor"
import PlainTextEditor from "./PlainTextEditor"
import TypewriterEditor from "./TypewriterEditor"
import DiffHunkWidgets from "../ai/DiffHunkWidgets"
import ProjectExportModal from "../export/ProjectExportModal"
import FindReplaceModal from "./modals/FindReplaceModal"
import {
  getNextEntryName,
  getProjectEntryTerms,
  renameTabTitle,
  setActiveTabContent,
  type Project,
} from "../../../core/utils/projects"
import type { TabViewMode } from "./utils/viewModePrefs"
import type { MarkdownTabViewMode } from "./utils/markdownViewModePrefs"
import type { useFindReplaceModal } from "../../../core/hooks/useFindReplaceModal"
import type { useSpellCheckOrchestration } from "./hooks/useSpellCheckOrchestration"
import type { useProjectExport } from "./hooks/useProjectExport"
import type { useProposedEditReview } from "./hooks/useProposedEditReview"

const SpellCheckModal = lazy(() => import("./modals/SpellCheckModal"))

type EditorWorkspaceProps = {
  project: Project
  activeContent: string
  editorFontSize: number
  flagsEnabled: boolean
  activeViewMode: TabViewMode
  activeMarkdownViewMode: MarkdownTabViewMode
  onSetMarkdownViewMode: (mode: MarkdownTabViewMode) => void
  activeDocumentType: "prose" | "pinboard" | "markdown" | "plaintext" | "pdf"
  /** Workspace root from settings. PDFViewer joins this with the
   *  project's relative path at render time. Null in cloud mode. */
  workspaceRoot?: string | null
  /** When true, the PDFViewer rasterises pages with the app palette's
   *  background and text colour instead of the document's own. */
  matchPdfToPalette?: boolean
  activeDocumentTitle: string
  exportTabs: Array<{ id: string; title: string }>
  onProjectChange: (updater: (project: Project) => Project) => void
  onEditorTypingStateChange: (isTyping: boolean) => void
  setSelectedWordCount: Dispatch<SetStateAction<number | null>>
  findReplace: ReturnType<typeof useFindReplaceModal>
  spellCheck: ReturnType<typeof useSpellCheckOrchestration>
  projectExport: ReturnType<typeof useProjectExport>
  proposedEditReview: ReturnType<typeof useProposedEditReview>
}

export default function EditorWorkspace({
  project,
  activeContent,
  editorFontSize,
  flagsEnabled,
  activeViewMode,
  activeMarkdownViewMode,
  onSetMarkdownViewMode,
  activeDocumentType,
  workspaceRoot,
  matchPdfToPalette,
  activeDocumentTitle,
  exportTabs,
  onProjectChange,
  onEditorTypingStateChange,
  setSelectedWordCount,
  findReplace,
  spellCheck,
  projectExport,
  proposedEditReview,
}: EditorWorkspaceProps) {
  const {
    tiptapEditor,
    editorStageRef,
    currentEdit,
    isEditOnActiveTab,
    editorContentForActiveTab,
    handleEditorReady,
    handleHunkDecision,
  } = proposedEditReview

  return (
    <>
      <FindReplaceModal
        isOpen={findReplace.isOpen}
        query={findReplace.query}
        replaceQuery={findReplace.replaceQuery}
        normalizedQuery={findReplace.normalizedQuery}
        resultCount={findReplace.resultCount}
        currentIndex={findReplace.currentIndex}
        expanded={findReplace.expanded}
        onQueryChange={findReplace.setQuery}
        onReplaceQueryChange={findReplace.setReplaceQuery}
        onGoNext={findReplace.goToNext}
        onGoPrevious={findReplace.goToPrevious}
        onReplaceCurrent={findReplace.replaceCurrent}
        onReplaceAll={findReplace.replaceAll}
        onToggleExpanded={() => findReplace.setExpanded(!findReplace.expanded)}
        onClose={findReplace.close}
      />

      <Suspense fallback={null}>
        <SpellCheckModal
          isOpen={spellCheck.isSpellCheckOpen}
          documentType={spellCheck.spellCheckDocumentType}
          issue={spellCheck.spellCheckIssue}
          issueIndex={spellCheck.spellCheckIssue ? spellCheck.spellCheckIndex + 1 : 0}
          issueCount={spellCheck.spellCheckIssues.length}
          dictionaryWords={spellCheck.spellCheckDictionary}
          canGoPrevious={spellCheck.spellCheckIndex > 0}
          canGoNext={spellCheck.spellCheckIndex < spellCheck.spellCheckIssues.length - 1}
          onPrevious={spellCheck.goToPreviousSpellCheckIssue}
          onNext={spellCheck.goToNextSpellCheckIssue}
          onIgnore={spellCheck.ignoreSpellCheckIssue}
          onAddToDictionary={spellCheck.addSpellCheckWordToDictionary}
          onRemoveDictionaryWord={spellCheck.removeSpellCheckWordFromDictionary}
          onApplySuggestion={spellCheck.applySpellCheckSuggestion}
          onCommitPrimaryAction={spellCheck.commitSpellCheckPrimaryAction}
          onClose={spellCheck.closeSpellCheckModal}
        />
      </Suspense>

      <ProjectExportModal
        isOpen={Boolean(project && projectExport.pendingExportFormat)}
        format={projectExport.pendingExportFormat}
        tabs={exportTabs}
        onClose={projectExport.closeExportModal}
        onConfirm={({ mode, selectedTabIds }) => {
          if (!projectExport.pendingExportFormat) {
            return
          }

          projectExport.runExport(projectExport.pendingExportFormat, mode, selectedTabIds)
          projectExport.closeExportModal()
        }}
      />

      {activeDocumentType === "pinboard" ? (
        <PinboardEditor
          documentId={project.activeId}
          content={activeContent}
          onContentChange={(nextContent) => {
            onProjectChange((currentProject) => setActiveTabContent(currentProject, nextContent))
          }}
        />
      ) : activeDocumentType === "prose" && activeViewMode === "typewriter" ? (
        <div ref={editorStageRef} className="editor-workspace__editor-stage">
          <TypewriterEditor
            key={isEditOnActiveTab ? `diff-${currentEdit?.id ?? ""}` : `regular-${project.activeId}`}
            documentId={project.activeId}
            content={editorContentForActiveTab}
            readOnly={isEditOnActiveTab}
            onEditorReady={handleEditorReady}
            onWordCountChange={({ selectedWordCount: nextSelectionCount }) => {
              setSelectedWordCount(nextSelectionCount)
            }}
            onTypingStateChange={onEditorTypingStateChange}
            onContentChange={(nextContent) => {
              if (isEditOnActiveTab) return
              onProjectChange((currentProject) => setActiveTabContent(currentProject, nextContent))
            }}
          />
          {isEditOnActiveTab ? (
            <DiffHunkWidgets
              editor={tiptapEditor}
              containerRef={editorStageRef}
              onAcceptHunk={(hunkId) => {
                handleHunkDecision(hunkId, "accepted")
              }}
              onRejectHunk={(hunkId) => {
                handleHunkDecision(hunkId, "rejected")
              }}
            />
          ) : null}
        </div>
      ) : activeDocumentType === "markdown" ? (
        <MarkdownEditor
          documentId={project.activeId}
          content={activeContent}
          editorFontSize={editorFontSize}
          viewMode={activeMarkdownViewMode}
          onViewModeChange={onSetMarkdownViewMode}
          onWordCountChange={({ selectedWordCount: nextSelectionCount }) => {
            setSelectedWordCount(nextSelectionCount)
          }}
          onTypingStateChange={onEditorTypingStateChange}
          onContentChange={(nextContent) => {
            onProjectChange((currentProject) => setActiveTabContent(currentProject, nextContent))
          }}
        />
      ) : activeDocumentType === "plaintext" ? (
        <PlainTextEditor
          documentId={project.activeId}
          content={activeContent}
          editorFontSize={editorFontSize}
          onWordCountChange={({ selectedWordCount: nextSelectionCount }) => {
            setSelectedWordCount(nextSelectionCount)
          }}
          onTypingStateChange={onEditorTypingStateChange}
          onContentChange={(nextContent) => {
            onProjectChange((currentProject) => setActiveTabContent(currentProject, nextContent))
          }}
        />
      ) : activeDocumentType === "pdf" ? (
        // `activeContent` for a PDF is a path RELATIVE to the workspace
        // root, set by `pdfFileToProject` during hydrate. The viewer
        // resolves it to absolute on every render against the current
        // `workspaceRoot` setting — so we never read from a stale
        // absolute path, and switching workspace in settings reroots
        // every PDF automatically.
        <PDFViewer
          workspaceRoot={workspaceRoot ?? null}
          relativePath={activeContent}
          projectId={project.id}
          matchPalette={matchPdfToPalette}
        />
      ) : (
        <div ref={editorStageRef} className="editor-workspace__editor-stage">
          <DraftingEditor
            key={isEditOnActiveTab ? `diff-${currentEdit?.id ?? ""}` : `regular-${project.activeId}`}
            documentId={project.activeId}
            documentTitle={activeDocumentTitle}
            editorFontSize={editorFontSize}
            content={editorContentForActiveTab}
            flagsEnabled={flagsEnabled}
            readOnly={isEditOnActiveTab}
            onEditorReady={handleEditorReady}
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
              if (isEditOnActiveTab) return
              onProjectChange((currentProject) => setActiveTabContent(currentProject, nextContent))
            }}
          />
          {isEditOnActiveTab ? (
            <DiffHunkWidgets
              editor={tiptapEditor}
              containerRef={editorStageRef}
              onAcceptHunk={(hunkId) => {
                handleHunkDecision(hunkId, "accepted")
              }}
              onRejectHunk={(hunkId) => {
                handleHunkDecision(hunkId, "rejected")
              }}
            />
          ) : null}
        </div>
      )}
    </>
  )
}
