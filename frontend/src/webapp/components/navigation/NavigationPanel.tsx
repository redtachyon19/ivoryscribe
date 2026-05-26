import { useCallback, useEffect, useState, type Dispatch, type MouseEvent, type SetStateAction } from "react"
import { ArrowLeft, BookPlus, FileCode, FilePlus2, FileType, FolderPlus, ListPlus, PanelLeft, Presentation } from "lucide-react"
import DocumentTabsPanel from "./DocumentTabsPanel"
import ProjectBrowserPanel from "./ProjectBrowserPanel"
import { getProjectEntryTerms, isSingleDocumentKind, normalizeProjectAfterTabs, type Project, type ProjectKind } from "../../../core/utils/projects"
import type { ProjectFolder } from "../../pages/Library"
import type { LibrarySection } from "../library/useLibraryNavigation"
import ProjectContextMenu, { buildCreateProjectActions, type ContextMenuAction } from "../library/ProjectContextMenu"
import { deepCloneTab, findNode, insertRelative } from "./tabTreeUtils"



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
  librarySection: LibrarySection
  setLibrarySection: Dispatch<SetStateAction<LibrarySection>>
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
  /** Create a new top-level project of the given kind. Called by the kind
   *  picker menu below. */
  onCreateProject: (kind: ProjectKind) => void
  onCreateFolder: () => void
  onOpenProject: (projectId: string) => void
  onOpenProjectInNewTab?: (projectId: string) => void
  onReturnToDashboard: () => void
  onProjectChange: (updater: (project: Project) => Project) => void
  onToggleWordStats: () => void
  sessionToken: string
  projectDocumentMap: Record<string, string>
  onCopyProjectPath?: (projectId: string) => void
  onShowProjectInFinder?: (projectId: string) => void
  /** Local-only: upload-then-trash a local project. Threaded into the
   *  ProjectBrowserPanel so both the right-click "Move to Cloud" and
   *  the drag-into-Cloud section drop call the same code path. */
  onMoveProjectToCloud?: (projectId: string) => Promise<string | null>
  /** Spawn a new Electron window scoped to this folder's on-disk dir. */
  onOpenFolderInNewWindow?: (folderId: string) => void
  /** Paint the folder's macOS Finder label so in-app color changes propagate to Finder. */
  onApplyFolderFinderColor?: (folderId: string, color: string | null | undefined) => void
  pendingEditTabIds?: Set<string>
}

