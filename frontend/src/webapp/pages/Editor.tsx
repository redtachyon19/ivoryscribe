import { Suspense, lazy, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react"
import TextEditor from "../components/editor/TextEditor.tsx"
import MarkdownEditor from "../components/editor/MarkdownEditor"
import PinboardEditor from "../components/editor/PinboardEditor"
import ProjectExportModal from "../components/export/ProjectExportModal"
import AppShell from "../components/layout/AppShell"
import Modal from "../components/ui/Modal"
import {
  APP_EXPORT_PROJECT_EVENT,
  APP_SPELL_CHECK_EVENT,
  NAVIGATE_ARCHIVE_EVENT,
  NAVIGATE_LIBRARY_EVENT,
  NAVIGATE_RECENT_EVENT,
  NAVIGATE_TRASH_EVENT,
  requestAppSpellCheck,
  requestAppSpellCheckFocus,
  type ExportProjectFormat,
  type SpellCheckFocusDetail,
} from "../../core/editorEvents"
import { countWordsFromContent } from "../../core/markdown"
import { exportProjectAsDocx } from "../components/export/docxExport"
import { downloadProjectAsMarkdown } from "../components/export/markdownExport"
import { exportProjectAsPdf } from "../components/export/pdfExport"
import { exportProjectAsTxt } from "../components/export/txtExport"
import { collectSpellCheckIssues, replaceSpellCheckIssue } from "../components/editor/spellcheck.ts"
import FindReplaceModal from "../components/editor/FindReplaceModal"
import { collectTabSequence, getProjectEntryTerms, getProjectMarkdownIds, type Project } from "../../core/projects"
import type { ExportMode } from "../components/export/exportSelection"
import type { SpellCheckDocumentType } from "../components/editor/spellcheck.ts"
import { useNavigationHistory } from "../../core/useNavigationHistory"
import { useFindReplaceModal } from "../../core/useFindReplaceModal"
import type { VersionSettingsEntry } from "../../core/versioning"
import Library, { type ProjectFolder } from "./Library"
import type { PendingShareRequest } from "../../core/api"
import { deleteDocument } from "../../core/api"
import RecentView from "./Recent"
import ArchiveView from "./Archive"
import TrashView from "./Trash"
import "./Library.css"
import "./Editor.css"

const SpellCheckModal = lazy(() => import("../components/editor/SpellCheckModal"))
const SPELL_CHECK_DICTIONARY_STORAGE_KEY = "ivoryscribe:spell-check-dictionary"

function normalizeSpellCheckWord(value: string) {
  return value.trim().replace(/’/g, "'").toLowerCase()
}

async function addNativeSpellCheckWord(word: string) {
  const normalizedWord = normalizeSpellCheckWord(word)
  if (!normalizedWord || typeof window === "undefined") {
    return false
  }

  try {
    return (await window.electronAPI?.addSpellCheckerWord?.(normalizedWord)) ?? false
  } catch {
    return false
  }
}

async function removeNativeSpellCheckWord(word: string) {
  const normalizedWord = normalizeSpellCheckWord(word)
  if (!normalizedWord || typeof window === "undefined") {
    return false
  }

  try {
    return (await window.electronAPI?.removeSpellCheckerWord?.(normalizedWord)) ?? false
  } catch {
    return false
  }
}

function loadSpellCheckDictionary() {
  if (typeof window === "undefined") {
    return [] as string[]
  }

  try {
    const raw = window.localStorage.getItem(SPELL_CHECK_DICTIONARY_STORAGE_KEY)
    if (!raw) {
      return []
    }

    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return []
    }

    return Array.from(new Set(
      parsed
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim().toLowerCase())
        .filter((entry) => entry.length > 0),
    ))
  } catch {
    return []
  }
}

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
  onCreateProject: () => void
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
}

