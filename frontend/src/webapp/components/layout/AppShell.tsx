import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react"
import { ArrowLeft, ArrowRight, Copy, ExternalLink, Folder, Info, Pencil, PanelLeft, PanelRight, Settings, Trash2 } from "lucide-react"
import { iconForProjectKind } from "../../../core/utils/projectIcons"
import NavigationPanel from "../navigation/NavigationPanel"
import type { LibrarySection } from "../library/useLibraryNavigation"
import TuskAiTab from "../ai/TuskAiTab"
import type { ProposedEdit } from "../ai/proposedEditsTypes"
import MarqueeText from "../ui/MarqueeText"
import Modal from "../ui/Modal"
import Button from "../ui/Button"
import MarkdownCheatsheetModal from "../editor/MarkdownCheatsheetModal"
import ShareDialog from "../settings/ShareDialog"
import ProjectContextMenu, { buildFolderActions, buildProjectActions } from "../library/ProjectContextMenu"
import type { ContextMenuAction } from "../library/ProjectContextMenu"
import { createId, type Project } from "../../../core/utils/projects"
import type { ProjectFolder } from "../../pages/Library"
import { duplicateProject } from "../../../core/utils/libraryUtils"
import { openInNewItemLabel } from "../../../core/electron/localWorkspace"
import { deepCloneTab, findNode, insertRelative } from "../navigation/tabTreeUtils"
import "../../pages/Editor.css"

const STORAGE_LIMIT_GB = 15

export type AppShellProps = {
  menuBarEnabled: boolean
  translucentNavPanel: boolean
  isEditorTyping: boolean
  view: "projects" | "editor"
  project: Project | null
  /** Type of the active document. Drives the reading-progress bar: which
   *  scroll container to track, and whether to show it at all (pinboard and
   *  image are 2D pan surfaces with no linear reading progress). */
  activeDocumentType?: "prose" | "pinboard" | "markdown" | "plaintext" | "pdf" | "image"
  activeFolderName?: string | null
  canGoBack: boolean
  canGoForward: boolean
  onGoBack: () => void
  onGoForward: () => void
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
  onCreateProject: (kind: import("../../../core/utils/projects").ProjectKind) => void
  onCreateFolder: () => void
  onOpenProject: (projectId: string) => void
  onOpenProjectInNewTab?: (projectId: string) => void
  onReturnToDashboard: () => void
  /** Active library section — single source of truth, owned by Editor.tsx.
   *  Drives both LibraryRouter and the sidebar's highlighted tab. */
  librarySection: LibrarySection
  setLibrarySection: Dispatch<SetStateAction<LibrarySection>>
  onToggleWordStats: () => void
  sessionToken: string
  projectDocumentMap: Record<string, string>
  /** Local-mode + Electron only: copies the project's on-disk path. */
  onCopyProjectPath?: (projectId: string) => void
  onOpenFolderInNewWindow?: (folderId: string) => void
  onApplyFolderFinderColor?: (folderId: string, color: string | null | undefined) => void
  /** Local-mode + Electron only: reveals the project file in Finder/Explorer. */
  onShowProjectInFinder?: (projectId: string) => void
  /** Local-mode + Electron only: promotes a local project to cloud
   *  (upload + trash on-disk file). Mirrors the Library card menu. */
  onMoveProjectToCloud?: (projectId: string) => Promise<string | null>
  sharedProjectIds?: Set<string>
  ownerEmailByProjectId?: Map<string, string>
  userEmail?: string
  tuskAiActivated: boolean
  isStartingTuskCheckout: boolean
  onStartTuskCheckout: () => void
  pendingHunkCount: number
  pendingEditTabIds: Set<string>
  onProposedEdits: (edits: ProposedEdit[]) => { applied: number; dropped: number; hunkCount: number; tabCount: number }
  onAcceptAllPendingHunks: () => void
  onRejectAllProposedEdits: () => void
  /** When true, the topbar shows a Drafting/Typewriter view toggle. */
  viewToggleAvailable?: boolean
  /** Current view mode for the active prose tab. */
  viewMode?: "drafting" | "typewriter"
  /** Flips the active prose tab between Drafting and Typewriter. */
  onToggleViewMode?: () => void
  /** When true, the topbar shows an Editor/Both/Preview toggle for Markdown tabs. */
  markdownViewToggleAvailable?: boolean
  /** Current view mode for the active Markdown tab. */
  markdownViewMode?: "editor" | "both" | "preview"
  /** Sets the active Markdown tab's view mode. */
  onSetMarkdownViewMode?: (mode: "editor" | "both" | "preview") => void
  children: ReactNode
}