export default function NavigationPanel({
  project,
  projects,
  folders,
  librarySection,
  setLibrarySection,
  sidebarSlide,
  isOpen,
  showWordCount,

  currentCountLabel,
  isWordStatsOpen,
  setProjects,
  setFolders,
  onSetSidebarSlide,
  onClose,
  onCreateProject,
  onCreateFolder,
  onOpenProject,
  onOpenProjectInNewTab,
  onReturnToDashboard,
  onProjectChange,
  onToggleWordStats,
  sessionToken,
  projectDocumentMap,
  onCopyProjectPath,
  onShowProjectInFinder,
  onMoveProjectToCloud,
  onOpenFolderInNewWindow,
  onApplyFolderFinderColor,
  pendingEditTabIds,
}: NavigationPanelProps) {
  const entryTerms = project ? getProjectEntryTerms(project.kind) : { singular: "Chapter", plural: "Chapters", untitled: "Untitled" }
  const projectKind = project?.kind ?? "Book"
  const isSingleDoc = isSingleDocumentKind(projectKind)
  const [createMoreMenu, setCreateMoreMenu] = useState<{ x: number; y: number } | null>(null)
  const [createProjectMenu, setCreateProjectMenu] = useState<{ x: number; y: number } | null>(null)
  const closeCreateMoreMenu = useCallback(() => {
    setCreateMoreMenu(null)
  }, [])
  const closeCreateProjectMenu = useCallback(() => {
    setCreateProjectMenu(null)
  }, [])

  useEffect(() => {
    closeCreateMoreMenu()
    closeCreateProjectMenu()
  }, [closeCreateMoreMenu, closeCreateProjectMenu, isOpen, project?.id, sidebarSlide])

  const handleOpenCreateProjectMenu = (event: MouseEvent<HTMLButtonElement>) => {
    const buttonRect = event.currentTarget.getBoundingClientRect()
    setCreateProjectMenu({ x: buttonRect.left, y: buttonRect.bottom + 6 })
  }

  const handleCreateFolder = () => {
    onCreateFolder()
  }

  // ── Inside-Book entry creation ──────────────────────────────────────────
  //
  // After the file-type overhaul a Book holds chapters plus embedded
  // markdown / plain-text tabs. Presentations hold only pinboards; their
  // entry creator is `handleCreateSlide` below. Single-document kinds
  // (.md / .txt) have no create-entry path at all.

  const handleCreateEntry = () => {
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
  }

  /** Append a new slide (= pinboard) to the active Presentation. The button
   *  label is "Create Pinboard" per spec, but the tab is labelled
   *  "Slide N" (its entry-term singular) so it reads naturally in the list. */
  const handleCreateSlide = () => {
    onProjectChange((currentProject) => {
      const nextId = createId()
      const nextTitle = getNextEntryName(currentProject.tabs, getProjectEntryTerms(currentProject.kind).singular)

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
  }

  const handleCreateMarkdown = () => {
    onProjectChange((currentProject) => {
      const nextId = createId()
      const nextTitle = getNextEntryName(currentProject.tabs, "Document")

      return {
        ...currentProject,
        activeId: nextId,
        markdownIds: [...(currentProject.markdownIds ?? []), nextId],
        tabs: [...currentProject.tabs, { id: nextId, title: nextTitle, children: [] }],
        contentById: {
          ...currentProject.contentById,
          [nextId]: "",
        },
      }
    })
  }

  const handleCreatePlainText = () => {
    onProjectChange((currentProject) => {
      const nextId = createId()
      const nextTitle = getNextEntryName(currentProject.tabs, "Document")

      return {
        ...currentProject,
        activeId: nextId,
        plaintextIds: [...(currentProject.plaintextIds ?? []), nextId],
        tabs: [...currentProject.tabs, { id: nextId, title: nextTitle, children: [] }],
        contentById: {
          ...currentProject.contentById,
          [nextId]: "",
        },
      }
    })
  }

  const handleOpenTabInNewTab = (tabId: string) => {
    if (!project) return
    const url = new URL("/app", window.location.origin)
    url.searchParams.set("projectId", project.id)
    url.searchParams.set("tabId", tabId)
    window.open(url.toString(), "_blank")
  }

  const handleDuplicateTab = (tabId: string) => {
    if (!project) return
    onProjectChange((currentProject) => {
      const node = findNode(currentProject.tabs, tabId)
      if (!node) return currentProject

      const { cloned, idMap } = deepCloneTab(node, createId)

      const nextContentById = { ...currentProject.contentById }
      idMap.forEach((newId, oldId) => {
        nextContentById[newId] = currentProject.contentById[oldId] ?? ""
      })

      const inserted = insertRelative(currentProject.tabs, tabId, cloned, "after")
      const nextTabs = inserted.inserted ? inserted.nextNodes : [...currentProject.tabs, cloned]

      return {
        ...currentProject,
        activeId: cloned.id,
        tabs: nextTabs,
        contentById: nextContentById,
      }
    })
  }

  const handleOpenCreateMoreMenu = (event: MouseEvent<HTMLButtonElement>) => {
    const buttonRect = event.currentTarget.getBoundingClientRect()
    setCreateMoreMenu({
      x: buttonRect.left,
      y: buttonRect.bottom + 6,
    })
  }

  // "Create More" lives only inside Books. Per spec: Markdown + Plain Text;
  // no more standalone Pinboard creation inside a Book (Presentations own
  // those now).
  const createMoreActions: ContextMenuAction[] = [
    {
      label: "Create Markdown",
      icon: <FileCode size={14} strokeWidth={2} aria-hidden={true} />,
      action: handleCreateMarkdown,
    },
    {
      label: "Create Plain Text",
      icon: <FileType size={14} strokeWidth={2} aria-hidden={true} />,
      action: handleCreatePlainText,
    },
  ]

  // Library-level "Create Project" picker — shared builder so the same
  // menu shape appears at every create entry point.
  const createProjectActions = buildCreateProjectActions(onCreateProject)

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
              aria-expanded={Boolean(createProjectMenu)}
              onClick={handleOpenCreateProjectMenu}
            >
              <BookPlus size={14} aria-hidden={true} />
              <span>Create Project</span>
            </button>
            <button
              type="button"
              className="editor-workspace__rail-create editor-workspace__rail-create-pinboard"
              aria-label="Create Folder"
              onClick={handleCreateFolder}
            >
              <FolderPlus size={14} aria-hidden={true} />
              <span>Create Folder</span>
            </button>
          </div>

          {/* Slide 2 header: Document Tabs.
             Header buttons are kind-gated:
             • Book         → Create Chapter + Create More (md / txt)
             • Presentation → Create Pinboard (= add slide)
             • Markdown/PlainText (single-doc) → nothing — there is exactly
               one tab and the user is always on it. */}
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
            {projectKind === "Book" ? (
              <>
                <button
                  type="button"
                  className="editor-workspace__rail-create"
                  aria-label={`Create ${entryTerms.singular}`}
                  onClick={handleCreateEntry}
                >
                  <FilePlus2 size={14} aria-hidden={true} />
                  <span>Create {entryTerms.singular}</span>
                </button>
                <button
                  type="button"
                  className="editor-workspace__rail-create editor-workspace__rail-create-pinboard"
                  aria-label="Create More"
                  aria-expanded={Boolean(createMoreMenu)}
                  onClick={handleOpenCreateMoreMenu}
                >
                  <ListPlus size={14} aria-hidden={true} />
                  <span>Create More</span>
                </button>
              </>
            ) : projectKind === "Presentation" ? (
              <button
                type="button"
                className="editor-workspace__rail-create"
                aria-label="Create Pinboard"
                onClick={handleCreateSlide}
              >
                <Presentation size={14} aria-hidden={true} />
                <span>Create Pinboard</span>
              </button>
            ) : null /* single-document kinds: no create buttons */}
          </div>
        </div>

        <div
          className="editor-workspace__rail-slider"
          style={{ transform: sidebarSlide === 1 ? "translateX(0)" : "translateX(-50%)" }}
        >
          {/* Slide 1: Project Browser */}
          <div className="editor-workspace__rail-slide">
            <ProjectBrowserPanel
              projects={projects.filter((p) => !p.archivedAt && !p.deletedAt)}
              folders={folders}
              activeProjectId={project?.id ?? null}
              librarySection={librarySection}
              setLibrarySection={setLibrarySection}
              onNavigateLibrary={onReturnToDashboard}
              onOpenProject={onOpenProject}
              onOpenProjectInNewTab={onOpenProjectInNewTab}
              setFolders={setFolders}
              setProjects={setProjects}
              sessionToken={sessionToken}
              projectDocumentMap={projectDocumentMap}
              onCopyProjectPath={onCopyProjectPath}
              onShowProjectInFinder={onShowProjectInFinder}
              onMoveProjectToCloud={onMoveProjectToCloud}
              onOpenFolderInNewWindow={onOpenFolderInNewWindow}
              onApplyFolderFinderColor={onApplyFolderFinderColor}
              onCreateProject={onCreateProject}
              onCreateFolder={handleCreateFolder}
            />
          </div>

          {/* Slide 2: Document Tabs (suppressed for single-document kinds).
              Single-doc projects (Markdown/PlainText) keep one synthetic tab
              that the editor still reads from — we just hide the list UI. */}
          <div className="editor-workspace__rail-slide">
            {project && !isSingleDoc ? (
              <DocumentTabsPanel
                projectName={project.name}
                tabs={project.tabs}
                projectKind={project.kind}
                project={project}
                activeId={project.activeId}
                isVisible={isOpen && sidebarSlide === 2}
                pendingEditTabIds={pendingEditTabIds}
                onTabsChange={(updater) => {
                  onProjectChange((currentProject) => normalizeProjectAfterTabs(currentProject, updater(currentProject.tabs)))
                }}
                onSelect={(id) => {
                  onProjectChange((currentProject) => ({
                    ...currentProject,
                    activeId: id,
                  }))
                }}
                onCreateEntry={project.kind === "Presentation" ? handleCreateSlide : handleCreateEntry}
                onCreateMarkdown={handleCreateMarkdown}
                onCreatePlainText={handleCreatePlainText}
                onOpenTabInNewTab={handleOpenTabInNewTab}
                onDuplicateTab={handleDuplicateTab}
              />
            ) : project && isSingleDoc ? (
              // Single-doc project: show just the project name so the user
              // knows what's open without a tab tree.
              <div className="editor-workspace__rail-slide-single-doc" aria-label="Open document">
                <p className="doc-tabs__project-name" style={{ padding: "0 14px" }}>{project.name}</p>
              </div>
            ) : null}
          </div>
        </div>
      </aside>
      {sidebarSlide !== 1 && showWordCount ? (
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

      {createMoreMenu && sidebarSlide === 2 ? (
        <ProjectContextMenu
          x={createMoreMenu.x}
          y={createMoreMenu.y}
          actions={createMoreActions}
          onClose={closeCreateMoreMenu}
        />
      ) : null}

      {createProjectMenu && sidebarSlide === 1 ? (
        <ProjectContextMenu
          x={createProjectMenu.x}
          y={createProjectMenu.y}
          actions={createProjectActions}
          onClose={closeCreateProjectMenu}
        />
      ) : null}
    </div>
  )
}
