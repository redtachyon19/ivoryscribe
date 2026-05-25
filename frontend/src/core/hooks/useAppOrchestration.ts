import { useEffect, useMemo, useRef, useState } from "react"
import {
  DEFAULT_BODY_FONT,
  DEFAULT_CUSTOM_ACCENT,
  DEFAULT_CUSTOM_BACKGROUND,
  DEFAULT_DISPLAY_FONT,
  DEFAULT_UI_FONT,
  FONT_OPTIONS,
  PALETTE_OPTIONS,
  getInitialPalette,
} from "../utils/appearance"
import { requestAppColorPaletteChange, requestExportProject } from "../events/editorEvents"
import { getAppMenu, projectWorkspaceMenu, serializeMenuForElectron } from "../utils/menu"
import { exportProjectAsPdf } from "../../webapp/components/export/pdfExport"
import { buildDuplicateProjectName, createLocalId } from "../utils/libraryUtils"
import { createProject, createId, generateUntitledName, normalizeProjectAfterTabs, DEFAULT_DOCUMENT_CONTENT, getProjectMarkdownIds, type Project } from "../utils/projects"
import { buildVersionHistoryPageHtml, buildVersionPreviewHtml, getInitialManualVersionDefinition, mapVersionsForSettings, resolveThemeForPalette, restoreProjectFromVersion, serializeProjectSnapshot, type VersionSettingsEntry } from "../state/versioning"
import { useSession } from "./useSession"
import { useRouting } from "./useRouting"
import { useAppStyle } from "./useAppStyle"
import { useProjectVersioning } from "./useProjectVersioning"
import { useWorkspaceHydration, type WorkspaceMutators } from "./useWorkspaceHydration"
import { useCloudProjectsInLocalMode } from "./useCloudProjectsInLocalMode"
import { useDualStateMigration } from "./useDualStateMigration"
import { setSessionInStorage } from "../state/session"
import { useLocalRoot } from "../electron/localWorkspace"
import { useLocalFilesystemSync } from "../localFiles"
import { uploadLocalFileAsCloudDocument } from "../localFiles/cloudOverlay"
import { useCloudPreferenceSync } from "./useCloudPreferenceSync"

import { useTuskBilling } from "./useTuskBilling"
import { getPendingShareRequests, respondToShareRequest, type PendingShareRequest } from "../api"
import type { ProjectFolder } from "../../webapp/pages/Library"