export default function Editor({
  sessionToken,
  project,
  tuskAiActivated,
  isStartingTuskCheckout,
  activeContent,
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
}: EditorProps) {
  const entryTerms = project ? getProjectEntryTerms(project.kind) : { singular: "Chapter", plural: "Chapters", untitled: "Untitled" }
  const [selectedWordCount, setSelectedWordCount] = useState<number | null>(null)
  const [isWordStatsOpen, setIsWordStatsOpen] = useState(false)
  const [isDetailedWordStatsOpen, setIsDetailedWordStatsOpen] = useState(false)
  const [pendingExportFormat, setPendingExportFormat] = useState<ExportProjectFormat | null>(null)
  const [isSpellCheckOpen, setIsSpellCheckOpen] = useState(false)
  const [spellCheckDocumentId, setSpellCheckDocumentId] = useState<string | null>(null)
  const [spellCheckDocumentType, setSpellCheckDocumentType] = useState<SpellCheckDocumentType | null>(null)
  const [spellCheckIndex, setSpellCheckIndex] = useState(0)
  const [spellCheckDictionary, setSpellCheckDictionary] = useState<string[]>(() => loadSpellCheckDictionary())
  const [spellCheckIgnoredWords, setSpellCheckIgnoredWords] = useState<string[]>([])
  const [spellCheckIgnoredDocumentId, setSpellCheckIgnoredDocumentId] = useState<string | null>(null)
  const [includedTabsById, setIncludedTabsById] = useState<Record<string, boolean>>({})
  const [dashboardSection, setDashboardSection] = useState<"library" | "recent" | "archive" | "trash">("library")

  const { canGoBack, canGoForward, goBack, goForward } = useNavigationHistory({
    view,
    activeId: project?.activeId ?? null,
    dashboardSection,
    onOpenProject,
    onReturnToDashboard,
    onProjectChange,
    onDashboardSectionChange: setDashboardSection,
    activeProjectId,
  })
  const findReplace = useFindReplaceModal({
    view,
    project,
    onProjectChange,
  })

  useEffect(() => {
    const handleNavigateLibrary = () => setDashboardSection("library")
    const handleNavigateRecent = () => setDashboardSection("recent")
    const handleNavigateArchive = () => setDashboardSection("archive")
    const handleNavigateTrash = () => setDashboardSection("trash")

    window.addEventListener(NAVIGATE_LIBRARY_EVENT, handleNavigateLibrary)
    window.addEventListener(NAVIGATE_RECENT_EVENT, handleNavigateRecent)
    window.addEventListener(NAVIGATE_ARCHIVE_EVENT, handleNavigateArchive)
    window.addEventListener(NAVIGATE_TRASH_EVENT, handleNavigateTrash)

    return () => {
      window.removeEventListener(NAVIGATE_LIBRARY_EVENT, handleNavigateLibrary)
      window.removeEventListener(NAVIGATE_RECENT_EVENT, handleNavigateRecent)
      window.removeEventListener(NAVIGATE_ARCHIVE_EVENT, handleNavigateArchive)
      window.removeEventListener(NAVIGATE_TRASH_EVENT, handleNavigateTrash)
    }
  }, [])
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
  const activeTabPath = useMemo(() => {
    if (!project?.activeId) {
      return [] as Array<{ id: string; title: string }>
    }

    return findTabPathById(project.tabs, project.activeId) ?? []
  }, [project])
  const exportTabs = useMemo(
    () => project ? collectTabSequence(project.tabs) : [],
    [project],
  )
  const activeDocumentType = useMemo(() => {
    if (!project?.activeId) {
      return "text" as const
    }

    if ((project.pinboardIds ?? []).includes(project.activeId)) {
      return "pinboard" as const
    }

    if (getProjectMarkdownIds(project).includes(project.activeId)) {
      return "markdown" as const
    }

    return "text" as const
  }, [project])

  const currentCountLabel = selectedWordCount === null
    ? `${activeDocumentWordCount.toLocaleString()} ${activeDocumentWordCount === 1 ? "word" : "words"}`
    : `${selectedWordCount.toLocaleString()} ${selectedWordCount === 1 ? "word" : "words"} selected`

  const spellCheckAcceptedWordSet = useMemo(() => {
    return new Set<string>([...spellCheckDictionary, ...spellCheckIgnoredWords])
  }, [spellCheckDictionary, spellCheckIgnoredWords])

  const spellCheckIssues = useMemo(() => {
    if (!isSpellCheckOpen || !spellCheckDocumentType) {
      return []
    }

    return collectSpellCheckIssues(activeContent, spellCheckDocumentType, spellCheckAcceptedWordSet)
  }, [isSpellCheckOpen, spellCheckDocumentType, activeContent, spellCheckAcceptedWordSet])

  const spellCheckIssue = spellCheckIssues[spellCheckIndex] ?? null

  const releaseSessionIgnoredSpellCheckWords = (
    ignoredWords = spellCheckIgnoredWords,
    dictionaryWords = spellCheckDictionary,
  ) => {
    const persistedDictionarySet = new Set(dictionaryWords)

    for (const word of ignoredWords) {
      if (persistedDictionarySet.has(word)) {
        continue
      }

      void removeNativeSpellCheckWord(word)
    }
  }





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
    if (typeof window === "undefined") {
      return
    }

    window.localStorage.setItem(SPELL_CHECK_DICTIONARY_STORAGE_KEY, JSON.stringify(spellCheckDictionary))
  }, [spellCheckDictionary])

  useEffect(() => {
    for (const word of spellCheckDictionary) {
      void addNativeSpellCheckWord(word)
    }
  }, [spellCheckDictionary])

  useEffect(() => {
    if (!isSpellCheckOpen) {
      return
    }

    setSpellCheckIndex((current) => {
      if (spellCheckIssues.length === 0) {
        return 0
      }

      return Math.min(current, spellCheckIssues.length - 1)
    })
  }, [isSpellCheckOpen, spellCheckIssues.length])

  useEffect(() => {
    if (spellCheckIgnoredWords.length > 0 || !spellCheckIgnoredDocumentId) {
      return
    }

    setSpellCheckIgnoredDocumentId(null)
  }, [spellCheckIgnoredWords, spellCheckIgnoredDocumentId])

  useEffect(() => {
    // Menu action emits a global event; this page handles it for the current project.
    const onExportRequest: EventListener = (event) => {
      if (!project) return
      const customEvent = event as CustomEvent<{ format?: ExportProjectFormat }>
      const format = customEvent.detail?.format ?? "pdf"
      setPendingExportFormat(format)
    }

    window.addEventListener(APP_EXPORT_PROJECT_EVENT, onExportRequest)
    return () => {
      window.removeEventListener(APP_EXPORT_PROJECT_EVENT, onExportRequest)
    }
  }, [project])

  useEffect(() => {
    const onSpellCheckRequest: EventListener = () => {
      if (view !== "editor") {
        return
      }

      const targetDocumentId = project?.activeId ?? null
      if (!targetDocumentId) {
        return
      }

      const nextDocumentType: SpellCheckDocumentType | null =
        activeDocumentType === "markdown"
          ? "markdown"
          : activeDocumentType === "text"
            ? "text"
            : null

      if (
        spellCheckIgnoredWords.length > 0
        && spellCheckIgnoredDocumentId
        && spellCheckIgnoredDocumentId !== targetDocumentId
      ) {
        releaseSessionIgnoredSpellCheckWords()
        setSpellCheckIgnoredWords([])
        setSpellCheckIgnoredDocumentId(null)
      }

      setSpellCheckDocumentId(targetDocumentId)
      setSpellCheckDocumentType(nextDocumentType)
      setSpellCheckIndex(0)
      setIsSpellCheckOpen(true)
    }

    window.addEventListener(APP_SPELL_CHECK_EVENT, onSpellCheckRequest)
    return () => {
      window.removeEventListener(APP_SPELL_CHECK_EVENT, onSpellCheckRequest)
    }
  }, [view, project?.activeId, activeDocumentType, spellCheckIgnoredWords, spellCheckIgnoredDocumentId, spellCheckDictionary])

  useEffect(() => {
    const onSpellCheckShortcut = (event: KeyboardEvent) => {
      if (event.repeat) {
        return
      }

      const hasPrimaryModifier = event.metaKey || event.ctrlKey
      if (!hasPrimaryModifier || !event.altKey || event.shiftKey) {
        return
      }

      // Option can change event.key on macOS layouts, so prefer the physical key code.
      const isXShortcut = event.code === "KeyX" || event.key.toLowerCase() === "x"
      if (!isXShortcut) {
        return
      }

      event.preventDefault()
      requestAppSpellCheck()
    }

    window.addEventListener("keydown", onSpellCheckShortcut, true)
    return () => {
      window.removeEventListener("keydown", onSpellCheckShortcut, true)
    }
  }, [])

  useEffect(() => {
    if (!isSpellCheckOpen || !spellCheckIssue || !spellCheckDocumentId) {
      return
    }

    if (spellCheckIssue.focusTarget.documentType === "markdown") {
      const detail: SpellCheckFocusDetail = {
        documentId: spellCheckDocumentId,
        documentType: "markdown",
        normalizedWord: spellCheckIssue.focusTarget.normalizedWord,
        occurrenceIndex: spellCheckIssue.focusTarget.occurrenceIndex,
        start: spellCheckIssue.focusTarget.start,
        end: spellCheckIssue.focusTarget.end,
      }

      requestAppSpellCheckFocus(detail)
      return
    }

    const detail: SpellCheckFocusDetail = {
      documentId: spellCheckDocumentId,
      documentType: "text",
      normalizedWord: spellCheckIssue.focusTarget.normalizedWord,
      occurrenceIndex: spellCheckIssue.focusTarget.occurrenceIndex,
    }

    requestAppSpellCheckFocus(detail)
  }, [isSpellCheckOpen, spellCheckIssue, spellCheckDocumentId])

  useEffect(() => {
    if (!isSpellCheckOpen || !spellCheckDocumentId) {
      return
    }

    if (project?.activeId !== spellCheckDocumentId) {
      releaseSessionIgnoredSpellCheckWords()
      setIsSpellCheckOpen(false)
      setSpellCheckDocumentId(null)
      setSpellCheckDocumentType(null)
      setSpellCheckIndex(0)
      setSpellCheckIgnoredWords([])
      setSpellCheckIgnoredDocumentId(null)
    }
  }, [project?.activeId, isSpellCheckOpen, spellCheckDocumentId, spellCheckIgnoredWords, spellCheckDictionary])

  const closeSpellCheckModal = () => {
    setIsSpellCheckOpen(false)
    setSpellCheckDocumentId(null)
    setSpellCheckDocumentType(null)
    setSpellCheckIndex(0)
  }

  const goToPreviousSpellCheckIssue = () => {
    setSpellCheckIndex((current) => Math.max(0, current - 1))
  }

  const goToNextSpellCheckIssue = () => {
    setSpellCheckIndex((current) => Math.min(current + 1, Math.max(0, spellCheckIssues.length - 1)))
  }

  const ignoreSpellCheckIssue = () => {
    const normalizedWord = spellCheckIssue?.normalizedWord
    if (!normalizedWord || !spellCheckDocumentId) {
      return
    }

    setSpellCheckIgnoredDocumentId(spellCheckDocumentId)
    setSpellCheckIgnoredWords((current) => {
      if (current.includes(normalizedWord)) {
        return current
      }

      return [...current, normalizedWord]
    })

    void addNativeSpellCheckWord(normalizedWord)
  }

  const addSpellCheckWordToDictionary = () => {
    const normalizedWord = spellCheckIssue?.normalizedWord
    if (!normalizedWord) {
      return
    }

    setSpellCheckDictionary((current) => {
      if (current.includes(normalizedWord)) {
        return current
      }

      return [...current, normalizedWord]
    })

    setSpellCheckIgnoredWords((current) => current.filter((word) => word !== normalizedWord))
    void addNativeSpellCheckWord(normalizedWord)
  }

  const removeSpellCheckWordFromDictionary = (word: string) => {
    const normalizedWord = normalizeSpellCheckWord(word)
    if (!normalizedWord) {
      return
    }

    setSpellCheckDictionary((current) => current.filter((entry) => entry !== normalizedWord))

    if (spellCheckIgnoredWords.includes(normalizedWord)) {
      return
    }

    void removeNativeSpellCheckWord(normalizedWord)
  }

  const applySpellCheckSuggestion = (replacement: string) => {
    if (!spellCheckIssue || !spellCheckDocumentId || !spellCheckDocumentType) {
      return
    }

    const targetDocumentId = spellCheckDocumentId
    const nextContent = replaceSpellCheckIssue(activeContent, spellCheckDocumentType, spellCheckIssue, replacement)

    if (nextContent === activeContent) {
      return
    }

    onProjectChange((currentProject) => ({
      ...currentProject,
      contentById: {
        ...currentProject.contentById,
        [targetDocumentId]: nextContent,
      },
    }))
  }

  const commitSpellCheckPrimaryAction = () => {
    if (!spellCheckIssue) {
      return
    }

    const primarySuggestion = spellCheckIssue.suggestions[0]

    if (primarySuggestion) {
      applySpellCheckSuggestion(primarySuggestion)
      return
    }

    addSpellCheckWordToDictionary()
  }

  const closeExportModal = () => {
    setPendingExportFormat(null)
  }

  const runExport = (format: ExportProjectFormat, mode: ExportMode, selectedTabIds: string[]) => {
    if (!project) {
      return
    }

    const options = mode === "separate-files"
      ? { mode: "separate-files" as const }
      : { mode: "single-document" as const, selectedTabIds }

    if (format === "md") {
      void downloadProjectAsMarkdown(project, options)
      return
    }

    if (format === "docx") {
      void exportProjectAsDocx(project, options)
      return
    }

    if (format === "txt") {
      void exportProjectAsTxt(project, options)
      return
    }

    void exportProjectAsPdf(project, options)
  }

  return (
    <AppShell
      menuBarEnabled={menuBarEnabled}
      translucentNavPanel={translucentNavPanel}
      isEditorTyping={isEditorTyping}
      view={view}
      project={project}
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
      currentCountLabel={currentCountLabel}
      isWordStatsOpen={isWordStatsOpen}
      setProjects={setProjects}
      setFolders={setFolders}
      onCreateProject={onCreateProject}
      onCreateFolder={onCreateFolder}
      onOpenProject={onOpenProject}
      onOpenProjectInNewTab={onOpenProjectInNewTab}
      onReturnToDashboard={onReturnToDashboard}
      onToggleWordStats={() => setIsWordStatsOpen((prev) => !prev)}
      sessionToken={sessionToken}
      projectDocumentMap={projectDocumentMap}
      sharedProjectIds={sharedProjectIds}
      ownerEmailByProjectId={ownerEmailByProjectId}
      userEmail={userEmail}
      tuskAiActivated={tuskAiActivated}
      isStartingTuskCheckout={isStartingTuskCheckout}
      onStartTuskCheckout={onStartTuskCheckout}
    >
      {view === "projects" ? (
            dashboardSection === "recent" ? (
              <RecentView
                projects={projects}
                setProjects={setProjects}
                onOpenProject={onOpenProject}
                onOpenProjectInNewTab={onOpenProjectInNewTab}
              />
            ) : dashboardSection === "archive" ? (
              <ArchiveView
                projects={projects}
                setProjects={setProjects}
                onOpenProject={onOpenProject}
                onOpenProjectInNewTab={onOpenProjectInNewTab}
              />
            ) : dashboardSection === "trash" ? (
              <TrashView
                projects={projects}
                setProjects={setProjects}
                onOpenProject={onOpenProject}
                onOpenProjectInNewTab={onOpenProjectInNewTab}
                onShredProjects={onPermanentlyDeleteProjects}
              />
            ) : (
              <Library
                sessionToken={sessionToken}
                projects={projects}
                folders={folders}
                activeProjectId={activeProjectId}
                bookCounter={bookCounter}
                projectDocumentMap={projectDocumentMap}
                setBookCounter={setBookCounter}
                onOpenProject={onOpenProject}
                onOpenProjectInNewTab={onOpenProjectInNewTab}
                onProjectCreated={onProjectCreated}
                activeProjectVersionsByProjectId={activeProjectVersionsByProjectId}
                onShowVersionHistory={onShowVersionHistory}
                setProjects={setProjects}
                setFolders={setFolders}
                setActiveProjectId={setActiveProjectId}
                pendingShareRequests={pendingShareRequests}
                onAcceptShareRequest={onAcceptShareRequest}
                onRejectShareRequest={onRejectShareRequest}
                onRefreshPendingShareRequests={onRefreshPendingShareRequests}
                userEmail={userEmail}
                sharedProjectIds={sharedProjectIds}
                ownerEmailByProjectId={ownerEmailByProjectId}
              />
            )
          ) : project ? (
            /* ── Editor Content ── */
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
                  isOpen={isSpellCheckOpen}
                  documentType={spellCheckDocumentType}
                  issue={spellCheckIssue}
                  issueIndex={spellCheckIssue ? spellCheckIndex + 1 : 0}
                  issueCount={spellCheckIssues.length}
                  dictionaryWords={spellCheckDictionary}
                  canGoPrevious={spellCheckIndex > 0}
                  canGoNext={spellCheckIndex < spellCheckIssues.length - 1}
                  onPrevious={goToPreviousSpellCheckIssue}
                  onNext={goToNextSpellCheckIssue}
                  onIgnore={ignoreSpellCheckIssue}
                  onAddToDictionary={addSpellCheckWordToDictionary}
                  onRemoveDictionaryWord={removeSpellCheckWordFromDictionary}
                  onApplySuggestion={applySpellCheckSuggestion}
                  onCommitPrimaryAction={commitSpellCheckPrimaryAction}
                  onClose={closeSpellCheckModal}
                />
              </Suspense>

              <ProjectExportModal
                isOpen={Boolean(project && pendingExportFormat)}
                format={pendingExportFormat}
                tabs={exportTabs}
                onClose={closeExportModal}
                onConfirm={({ mode, selectedTabIds }) => {
                  if (!pendingExportFormat) {
                    return
                  }

                  runExport(pendingExportFormat, mode, selectedTabIds)
                  closeExportModal()
                }}
              />

              {activeDocumentType === "pinboard" ? (
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
              ) : activeDocumentType === "markdown" ? (
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