export default function AppShell({
  // menuBarEnabled is part of the props contract but unused in this
  // component (the native menu is built in useAppOrchestration); omit it
  // from destructuring so noUnusedLocals stays happy.
  isEditorTyping,
  view,
  project,
  activeDocumentType = "prose",
  activeFolderName = null,
  canGoBack,
  canGoForward,
  onGoBack,
  onGoForward,
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
  onOpenProjectInNewTab,
  onReturnToDashboard,
  librarySection,
  setLibrarySection,
  onToggleWordStats,
  sessionToken,
  projectDocumentMap,
  onCopyProjectPath,
  onShowProjectInFinder,
  onMoveProjectToCloud,
  onOpenFolderInNewWindow,
  onApplyFolderFinderColor,
  sharedProjectIds,
  ownerEmailByProjectId,
  userEmail = "",
  tuskAiActivated,
  isStartingTuskCheckout,
  onStartTuskCheckout,
  pendingHunkCount,
  pendingEditTabIds,
  onProposedEdits,
  onAcceptAllPendingHunks,
  onRejectAllProposedEdits,
  viewToggleAvailable = false,
  viewMode = "drafting",
  onToggleViewMode,
  markdownViewToggleAvailable = false,
  markdownViewMode = "both",
  onSetMarkdownViewMode,
  children,
}: AppShellProps) {
  const [isLeftRailOpen, setIsLeftRailOpen] = useState(true)
  const [isRightRailOpen, setIsRightRailOpen] = useState(false)
  const [leftPanelWidth, setLeftPanelWidth] = useState(300)
  const [rightPanelWidth, setRightPanelWidth] = useState(280)
  const [draggingPanel, setDraggingPanel] = useState<"left" | "right" | null>(null)
  const [sidebarSlide, setSidebarSlide] = useState<1 | 2>(view === "projects" ? 1 : 2)
  // Info popup for the Markdown reference (button rendered only when a
  // markdown doc is active — see the render block below).
  const [isMarkdownCheatsheetOpen, setIsMarkdownCheatsheetOpen] = useState(false)
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const panelSeparatorWidth = 8

  /* ── Reading-progress indicator ──
     Ported from the blog (BlogPost.tsx): a thin bar pinned to the top bar that
     fills horizontally as you scroll through the open document. Different
     editors scroll different elements — Drafting / Markdown / PlainText grow
     and scroll the shared `.editor-workspace__editor-center`, Typewriter scrolls
     its own `.tw-scroll`, and PDF scrolls `.pdf-viewer`. A capture-phase scroll
     listener catches scroll from whichever descendant actually scrolls, so one
     effect covers them all. Pinboard and Image are 2D pan canvases with no
     linear reading progress, so the bar is hidden for them. rAF-throttled. */
  const editorCenterRef = useRef<HTMLDivElement | null>(null)
  const readingProgressBarRef = useRef<HTMLDivElement | null>(null)
  const readingProgressTrackRef = useRef<HTMLDivElement | null>(null)
  const showReadingProgress =
    view === "editor" &&
    Boolean(project) &&
    (activeDocumentType === "prose" ||
      activeDocumentType === "markdown" ||
      activeDocumentType === "plaintext" ||
      activeDocumentType === "pdf")

  /* ── View-toggle sliding-pill indicator ──
     Mirrors the global settings sidebar pattern: a single absolutely
     positioned pill animates left/width to whichever pill is active, instead
     of swapping a coloured background between the two options. */
  const viewToggleRefs = useRef<{ drafting: HTMLButtonElement | null; typewriter: HTMLButtonElement | null }>({
    drafting: null,
    typewriter: null,
  })
  const [viewIndicatorStyle, setViewIndicatorStyle] = useState<{ left: number; width: number; visible: boolean }>({
    left: 0, width: 0, visible: false,
  })
  useEffect(() => {
    if (!viewToggleAvailable) {
      setViewIndicatorStyle((c) => (c.visible ? { left: 0, width: 0, visible: false } : c))
      return
    }
    const active = viewToggleRefs.current[viewMode]
    if (!active) return
    const parent = active.parentElement
    if (!parent) return
    const sync = () => {
      const parentRect = parent.getBoundingClientRect()
      const itemRect = active.getBoundingClientRect()
      const left = itemRect.left - parentRect.left
      const width = itemRect.width
      setViewIndicatorStyle((c) =>
        c.left === left && c.width === width && c.visible ? c : { left, width, visible: true },
      )
    }
    sync()
    const ro = new ResizeObserver(sync)
    ro.observe(parent)
    return () => ro.disconnect()
  }, [viewMode, viewToggleAvailable])

  /* ── Markdown Editor/Both/Preview sliding-pill indicator ──
     Same pattern as the prose toggle above — separate refs since the two
     toggles are mutually exclusive in the UI (prose vs markdown tabs) but
     each owns its own indicator geometry. */
  const markdownViewToggleRefs = useRef<{
    editor: HTMLButtonElement | null
    both: HTMLButtonElement | null
    preview: HTMLButtonElement | null
  }>({ editor: null, both: null, preview: null })
  const [markdownViewIndicatorStyle, setMarkdownViewIndicatorStyle] = useState<{ left: number; width: number; visible: boolean }>({
    left: 0, width: 0, visible: false,
  })
  useEffect(() => {
    if (!markdownViewToggleAvailable) {
      setMarkdownViewIndicatorStyle((c) => (c.visible ? { left: 0, width: 0, visible: false } : c))
      return
    }
    const active = markdownViewToggleRefs.current[markdownViewMode]
    if (!active) return
    const parent = active.parentElement
    if (!parent) return
    const sync = () => {
      const parentRect = parent.getBoundingClientRect()
      const itemRect = active.getBoundingClientRect()
      const left = itemRect.left - parentRect.left
      const width = itemRect.width
      setMarkdownViewIndicatorStyle((c) =>
        c.left === left && c.width === width && c.visible ? c : { left, width, visible: true },
      )
    }
    sync()
    const ro = new ResizeObserver(sync)
    ro.observe(parent)
    return () => ro.disconnect()
  }, [markdownViewMode, markdownViewToggleAvailable])

  type TopbarContextMenu = { x: number; y: number } & (
    | { kind: "folder" }
    | { kind: "project" }
    | { kind: "tab"; tabId: string }
  )
  const [topbarMenu, setTopbarMenu] = useState<TopbarContextMenu | null>(null)
  const closeTopbarMenu = useCallback(() => setTopbarMenu(null), [])

  // Rename modal state
  type RenameTarget = { kind: "project"; id: string } | { kind: "folder"; id: string } | { kind: "tab"; id: string }
  const [renameTarget, setRenameTarget] = useState<RenameTarget | null>(null)
  const [renameValue, setRenameValue] = useState("")
  const closeRenameModal = () => { setRenameTarget(null); setRenameValue("") }
  const commitRename = () => {
    const trimmed = renameValue.trim()
    if (!trimmed || !renameTarget) { closeRenameModal(); return }
    if (renameTarget.kind === "project") {
      setProjects((cur) => cur.map((p) => p.id === renameTarget.id ? { ...p, name: trimmed } : p))
    } else if (renameTarget.kind === "folder") {
      setFolders((cur) => cur.map((f) => f.id === renameTarget.id ? { ...f, name: trimmed } : f))
    } else if (renameTarget.kind === "tab") {
      onProjectChange((p) => ({
        ...p,
        tabs: (function renameNode(tabs: Project["tabs"]): Project["tabs"] {
          return tabs.map((t) => t.id === renameTarget.id ? { ...t, title: trimmed } : { ...t, children: renameNode(t.children) })
        })(p.tabs),
      }))
    }
    closeRenameModal()
  }

  // Share dialog state
  const [shareProjectId, setShareProjectId] = useState<string | null>(null)
  const shareDocumentId = shareProjectId ? (projectDocumentMap[shareProjectId] ?? null) : null
  const shareProject = shareProjectId ? projects.find((p) => p.id === shareProjectId) ?? null : null


  const handleProjectSegmentContextMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault()
    setTopbarMenu({ x: event.clientX, y: event.clientY, kind: "project" })
  }, [])

  const handleFolderSegmentContextMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault()
    setTopbarMenu({ x: event.clientX, y: event.clientY, kind: "folder" })
  }, [])

  const handleTabSegmentContextMenu = useCallback((event: React.MouseEvent, tabId: string) => {
    event.preventDefault()
    setTopbarMenu({ x: event.clientX, y: event.clientY, kind: "tab", tabId })
  }, [])

  const topbarMenuActions = useMemo((): ContextMenuAction[] => {
    if (!topbarMenu) return []

    if (topbarMenu.kind === "folder") {
      const folder = folders.find((f) => f.name === activeFolderName)
      if (!folder) return []
      // Same `buildFolderActions` helper the Library project browser
      // uses, so the editor breadcrumb folder menu matches the Library
      // folder card menu in labels, icons, order, and behavior.
      return buildFolderActions({
        folderId: folder.id,
        onOpenInNewWindow: onOpenFolderInNewWindow
          ? (id) => { onOpenFolderInNewWindow(id); closeTopbarMenu() }
          : undefined,
        onRename: (id) => {
          setRenameTarget({ kind: "folder", id })
          setRenameValue(folder.name)
          closeTopbarMenu()
        },
        onArchive: (id) => {
          setProjects((cur) => cur.map((p) => p.folderId === id ? { ...p, archivedAt: new Date().toISOString() } : p))
          setFolders((cur) => cur.filter((f) => f.id !== id))
          closeTopbarMenu()
        },
        onTrash: (id) => {
          setProjects((cur) => cur.map((p) => p.folderId === id ? { ...p, folderId: null } : p))
          setFolders((cur) => cur.filter((f) => f.id !== id))
          closeTopbarMenu()
        },
      })
    }

    if (topbarMenu.kind === "project") {
      if (!project) return []
      // Use the same `buildProjectActions` helper the Library project
      // card menu calls, so the editor topbar menu stays identical in
      // labels, icons, order, and behavior. The handlers below close the
      // topbar menu and (for destructive actions) return to the
      // dashboard since the project being acted on is the open one.
      const isLocalProject = project.source !== "cloud"
      return buildProjectActions({
        projectId: project.id,
        onOpenInNewTab: (id) => {
          onOpenProjectInNewTab?.(id)
          closeTopbarMenu()
        },
        onRename: (id) => {
          setRenameTarget({ kind: "project", id })
          setRenameValue(project.name)
          closeTopbarMenu()
        },
        onOpenSettings: () => {
          onToggleSettings()
          closeTopbarMenu()
        },
        onDuplicate: (id) => {
          setProjects((cur) => duplicateProject(cur, id))
          closeTopbarMenu()
        },
        onShare: projectDocumentMap[project.id]
          ? (id) => { setShareProjectId(id); closeTopbarMenu() }
          : undefined,
        onMoveToCloud: onMoveProjectToCloud && isLocalProject
          ? (id) => { void onMoveProjectToCloud(id); closeTopbarMenu() }
          : undefined,
        onCopyPath: onCopyProjectPath && isLocalProject
          ? (id) => { onCopyProjectPath(id); closeTopbarMenu() }
          : undefined,
        onShowInFinder: onShowProjectInFinder && isLocalProject
          ? (id) => { onShowProjectInFinder(id); closeTopbarMenu() }
          : undefined,
        onArchive: (id) => {
          setProjects((cur) => cur.map((p) => p.id === id ? { ...p, archivedAt: new Date().toISOString() } : p))
          onReturnToDashboard()
          closeTopbarMenu()
        },
        onTrash: (id) => {
          setProjects((cur) => cur.map((p) => p.id === id ? { ...p, deletedAt: new Date().toISOString() } : p))
          onReturnToDashboard()
          closeTopbarMenu()
        },
      })
    }

    if (topbarMenu.kind === "tab") {
      const { tabId } = topbarMenu
      const actions: ContextMenuAction[] = []
      if (project) {
        const tabNode = findNode(project.tabs, tabId)
        actions.push(
          {
            label: openInNewItemLabel(),
            icon: <ExternalLink size={14} strokeWidth={2} aria-hidden={true} />,
            action: () => {
              const url = new URL("/app", window.location.origin)
              url.searchParams.set("projectId", project.id)
              url.searchParams.set("tabId", tabId)
              window.open(url.toString(), "_blank")
              closeTopbarMenu()
            },
          },
          {
            label: "Rename",
            icon: <Pencil size={14} strokeWidth={2} aria-hidden={true} />,
            action: () => {
              setRenameTarget({ kind: "tab", id: tabId })
              setRenameValue(tabNode?.title ?? "")
              closeTopbarMenu()
            },
          },
          {
            label: "Duplicate",
            icon: <Copy size={14} strokeWidth={2} aria-hidden={true} />,
            action: () => {
              onProjectChange((currentProject) => {
                const node = findNode(currentProject.tabs, tabId)
                if (!node) return currentProject
                const { cloned, idMap } = deepCloneTab(node, createId)
                const nextContentById = { ...currentProject.contentById }
                idMap.forEach((newId, oldId) => { nextContentById[newId] = currentProject.contentById[oldId] ?? "" })
                const inserted = insertRelative(currentProject.tabs, tabId, cloned, "after")
                const nextTabs = inserted.inserted ? inserted.nextNodes : [...currentProject.tabs, cloned]
                return { ...currentProject, activeId: cloned.id, tabs: nextTabs, contentById: nextContentById }
              })
              closeTopbarMenu()
            },
          },
          {
            label: "Trash",
            icon: <Trash2 size={14} strokeWidth={2} aria-hidden={true} />,
            action: () => {
              onProjectChange((currentProject) => {
                const nextTabs = (function remove(tabs: Project["tabs"]): Project["tabs"] {
                  return tabs.filter((t) => t.id !== tabId).map((t) => ({ ...t, children: remove(t.children) }))
                })(currentProject.tabs)
                const remainingIds = nextTabs.flatMap(function collect(t): string[] { return [t.id, ...t.children.flatMap(collect)] })
                const nextActiveId = currentProject.activeId === tabId ? (remainingIds[0] ?? null) : currentProject.activeId
                return { ...currentProject, tabs: nextTabs, activeId: nextActiveId }
              })
              closeTopbarMenu()
            },
            danger: true,
          },
        )
      }
      return actions
    }

    return []
  }, [topbarMenu, project, folders, activeFolderName, onOpenProjectInNewTab, onToggleSettings, onProjectChange, onReturnToDashboard, projectDocumentMap, setProjects, setFolders, closeTopbarMenu, onCopyProjectPath, onShowProjectInFinder, onMoveProjectToCloud])

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

  /* ── Reading-progress scroll tracking ──
     Mirrors BlogPost.tsx: rAF-throttled listener that writes a 0–1 ratio into
     the bar's scaleX (and the track's aria-valuenow). Each editor scrolls a
     different element, so we (a) resolve the "primary" scroller for the active
     doc type for the initial paint + resize, and (b) attach a CAPTURE-phase
     scroll listener on the editor-center. Scroll events don't bubble, but they
     do run through the capture phase, so a single capture listener on the
     ancestor catches scroll from whichever descendant actually scrolls
     (.tw-scroll, .pdf-viewer, a markdown pane, or editor-center itself). */
  useEffect(() => {
    if (!showReadingProgress) return

    const center = editorCenterRef.current
    if (!center) return

    // Pick the element that scrolls for this document type. Falls back to the
    // editor-center for Drafting / Markdown / PlainText, which grow and scroll
    // it directly.
    const resolvePrimaryScroller = (): HTMLElement => {
      if (activeDocumentType === "pdf") {
        return center.querySelector<HTMLElement>(".pdf-viewer") ?? center
      }
      if (activeDocumentType === "prose" && viewMode === "typewriter") {
        return center.querySelector<HTMLElement>(".tw-scroll") ?? center
      }
      return center
    }

    let frame = 0
    let activeScroller: HTMLElement = resolvePrimaryScroller()

    const writeProgress = () => {
      frame = 0

      const bar = readingProgressBarRef.current
      const track = readingProgressTrackRef.current
      if (!bar || !track) return

      const totalScrollable = activeScroller.scrollHeight - activeScroller.clientHeight
      const ratio =
        totalScrollable <= 0
          ? 0
          : Math.min(1, Math.max(0, activeScroller.scrollTop / totalScrollable))

      bar.style.transform = `scaleX(${ratio})`
      track.setAttribute("aria-valuenow", String(Math.round(ratio * 100)))
    }

    const scheduleUpdate = () => {
      if (frame) return
      frame = window.requestAnimationFrame(writeProgress)
    }

    // Capture phase: fires for scroll on any descendant (and on center itself).
    // Track whichever element the user is actually scrolling.
    const onScrollCapture = (event: Event) => {
      const target = event.target
      if (target instanceof HTMLElement) {
        activeScroller = target
      }
      scheduleUpdate()
    }

    writeProgress()
    center.addEventListener("scroll", onScrollCapture, { capture: true, passive: true })
    window.addEventListener("resize", scheduleUpdate)

    // Editor content height changes as you type, switch view modes, or as PDF
    // pages render in — observe both the center and the resolved scroller so
    // the ratio stays correct without a scroll event.
    const resizeObserver = new ResizeObserver(scheduleUpdate)
    resizeObserver.observe(center)
    const primary = resolvePrimaryScroller()
    if (primary !== center) resizeObserver.observe(primary)

    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      center.removeEventListener("scroll", onScrollCapture, { capture: true } as EventListenerOptions)
      window.removeEventListener("resize", scheduleUpdate)
      resizeObserver.disconnect()
    }
  }, [showReadingProgress, activeDocumentType, viewMode, project?.id, project?.activeId])

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

  const isElectronMac = Boolean(window.electronAPI) && window.electronAPI?.platform === "darwin"
  const showWebMenuSpacing = Boolean(window.electronAPI) && !isElectronMac

  return (
    <div className={`editor-workspace ${showWebMenuSpacing ? "editor-workspace--with-menu" : ""}`.trim()}>
      <div
        className="editor-workspace__topbar"
        style={{ "--topbar-left": `${isLeftRailOpen ? leftPanelWidth : 0}px`, left: `var(--topbar-left)` } as React.CSSProperties}
      >
        {showReadingProgress ? (
          <div
            ref={readingProgressTrackRef}
            className="editor-workspace__reading-progress"
            role="progressbar"
            aria-label="Document reading progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={0}
          >
            <div ref={readingProgressBarRef} className="editor-workspace__reading-progress-bar" />
          </div>
        ) : null}
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
          <div className="editor-workspace__doc-nav" aria-label="Navigation history">
            <button
              type="button"
              className="editor-workspace__doc-nav-btn"
              aria-label="Go back"
              disabled={!canGoBack}
              onClick={onGoBack}
            >
              <ArrowLeft size={16} aria-hidden={true} />
            </button>
            <button
              type="button"
              className="editor-workspace__doc-nav-btn"
              aria-label="Go forward"
              disabled={!canGoForward}
              onClick={onGoForward}
            >
              <ArrowRight size={16} aria-hidden={true} />
            </button>
          </div>

          <div className="editor-workspace__doc-path-trail" aria-label="Current document path">
            {activeFolderName ? (
              <>
                <button
                  type="button"
                  data-marquee-parent
                  className="editor-workspace__doc-path-btn editor-workspace__doc-path-segment editor-workspace__doc-path-segment--folder"
                  onClick={(e) => {
                    if (e.metaKey || e.ctrlKey) {
                      window.open(new URL("/app", window.location.origin).toString(), "_blank")
                    } else {
                      handleReturnToDashboard()
                    }
                  }}
                  onContextMenu={handleFolderSegmentContextMenu}
                  aria-label="Open project folder"
                >
                  <Folder size={14} aria-hidden={true} />
                  <MarqueeText text={activeFolderName} />
                </button>
                <span className="editor-workspace__doc-path-separator" aria-hidden={true}>/</span>
                <button
                  type="button"
                  data-marquee-parent
                  className="editor-workspace__doc-path-btn editor-workspace__doc-path-segment"
                  onClick={(e) => {
                    if ((e.metaKey || e.ctrlKey) && onOpenProjectInNewTab) {
                      onOpenProjectInNewTab(project.id)
                    } else {
                      handleReturnToDashboard()
                    }
                  }}
                  onContextMenu={handleProjectSegmentContextMenu}
                  aria-label="Open library"
                >
                  <MarqueeText text={project.name} />
                </button>
              </>
            ) : (
              <button
                type="button"
                data-marquee-parent
                className="editor-workspace__doc-path-btn editor-workspace__doc-path-segment editor-workspace__doc-path-segment--folder"
                onClick={(e) => {
                  if ((e.metaKey || e.ctrlKey) && onOpenProjectInNewTab) {
                    onOpenProjectInNewTab(project.id)
                  } else {
                    handleReturnToDashboard()
                  }
                }}
                onContextMenu={handleProjectSegmentContextMenu}
                aria-label="Open library"
              >
                {(() => {
                  const Icon = iconForProjectKind(project.kind)
                  return <Icon size={14} aria-hidden={true} />
                })()}
                <MarqueeText text={project.name} />
              </button>
            )}

            {activeTabPath.length > 0 ? <span className="editor-workspace__doc-path-separator" aria-hidden={true}>/</span> : null}

            {activeTabPath.map((node, index) => (
              <span key={node.id} className="editor-workspace__doc-path-part">
                <button
                  type="button"
                  data-marquee-parent
                  className={`editor-workspace__doc-path-btn editor-workspace__doc-path-segment ${index === activeTabPath.length - 1 ? "editor-workspace__doc-path-segment--active" : ""}`.trim()}
                  onClick={(event) => {
                    if (event.metaKey || event.ctrlKey) {
                      const url = new URL("/app", window.location.origin)
                      url.searchParams.set("projectId", project.id)
                      url.searchParams.set("tabId", node.id)
                      window.open(url.toString(), "_blank")
                    } else {
                      onProjectChange((currentProject) => ({
                        ...currentProject,
                        activeId: node.id,
                      }))
                    }
                  }}
                  onContextMenu={(e) => handleTabSegmentContextMenu(e, node.id)}
                  aria-label={`Open ${node.title}`}
                >
                  <MarqueeText text={node.title} />
                </button>
                {index < activeTabPath.length - 1 ? <span className="editor-workspace__doc-path-separator" aria-hidden={true}>/</span> : null}
              </span>
            ))}
          </div>
        </div>
        ) : (
        <div className="editor-workspace__doc-path">
          <div className="editor-workspace__doc-nav" aria-label="Navigation history">
            <button
              type="button"
              className="editor-workspace__doc-nav-btn"
              aria-label="Go back"
              disabled={!canGoBack}
              onClick={onGoBack}
            >
              <ArrowLeft size={16} aria-hidden={true} />
            </button>
            <button
              type="button"
              className="editor-workspace__doc-nav-btn"
              aria-label="Go forward"
              disabled={!canGoForward}
              onClick={onGoForward}
            >
              <ArrowRight size={16} aria-hidden={true} />
            </button>
          </div>
          <div className="editor-workspace__doc-path-trail" aria-label="Current view">
            <span className="editor-workspace__doc-path-segment editor-workspace__doc-path-segment--active" style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: "var(--app-ui-font)", fontSize: 14 }}>
              Library
            </span>
          </div>
        </div>
        )}
        {viewToggleAvailable ? (
          <div className="editor-workspace__view-toggle" role="tablist" aria-label="Editor view mode">
            <span
              className="editor-workspace__view-toggle-indicator"
              style={{
                left: `${viewIndicatorStyle.left}px`,
                width: `${viewIndicatorStyle.width}px`,
                opacity: viewIndicatorStyle.visible ? 1 : 0,
              }}
              aria-hidden={true}
            />
            <button
              ref={(el) => { viewToggleRefs.current.drafting = el }}
              type="button"
              role="tab"
              aria-selected={viewMode === "drafting"}
              className={`editor-workspace__view-toggle-pill${viewMode === "drafting" ? " editor-workspace__view-toggle-pill--active" : ""}`}
              onClick={() => { if (viewMode !== "drafting") onToggleViewMode?.() }}
              title="Drafting view"
            >
              Draft
            </button>
            <button
              ref={(el) => { viewToggleRefs.current.typewriter = el }}
              type="button"
              role="tab"
              aria-selected={viewMode === "typewriter"}
              className={`editor-workspace__view-toggle-pill${viewMode === "typewriter" ? " editor-workspace__view-toggle-pill--active" : ""}`}
              onClick={() => { if (viewMode !== "typewriter") onToggleViewMode?.() }}
              title="Typewriter view"
            >
              Typewriter
            </button>
          </div>
        ) : markdownViewToggleAvailable ? (
          <div className="editor-workspace__view-toggle" role="tablist" aria-label="Markdown view mode">
            <span
              className="editor-workspace__view-toggle-indicator"
              style={{
                left: `${markdownViewIndicatorStyle.left}px`,
                width: `${markdownViewIndicatorStyle.width}px`,
                opacity: markdownViewIndicatorStyle.visible ? 1 : 0,
              }}
              aria-hidden={true}
            />
            <button
              ref={(el) => { markdownViewToggleRefs.current.editor = el }}
              type="button"
              role="tab"
              aria-selected={markdownViewMode === "editor"}
              className={`editor-workspace__view-toggle-pill${markdownViewMode === "editor" ? " editor-workspace__view-toggle-pill--active" : ""}`}
              onClick={() => { if (markdownViewMode !== "editor") onSetMarkdownViewMode?.("editor") }}
              title="Editor only"
            >
              Editor
            </button>
            <button
              ref={(el) => { markdownViewToggleRefs.current.both = el }}
              type="button"
              role="tab"
              aria-selected={markdownViewMode === "both"}
              className={`editor-workspace__view-toggle-pill${markdownViewMode === "both" ? " editor-workspace__view-toggle-pill--active" : ""}`}
              onClick={() => { if (markdownViewMode !== "both") onSetMarkdownViewMode?.("both") }}
              title="Editor and preview"
            >
              Both
            </button>
            <button
              ref={(el) => { markdownViewToggleRefs.current.preview = el }}
              type="button"
              role="tab"
              aria-selected={markdownViewMode === "preview"}
              className={`editor-workspace__view-toggle-pill${markdownViewMode === "preview" ? " editor-workspace__view-toggle-pill--active" : ""}`}
              onClick={() => { if (markdownViewMode !== "preview") onSetMarkdownViewMode?.("preview") }}
              title="Preview only"
            >
              Preview
            </button>
          </div>
        ) : null}

        <button
          type="button"
          className="editor-workspace__panel-toggle"
          aria-label={isRightRailOpen ? "Collapse right panel" : "Expand right panel"}
          onClick={() => setIsRightRailOpen((prev) => !prev)}
        >
          <PanelRight size={16} aria-hidden={true} />
        </button>

        {topbarMenu && topbarMenuActions.length > 0 ? (
          <ProjectContextMenu
            x={topbarMenu.x}
            y={topbarMenu.y}
            actions={topbarMenuActions}
            onClose={closeTopbarMenu}
          />
        ) : null}
      </div>

      <div
        ref={bodyRef}
        className={`editor-workspace__body ${!isLeftRailOpen ? "editor-workspace__body--collapsed-left" : ""} ${!isRightRailOpen ? "editor-workspace__body--collapsed-right" : ""} ${draggingPanel ? "editor-workspace__body--dragging" : ""}`.trim()}
        style={{
          gridTemplateColumns: `${isLeftRailOpen ? leftPanelWidth : 0}px ${isLeftRailOpen ? panelSeparatorWidth : 0}px 1fr ${isRightRailOpen ? panelSeparatorWidth : 0}px ${isRightRailOpen ? rightPanelWidth : 0}px`,
          // Expose rail widths so descendants (e.g. the typewriter scroll) can
          // anchor their content to the viewport center regardless of which
          // rails are open. `--rail-left-natural-w` always reflects the rail's
          // natural width (open or not) so editors can keep content fixed in
          // viewport space when a panel collapses.
          ["--rail-left-w" as string]: `${isLeftRailOpen ? leftPanelWidth + panelSeparatorWidth : 0}px`,
          ["--rail-right-w" as string]: `${isRightRailOpen ? rightPanelWidth + panelSeparatorWidth : 0}px`,
          ["--rail-left-natural-w" as string]: `${leftPanelWidth + panelSeparatorWidth}px`,
        }}
      >
        <NavigationPanel
          project={project}
          projects={projects}
          folders={folders}
          librarySection={librarySection}
          setLibrarySection={setLibrarySection}
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
          onOpenProjectInNewTab={onOpenProjectInNewTab}
          onReturnToDashboard={handleReturnToDashboard}
          onProjectChange={onProjectChange}
          onToggleWordStats={onToggleWordStats}
          sessionToken={sessionToken}
          projectDocumentMap={projectDocumentMap}
          onCopyProjectPath={onCopyProjectPath}
          onShowProjectInFinder={onShowProjectInFinder}
          onMoveProjectToCloud={onMoveProjectToCloud}
          onOpenFolderInNewWindow={onOpenFolderInNewWindow}
          onApplyFolderFinderColor={onApplyFolderFinderColor}
          pendingEditTabIds={pendingEditTabIds}
        />

        <div
          className={`editor-workspace__resizer editor-workspace__resizer--left ${draggingPanel === "left" ? "editor-workspace__resizer--dragging" : ""} ${!isLeftRailOpen ? "editor-workspace__resizer--hidden" : ""}`.trim()}
          role="separator"
          aria-label="Resize left panel"
          onMouseDown={() => setDraggingPanel("left")}
        />

        <div ref={editorCenterRef} className="editor-workspace__editor-center">
          {children}
        </div>

        <button
          type="button"
          className={`editor-workspace__settings-btn ${isEditorTyping ? "editor-workspace__settings-btn--hidden" : ""}`.trim()}
          aria-label="Open settings"
          onClick={onToggleSettings}
          style={{ right: `${(isRightRailOpen ? rightPanelWidth + panelSeparatorWidth : 0) + 14}px` }}
        >
          <Settings size={14} aria-hidden={true} />
        </button>

        {/* Markdown-only Info button — sits directly below the Settings
            button (shares the same styling class for visual parity) and
            opens the Markdown + LaTeX reference modal. */}
        {markdownViewToggleAvailable ? (
          <button
            type="button"
            className={`editor-workspace__settings-btn editor-workspace__info-btn ${isEditorTyping ? "editor-workspace__settings-btn--hidden" : ""}`.trim()}
            aria-label="Markdown reference"
            onClick={() => setIsMarkdownCheatsheetOpen(true)}
            style={{ right: `${(isRightRailOpen ? rightPanelWidth + panelSeparatorWidth : 0) + 14}px` }}
          >
            <Info size={14} aria-hidden={true} />
          </button>
        ) : null}

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
              pendingHunkCount={pendingHunkCount}
              onProposedEdits={onProposedEdits}
              onAcceptAll={onAcceptAllPendingHunks}
              onRejectAll={onRejectAllProposedEdits}
            />
          ) : null}
        </aside>
      </div>

      {/* Rename modal */}
      <Modal
        isOpen={Boolean(renameTarget)}
        onClose={closeRenameModal}
        title="Rename"
        titleIcon={<Pencil size={19} strokeWidth={1.9} aria-hidden="true" />}
        closeLabel="Cancel"
        footer={(
          <Button variant="footer" onClick={commitRename}>
            Rename
          </Button>
        )}
      >
        <input
          className="doc-tabs__rename-input"
          style={{ width: "100%", boxSizing: "border-box" }}
          value={renameValue}
          autoFocus
          onChange={(e) => setRenameValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitRename() } else if (e.key === "Escape") closeRenameModal() }}
        />
      </Modal>

      {/* Share dialog */}
      {shareProject && shareDocumentId ? (
        <ShareDialog
          isOpen={true}
          onClose={() => setShareProjectId(null)}
          sessionToken={sessionToken}
          documentId={shareDocumentId}
          projectName={shareProject.name}
          isOwner={!sharedProjectIds?.has(shareProject.id)}
          userEmail={userEmail}
          ownerEmail={ownerEmailByProjectId?.get(shareProject.id) ?? ""}
        />
      ) : null}

      {/* Markdown + LaTeX reference. Mount unconditionally so the close
          animation can play even if the Info button disappears
          mid-transition (e.g. user switches docs while it's open). */}
      <MarkdownCheatsheetModal
        isOpen={isMarkdownCheatsheetOpen}
        onClose={() => setIsMarkdownCheatsheetOpen(false)}
      />
    </div>
  )
}