export function useAppOrchestration() {
  // ── local state ──────────────────────────────────────────────
  const [projects, setProjects] = useState<Project[]>([])
  const [folders, setFolders] = useState<ProjectFolder[]>([])
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [view, setView] = useState<"projects" | "editor">("projects")
  const [bookCounter, setBookCounter] = useState(1)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isMenuBarEnabled, setIsMenuBarEnabled] = useState(false)
  const [isFlagsEnabled, setIsFlagsEnabled] = useState(false)
  const [isTranslucentNavPanel, setIsTranslucentNavPanel] = useState(true)
  const [isEditorTyping, setIsEditorTyping] = useState(false)
  const [isWorkspaceHydrated, setIsWorkspaceHydrated] = useState(false)
  const [projectDocumentMap, setProjectDocumentMap] = useState<Record<string, string>>({})
  const [pendingShareRequests, setPendingShareRequests] = useState<PendingShareRequest[]>([])
  const viewRef = useRef<"projects" | "editor">("projects")
  const activeProjectRef = useRef<Project | null>(null)
  const projectDocumentMapRef = useRef<Record<string, string>>({})

  // refs for cross-hook callbacks (set after hooks are created)
  const billingResetRef = useRef<() => void>(() => {})
  const versioningResetRef = useRef<(v: Record<string, never>) => void>(() => {})
  // Tracks whether we're in Electron local-file mode. Logout reads this to
  // decide whether to clear projects[] / folders[] (cloud mode = clear all;
  // local mode = keep them, since the disk is the source of truth and
  // clearing would make useLocalFilesystemSync trash every file).
  const isLocalModeRef = useRef(false)

  // ── composed hooks ───────────────────────────────────────────
  const { currentPathname, requestedProjectId, requestedTabId, checkoutResult, passwordResetToken, navigateTo, navigateReplace } = useRouting()
  const style = useAppStyle()

  // Decide local-vs-cloud mode BEFORE any data-loading hooks fire so cloud
  // hydration is guaranteed never to touch projects[] in local mode. Calling
  // useLocalRoot here is safe — it has no dependencies on session.
  const isElectron = typeof window !== "undefined" && Boolean(window.electronAPI)
  const localRoot = useLocalRoot()
  const isLocalMode = isElectron && Boolean(localRoot.root)
  isLocalModeRef.current = isLocalMode

  const {
    session, isAuthBootstrapping, authLoadError, sessionRef,
    setSession, setIsAuthBootstrapping, setAuthLoadError,
    handleAuthenticated, logout,
    saveAccountProfile, requestPasswordReset, requestEmailChange,
    verifyCurrentEmailChange, confirmEmailChange, requestDeletion, confirmDeletionCode,
  } = useSession({
    onLogin: () => { setIsSettingsOpen(false); navigateReplace("/app"); setView("projects") },
    onLogout: () => {
      setIsSettingsOpen(false)
      // In local mode, the disk is the source of truth — clearing projects[]
      // or folders[] would have useLocalFilesystemSync diff it against the
      // previous state and trash every file on disk. Keep them. We only
      // forget the cloud-side mappings (cloud-id, shares, billing) and the
      // synced UI customization (palette, fonts, toggles) — those belong to
      // the account.
      if (!isLocalModeRef.current) {
        setIsWorkspaceHydrated(false)
        setProjects([])
        setFolders([])
        setActiveProjectId(null)
      } else {
        // Reset palette + fonts + UI toggles to defaults so the next person
        // who signs in on this machine doesn't inherit the previous account's
        // theme. Local files stay.
        style.setPalette(getInitialPalette())
        style.setCustomPaletteBackground(DEFAULT_CUSTOM_BACKGROUND)
        style.setCustomPaletteAccent(DEFAULT_CUSTOM_ACCENT)
        style.applyDisplayFont(DEFAULT_DISPLAY_FONT)
        style.applyBodyFont(DEFAULT_BODY_FONT)
        style.applyUiFont(DEFAULT_UI_FONT)
        style.applyFontSize(32)
        style.setIsWordCountEnabled(false)
        setIsMenuBarEnabled(false)
        setIsFlagsEnabled(false)
        setIsTranslucentNavPanel(true)
      }
      versioningResetRef.current({})
      setProjectDocumentMap({})
      setPendingShareRequests([])
      billingResetRef.current()
      setView("projects")
    },
  })

  const handleRestoreVersion = (projectId: string, snapshot: Project): boolean => {
    let found = false
    setProjects((current) =>
      current.map((project) => {
        if (project.id !== projectId) return project
        found = true
        return restoreProjectFromVersion(project, snapshot)
      }),
    )
    if (!found) return false
    setActiveProjectId(projectId)
    setView("editor")
    return true
  }

  const handleDuplicateVersion = (snapshot: Project): string | null => {
    const duplicated = JSON.parse(JSON.stringify(snapshot)) as Project
    const newId = createId()
    setProjects((current) => {
      const duplicateName = buildDuplicateProjectName(
        duplicated.name,
        current.map((p) => p.name),
      )
      const base: Project = {
        ...duplicated,
        id: newId,
        createdAt: new Date().toISOString(),
        name: duplicateName,
        folderId: null,
        rootPosition: "top",
      }
      return [normalizeProjectAfterTabs(base, base.tabs), ...current]
    })
    setActiveProjectId(newId)
    setView("projects")
    return newId
  }

  const versioning = useProjectVersioning({
    sessionRef, session, projects,
    projectDocumentMapRef, setProjectDocumentMap,
    isWorkspaceHydrated,
    activeProjectRef, viewRef,
    onRestoreVersion: handleRestoreVersion,
    onDuplicateVersion: handleDuplicateVersion,
  })

  const billing = useTuskBilling({
    session, isWorkspaceHydrated, currentPathname, checkoutResult, navigateReplace,
  })

  // keep refs in sync for logout callback
  billingResetRef.current = billing.reset
  versioningResetRef.current = versioning.setProjectVersionsByProjectId as (v: Record<string, never>) => void

  // Electron+local mode: the user's filesystem is the source of truth for
  // In local mode, the disk is the source of truth — block cloud hydration
  // from ever pulling `projects[]` from /api/sync, which would otherwise
  // replace the user's local files with whatever was on the server (or wipe
  // them if the server is empty). Passing null `session` makes every
  // useWorkspaceHydration effect bail out at its `if (!session)` guard.
  const workspaceMutators: WorkspaceMutators = useMemo(() => ({
    setIsAuthBootstrapping, setAuthLoadError,
    onAuthFailure: (message) => {
      setSession(null)
      setSessionInStorage(null)
      setAuthLoadError(message)
    },
    setIsWorkspaceHydrated,
    setProjects, setProjectDocumentMap,
    setProjectVersionsByProjectId: versioning.setProjectVersionsByProjectId,
    setFolders, setActiveProjectId, setView, setBookCounter,
    setPendingShareRequests,
    setTuskAiBilling: billing.setTuskAiBilling,
    setIsMenuBarEnabled, setIsFlagsEnabled, setIsTranslucentNavPanel,
    setPalette: style.setPalette,
    setCustomPaletteBackground: style.setCustomPaletteBackground,
    setCustomPaletteAccent: style.setCustomPaletteAccent,
    setDisplayFont: style.setDisplayFont,
    setBodyFont: style.setBodyFont,
    setUiFont: style.setUiFont,
    setFontSize: style.setFontSize,
    setIsWordCountEnabled: style.setIsWordCountEnabled,
  }), [
    setIsAuthBootstrapping, setAuthLoadError, setSession,
    setIsWorkspaceHydrated, versioning.setProjectVersionsByProjectId,
    billing.setTuskAiBilling,
    style.setPalette, style.setCustomPaletteBackground, style.setCustomPaletteAccent,
    style.setDisplayFont, style.setBodyFont, style.setUiFont,
    style.setFontSize, style.setIsWordCountEnabled,
  ])

  const { sharedDocumentIdsRef, shareIdByProjectIdRef, ownerEmailByProjectIdRef, permanentlyDeleteProjects } = useWorkspaceHydration({
    session: isLocalMode ? null : session,
    mutators: workspaceMutators,
    isWorkspaceHydrated, projectDocumentMap,
    projects, activeProjectId, palette: style.palette,
    customPaletteBackground: style.customPaletteBackground, customPaletteAccent: style.customPaletteAccent,
    displayFont: style.displayFont, bodyFont: style.bodyFont, uiFont: style.uiFont,
    fontSize: style.fontSize, isWordCountEnabled: style.isWordCountEnabled,
    folders, isMenuBarEnabled, isFlagsEnabled, isTranslucentNavPanel, view, bookCounter,
  })

  // In local mode, useWorkspaceHydration is gated off (it would overwrite
  // local files). That gate also disables preference sync — this hook
  // restores it without touching projects[] or folders[].
  useCloudPreferenceSync({
    session: isLocalMode ? session : null,
    palette: style.palette,
    customPaletteBackground: style.customPaletteBackground,
    customPaletteAccent: style.customPaletteAccent,
    displayFont: style.displayFont,
    bodyFont: style.bodyFont,
    uiFont: style.uiFont,
    fontSize: style.fontSize,
    isWordCountEnabled: style.isWordCountEnabled,
    isMenuBarEnabled,
    isFlagsEnabled,
    isTranslucentNavPanel,
    setPalette: style.setPalette,
    setCustomPaletteBackground: style.setCustomPaletteBackground,
    setCustomPaletteAccent: style.setCustomPaletteAccent,
    setDisplayFont: style.setDisplayFont,
    setBodyFont: style.setBodyFont,
    setUiFont: style.setUiFont,
    setFontSize: style.setFontSize,
    setIsWordCountEnabled: style.setIsWordCountEnabled,
    setIsMenuBarEnabled,
    setIsFlagsEnabled,
    setIsTranslucentNavPanel,
  })

  const { handle: localFsHandle } = useLocalFilesystemSync({
    root: isLocalMode ? localRoot.root : null,
    setProjects,
    setFolders,
    setActiveProjectId,
    setIsWorkspaceHydrated,
    // setProjectDocumentMap intentionally NOT passed — only the cloud
    // hook writes that map in the new model. Local files don't carry
    // cloud-ids anymore.
    projects,
    folders,
  })

  // In local mode, also pull the user's cloud Documents into the
  // Library when they're signed in — so the same project list shows
  // both their on-disk files and their cloud-only projects. The two
  // never collide (a project is one or the other, never both); this
  // hook merges by `source: "cloud"` and the local filesystem sync
  // ignores everything that isn't `source: "local"`. Edits to cloud
  // projects autosave back to the API; local projects autosave to
  // disk via useLocalFilesystemSync above.
  const cloudInLocal = useCloudProjectsInLocalMode({
    session: isLocalMode ? session : null,
    isLocalMode,
    projects,
    setProjects,
    setProjectDocumentMap,
  })

  // One-time per-session migration: retire any legacy dual-state
  // projects (local file with embedded cloud-id) by trashing the
  // local copy now that the cloud fetch above has confirmed the
  // cloud Document is reachable. Idempotent within a session — only
  // re-runs when the workspace re-hydrates (e.g. user changes root).
  useDualStateMigration({
    isLocalMode,
    isWorkspaceHydrated,
    projects,
    projectDocumentMap,
    localFsHandle: localFsHandle ?? null,
    setProjects,
  })

  // Track an auth overlay flag so share flows can request sign-in without
  // navigating away (Electron local mode has no other login entry point).
  const [isAuthOverlayOpen, setIsAuthOverlayOpen] = useState(false)
  // Remember which project the user was trying to share when prompted to sign
  // in; after a successful login we kick that share back off automatically.
  const pendingShareProjectIdRef = useRef<string | null>(null)

  /**
   * Upload a local-only project to the cloud (if not already there), stamp
   * the returned Document.id into the local file's `cloud-id` attribute, and
   * return that id so the share dialog can proceed. No-ops with the existing
   * id when the project is already shared.
   */
  /** Promote a local project to cloud: upload its current content to
   *  the cloud as a new Document, flip `source` to `"cloud"`, register
   *  the doc id, then trash the local file. Atomic from the user's
   *  POV — if the upload fails the file is left alone. */
  const moveLocalProjectToCloud = async (projectId: string): Promise<string | null> => {
    if (!session) {
      pendingShareProjectIdRef.current = projectId
      setIsAuthOverlayOpen(true)
      return null
    }
    if (!isLocalMode || !localFsHandle) return null
    const filePath = localFsHandle.getFilePathForProject(projectId)
    if (!filePath) return null

    let cloudId: string
    try {
      // Existing util — reads the file, uploads to cloud as a new
      // Document, returns the doc id. Doesn't touch the local file.
      cloudId = await uploadLocalFileAsCloudDocument(session.token, filePath)
    } catch (err) {
      console.error("[moveToCloud] upload failed; local file left intact:", err)
      return null
    }

    // Now flip state to cloud BEFORE trashing the file: the local-sync
    // diff sees source: "cloud" and skips any disk write that might
    // otherwise race with our trash. Then we trash. Then we remove
    // the local entry (the cloud fetch will repopulate it cleanly).
    setProjectDocumentMap((cur) => ({ ...cur, [projectId]: cloudId }))
    setProjects((cur) => cur.map((p) => p.id === projectId ? { ...p, source: "cloud" } : p))
    try {
      await localFsHandle.promoteLocalProjectToCloud(projectId)
    } catch (err) {
      console.error("[moveToCloud] trash step failed:", err)
    }
    return cloudId
  }

  /** Called by ShareDialog when the user wants to share a local
   *  project. In the new model that's the same operation as "Move to
   *  Cloud": upload the file, register the cloud doc id, flip
   *  `source` to `"cloud"`, trash the local file. Once it's cloud,
   *  the existing share flow takes over. */
  const enableCloudSharing = async (projectId: string): Promise<string | null> => {
    const existing = projectDocumentMap[projectId]
    if (existing) return existing
    return moveLocalProjectToCloud(projectId)
  }

  // ── ref syncs ────────────────────────────────────────────────
  useEffect(() => { viewRef.current = view }, [view])
  useEffect(() => { projectDocumentMapRef.current = projectDocumentMap }, [projectDocumentMap])

  // Auth overlay autocloses once the user signs in. The share button retry is
  // manual — they see "Try again" in the dialog after we close.
  useEffect(() => {
    if (session && isAuthOverlayOpen) {
      setIsAuthOverlayOpen(false)
    }
  }, [session, isAuthOverlayOpen])

  // ── derived data ─────────────────────────────────────────────
  const activeProject = useMemo(
    () => (activeProjectId ? projects.find((p) => p.id === activeProjectId) : null) ?? projects[0] ?? null,
    [projects, activeProjectId],
  )
  const activeContent = useMemo(
    () => (activeProject?.activeId ? activeProject.contentById[activeProject.activeId] : null) ?? DEFAULT_DOCUMENT_CONTENT,
    [activeProject],
  )
  const activeFolderName = useMemo(() => {
    if (!activeProject?.folderId) {
      return null
    }

    return folders.find((folder) => folder.id === activeProject.folderId)?.name ?? null
  }, [activeProject?.folderId, folders])
  const activeProjectVersionsForSettings = useMemo(
    () => (activeProject ? mapVersionsForSettings(versioning.projectVersionsByProjectId[activeProject.id] ?? []) : []),
    [activeProject, versioning.projectVersionsByProjectId],
  )
  const activeDocumentIsMarkdown = useMemo(() => {
    if (!activeProject?.activeId) {
      return false
    }

    if ((activeProject.pinboardIds ?? []).includes(activeProject.activeId)) {
      return false
    }

    if ((activeProject.typewriterIds ?? []).includes(activeProject.activeId)) {
      return false
    }

    return getProjectMarkdownIds(activeProject).includes(activeProject.activeId)
  }, [activeProject])
  const projectVersionsForLibraryByProjectId = useMemo(() => {
    return projects.reduce<Record<string, VersionSettingsEntry[]>>((accumulator, project) => {
      accumulator[project.id] = mapVersionsForSettings(versioning.projectVersionsByProjectId[project.id] ?? [])
      return accumulator
    }, {})
  }, [projects, versioning.projectVersionsByProjectId])

  useEffect(() => { activeProjectRef.current = activeProject }, [activeProject])
  useEffect(() => { if (!activeProjectId && projects[0]) setActiveProjectId(projects[0].id) }, [projects, activeProjectId])

  useEffect(() => {
    if (!isWorkspaceHydrated || currentPathname !== "/app" || !requestedProjectId) return
    if (!projects.some((p) => p.id === requestedProjectId)) return
    setActiveProjectId(requestedProjectId)
    setView("editor")
    if (requestedTabId) {
      setProjects((cur) => cur.map((p) => {
        if (p.id !== requestedProjectId) return p
        const tabIds = p.tabs.flatMap(function collect(t): string[] { return [t.id, ...t.children.flatMap(collect)] })
        if (!tabIds.includes(requestedTabId)) return p
        return { ...p, activeId: requestedTabId }
      }))
    }
  }, [currentPathname, isWorkspaceHydrated, projects, requestedProjectId, requestedTabId])

  // ── share request handlers ────────────────────────────────────
  const handleAcceptShareRequest = async (shareId: string) => {
    if (!session) return
    try {
      const result = await respondToShareRequest(session.token, shareId, "accept")
      setPendingShareRequests((cur) => cur.filter((r) => r.id !== shareId))

      if (result.document) {
        const parsed = JSON.parse(result.document.content)
        if (parsed && typeof parsed === "object" && parsed.id) {
          // Track this as a shared document so sync handles it correctly
          sharedDocumentIdsRef.current = new Set([...sharedDocumentIdsRef.current, result.document.id])

          setProjects((current) => {
            if (current.some((p) => p.id === parsed.id)) return current
            return [parsed, ...current]
          })
          setProjectDocumentMap((current) => ({
            ...current,
            [parsed.id]: result.document!.id,
          }))
        }
      }
    } catch {
      // silently fail
    }
  }

  const handleRejectShareRequest = async (shareId: string) => {
    if (!session) return
    try {
      await respondToShareRequest(session.token, shareId, "reject")
      setPendingShareRequests((cur) => cur.filter((r) => r.id !== shareId))
    } catch {
      // silently fail
    }
  }

  const refreshPendingShareRequests = async () => {
    if (!session) return
    try {
      const requests = await getPendingShareRequests(session.token)
      setPendingShareRequests(requests)
    } catch {
      // silently fail
    }
  }

  // ── version action message listener (view / export from new-tab pages) ──
  useEffect(() => {
    const onVersionAction = (event: MessageEvent<unknown>) => {
      if (event.origin !== window.location.origin || !event.data || typeof event.data !== "object") return
      const msg = event.data as { type?: string; action?: string; projectId?: string; versionId?: string }
      if (msg.type !== "ivory:version-action" || typeof msg.projectId !== "string" || typeof msg.versionId !== "string") return

      const versions = versioning.projectVersionsByProjectId[msg.projectId] ?? []
      const version = versions.find((v) => v.id === msg.versionId)
      if (!version) return

      if (msg.action === "view") {
        const html = buildVersionPreviewHtml({ version, bodyFont: style.bodyFont, projectId: msg.projectId })
        const blobUrl = URL.createObjectURL(new Blob([html], { type: "text/html" }))
        window.open(blobUrl, "_blank")
        window.setTimeout(() => URL.revokeObjectURL(blobUrl), 15_000)
        return
      }

      if (msg.action === "export") {
        exportProjectAsPdf(version.snapshot)
      }
    }

    window.addEventListener("message", onVersionAction)
    return () => { window.removeEventListener("message", onVersionAction) }
  }, [versioning.projectVersionsByProjectId, style.bodyFont])

  // ── helpers ──────────────────────────────────────────────────
  const updateActiveProject = (updater: (project: Project) => Project) => {
    const id = activeProjectId ?? activeProject?.id
    if (!id) return
    setProjects((cur) => cur.map((p) => (p.id !== id ? p : updater(p))))
  }

  // ── prop bundles ─────────────────────────────────────────────
  const passwordResetProps = {
    token: passwordResetToken,
    onBackToApp: () => navigateReplace(session ? "/app" : "/auth"),
  }

  const homeProps = {
    isLoggedIn: Boolean(session),
    onLaunchDashboard: () => { navigateReplace("/app"); setView("projects") },
    onOpenAuth: () => navigateTo("/auth"),
  }

  const authProps = {
    onAuthenticated: handleAuthenticated,
    loadError: authLoadError,
    isLoggedIn: Boolean(session),
    signedInFirstName: session?.user.firstName ?? "",
    onLaunchDashboard: () => { navigateReplace("/app"); setView("projects") },
    onSignOut: logout,
    onBackToLanding: () => navigateTo("/"),
  }

  const menuBarProps = {
    enabled: isMenuBarEnabled,
    items: view === "projects" ? projectWorkspaceMenu : getAppMenu({ markdownDocumentActive: activeDocumentIsMarkdown }),
  }

  // ── Electron native menu sync ──
  const isElectronMac = Boolean(window.electronAPI) && window.electronAPI?.platform === "darwin"
  const nativeMenuCommandMapRef = useRef<Record<string, () => void>>({})

  useEffect(() => {
    if (!isElectronMac) return

    const { nativeItems, commandMap } = serializeMenuForElectron(menuBarProps.items)
    nativeMenuCommandMapRef.current = commandMap
    window.electronAPI?.updateMenu(nativeItems)
  }, [isElectronMac, menuBarProps.items])

  useEffect(() => {
    if (!isElectronMac) return

    const unsubscribe = window.electronAPI?.onMenuCommand((commandId: string) => {
      const action = nativeMenuCommandMapRef.current[commandId]
      if (action) action()
    })

    return () => { unsubscribe?.() }
  }, [isElectronMac])

  const brandProps = {
    hasMenu: isMenuBarEnabled && (view === "editor" || view === "projects"),
    onNavigateHome: () => navigateTo("/"),
  }

  // Electron local mode doesn't require a session — the editor renders against
  // local files. AI / share / cloud sync features no-op gracefully when
  // sessionToken is empty.
  const editorProps = (session || isLocalMode) ? {
    sessionToken: session?.token ?? "",
    project: activeProject,
    tuskAiActivated: billing.tuskAiBilling.tuskAiActivated,
    isStartingTuskCheckout: billing.isStartingTuskCheckout,
    activeContent,
    // The current workspace folder the user has chosen in settings.
    // Read-only kinds (PDFs) store their path RELATIVE to this root and
    // resolve to an absolute path at render time, so changing the
    // workspace in settings automatically reroots every PDF without
    // anyone having to write or invalidate a cached absolute path.
    workspaceRoot: isLocalMode ? localRoot.root : null,
    matchPdfToPalette: style.matchPdfToPalette,
    editorFontSize: style.fontSize,
    menuBarEnabled: isMenuBarEnabled,
    translucentNavPanel: isTranslucentNavPanel,
    flagsEnabled: isFlagsEnabled,
    showWordCount: style.isWordCountEnabled,
    isEditorTyping,
    activeFolderName,
    projects,
    folders,
    setProjects,
    setFolders,
    onOpenProject: (projectId: string) => { setActiveProjectId(projectId); setView("editor") },
    onCreateProject: (kind: import("../utils/projects").ProjectKind) => {
      const nextName = generateUntitledName(projects, kind)
      const nextProject = createProject(nextName, kind)
      setProjects((cur) => [{ ...nextProject, folderId: null, rootPosition: "top" }, ...cur])
      setActiveProjectId(nextProject.id)
      if (sessionRef.current && isWorkspaceHydrated) {
        void versioning.createProjectVersionSnapshot(nextProject, getInitialManualVersionDefinition([], serializeProjectSnapshot(nextProject)), { alertOnFailure: false })
      }
    },
    onCreateFolder: () => {
      const nextIndex = folders.length + 1
      setFolders((current) => [{ id: createLocalId(), name: `Folder ${nextIndex}`, description: "Add a folder description here. You don't have the memory of an elephant." }, ...current])
    },
    onOpenProjectSettings: (projectId: string) => {
      setActiveProjectId(projectId)
      setIsSettingsOpen(true)
    },
    onReturnToDashboard: () => setView("projects"),
    onStartTuskCheckout: () => { void billing.handleStartTuskCheckout() },
    onProjectChange: updateActiveProject,
    onEditorTypingStateChange: setIsEditorTyping,
    onToggleSettings: () => setIsSettingsOpen((c) => !c),
    // Library integration props
    view,
    activeProjectId,
    setActiveProjectId,
    bookCounter,
    setBookCounter,
    onProjectCreated: (project: Project) => {
      if (sessionRef.current && isWorkspaceHydrated) {
        void versioning.createProjectVersionSnapshot(project, getInitialManualVersionDefinition([], serializeProjectSnapshot(project)), { alertOnFailure: false })
      }
    },
    onOpenProjectInNewTab: (projectId: string) => {
      const url = new URL("/app", window.location.origin)
      url.searchParams.set("projectId", projectId)
      window.open(url.toString(), "_blank")
    },
    activeProjectVersionsByProjectId: projectVersionsForLibraryByProjectId,
    projectDocumentMap,
    onPermanentlyDeleteProjects: permanentlyDeleteProjects,
    onEnableCloudSharing: enableCloudSharing,
    onMoveProjectToCloud: moveLocalProjectToCloud,
    // Local-only context-menu actions. Both no-op (and are exposed as
    // undefined) when there is no on-disk file backing the project — i.e.
    // pure cloud mode, or before workspace hydration.
    onCopyProjectPath: localFsHandle ? (projectId: string) => {
      const filePath = localFsHandle.getFilePathForProject(projectId)
      if (!filePath) return
      void navigator.clipboard.writeText(filePath)
    } : undefined,
    onShowProjectInFinder: (localFsHandle && window.electronAPI?.fs.showItemInFolder) ? (projectId: string) => {
      const filePath = localFsHandle.getFilePathForProject(projectId)
      if (!filePath) return
      window.electronAPI?.fs.showItemInFolder(filePath)
    } : undefined,
    userEmail: session?.user.email ?? "",
    // Merge share metadata from both sources:
    //  • useWorkspaceHydration owns cloud mode (it's gated off in
    //    local mode, so its refs are empty there).
    //  • useCloudProjectsInLocalMode owns local mode's cloud
    //    projects, including any that are shared.
    // Locally-only projects never appear in either set.
    sharedProjectIds: new Set([
      ...shareIdByProjectIdRef.current.keys(),
      ...cloudInLocal.sharedProjectIds,
    ]),
    ownerEmailByProjectId: new Map([
      ...ownerEmailByProjectIdRef.current,
      ...cloudInLocal.ownerEmailByProjectId,
    ]),
    pendingShareRequests,
    onAcceptShareRequest: handleAcceptShareRequest,
    onRejectShareRequest: handleRejectShareRequest,
    onRefreshPendingShareRequests: refreshPendingShareRequests,
    onShowVersionHistory: (projectId: string) => {
      const versions = versioning.projectVersionsByProjectId[projectId] ?? []
      const proj = projects.find((p) => p.id === projectId)
      const projectName = proj?.name ?? "Project"
      const theme = resolveThemeForPalette(style.palette, { customPaletteBackground: style.customPaletteBackground, customPaletteAccent: style.customPaletteAccent })
      const html = buildVersionHistoryPageHtml({ versions, projectName, projectId, bodyFont: style.bodyFont, uiFont: style.uiFont, displayFont: style.displayFont, ...theme, isElectron: !!window.electronAPI })
      const blobUrl = URL.createObjectURL(new Blob([html], { type: "text/html" }))
      window.open(blobUrl, "_blank")
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 30_000)
    },
  } : null

  const settingsProps = (session || isLocalMode) ? {
    isOpen: isSettingsOpen,
    showProjectPreferences: view === "editor",
    menuBarEnabled: isMenuBarEnabled,
    flagsEnabled: isFlagsEnabled,
    translucentNavPanel: isTranslucentNavPanel,
    displayFont: style.displayFont,
    bodyFont: style.bodyFont,
    uiFont: style.uiFont,
    showWordCount: style.isWordCountEnabled,
    fontSize: style.fontSize,
    palette: style.palette,
    paletteOptions: PALETTE_OPTIONS,
    fontOptions: [...FONT_OPTIONS],
    onClose: () => setIsSettingsOpen(false),
    onRestoreDefaults: () => {
      setIsMenuBarEnabled(false)
      setIsFlagsEnabled(false)
      setIsTranslucentNavPanel(true)
      style.applyDisplayFont(DEFAULT_DISPLAY_FONT)
      style.applyBodyFont(DEFAULT_BODY_FONT)
      style.applyUiFont(DEFAULT_UI_FONT)
      style.applyFontSize(32)
      style.setIsWordCountEnabled(false)
      style.setCustomPaletteBackground(DEFAULT_CUSTOM_BACKGROUND)
      style.setCustomPaletteAccent(DEFAULT_CUSTOM_ACCENT)
      style.setPalette(getInitialPalette())
    },
    onMenuBarEnabledChange: setIsMenuBarEnabled,
    onFlagsEnabledChange: setIsFlagsEnabled,
    onTranslucentNavPanelChange: setIsTranslucentNavPanel,
    onDisplayFontChange: style.applyDisplayFont,
    onBodyFontChange: style.applyBodyFont,
    onUiFontChange: style.applyUiFont,
    onShowWordCountChange: style.setIsWordCountEnabled,
    onFontSizeChange: style.applyFontSize,
    onPaletteChange: (p: string) => requestAppColorPaletteChange(p),
    customPaletteBackground: style.customPaletteBackground,
    customPaletteAccent: style.customPaletteAccent,
    onCustomPaletteBackgroundChange: style.setCustomPaletteBackground,
    onCustomPaletteAccentChange: style.setCustomPaletteAccent,
    matchPdfToPalette: style.matchPdfToPalette,
    onMatchPdfToPaletteChange: style.setMatchPdfToPalette,
    accountFirstName: session?.user.firstName ?? "",
    accountLastName: session?.user.lastName ?? "",
    accountEmail: session?.user.email ?? "",
    activeProjectName: activeProject?.name ?? "",
    activeProjectColor: activeProject?.color ?? "#7ea8ff",
    activeProjectWallpaperEmojis: activeProject?.wallpaperEmojis ?? "",
    activeProjectVersions: activeProjectVersionsForSettings,
    onActiveProjectNameChange: (name: string) => updateActiveProject((p) => ({ ...p, name })),
    onActiveProjectColorChange: (color: string) => updateActiveProject((p) => ({ ...p, color })),
    onActiveProjectWallpaperEmojisChange: (emojis: string) => updateActiveProject((p) => ({ ...p, wallpaperEmojis: emojis })),
    onShowVersionHistory: () => {
      if (!activeProject) return
      const versions = versioning.projectVersionsByProjectId[activeProject.id] ?? []
      const theme = resolveThemeForPalette(style.palette, { customPaletteBackground: style.customPaletteBackground, customPaletteAccent: style.customPaletteAccent })
      const html = buildVersionHistoryPageHtml({ versions, projectName: activeProject.name, projectId: activeProject.id, bodyFont: style.bodyFont, uiFont: style.uiFont, displayFont: style.displayFont, ...theme, isElectron: !!window.electronAPI })
      const blobUrl = URL.createObjectURL(new Blob([html], { type: "text/html" }))
      window.open(blobUrl, "_blank")
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 30_000)
    },
    onExportProject: (format: "pdf" | "docx" | "md" | "txt") => {
      if (!activeProject) return
      requestExportProject(format)
    },
    sessionToken: session?.token ?? "",
    documentId: activeProject ? projectDocumentMap[activeProject.id] : undefined,
    localWorkspaceRoot: isLocalMode ? localRoot.root : null,
    onChangeLocalWorkspace: isLocalMode ? localRoot.choose : undefined,
    onSaveAccountProfile: saveAccountProfile,
    onRequestAccountEmailChange: requestEmailChange,
    onVerifyCurrentAccountEmailChange: verifyCurrentEmailChange,
    onConfirmAccountEmailChange: confirmEmailChange,
    onRequestPasswordReset: requestPasswordReset,
    onRequestAccountDeletion: requestDeletion,
    onConfirmAccountDeletionCode: confirmDeletionCode,
    onSignOut: logout,
    onRequestSignIn: () => setIsAuthOverlayOpen(true),
  } : null

  return {
    // routing
    currentPathname,
    // auth
    session,
    isAuthBootstrapping,
    // auth overlay (Electron local-mode prompt to sign in for share)
    isAuthOverlayOpen,
    closeAuthOverlay: () => setIsAuthOverlayOpen(false),
    // style (for AppShell)
    style: { palette: style.palette, appStyleVariables: style.appStyleVariables },
    // view
    view,
    activeProject,
    // preferences
    isTranslucentNavPanel,
    // prop bundles
    passwordResetProps,
    homeProps,
    authProps,
    menuBarProps,
    brandProps,
    editorProps,
    settingsProps,
  }
}
