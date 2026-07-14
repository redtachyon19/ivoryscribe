import { useCallback, useEffect, useMemo, useRef, useState } from "react"
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
import { createProject, createId, generateUntitledName, normalizeProjectAfterTabs, DEFAULT_DOCUMENT_CONTENT, getProjectMarkdownIds, removeProjectVersions, type Project } from "../utils/projects"
import { mapVersionsForSettings, openVersionPreviewWindow, parseVersionSnapshot, restoreProjectFromVersion, type VersionSettingsEntry } from "../state/versioning"
import { readLastEditorLocation, readLastLibraryLocation, writeLastEditorLocation } from "../state/lastLocationStorage"
import { useSession } from "./useSession"
import { useRouting } from "./useRouting"
import { useAppStyle } from "./useAppStyle"
import { useProjectVersioning } from "./useProjectVersioning"
import { useWorkspaceHydration, type WorkspaceMutators } from "./useWorkspaceHydration"
import { useCloudProjectsInLocalMode } from "./useCloudProjectsInLocalMode"
import { useDualStateMigration } from "./useDualStateMigration"
import { setSessionInStorage } from "../state/session"
import { buildRootOverrideUrl, isPathInsideRoot, readOpenFileFromLocation, useLocalRoot } from "../electron/localWorkspace"
import { setMacFolderColor } from "../electron/macFolderLabels"
import { useLocalFilesystemSync } from "../localFiles"
import { uploadLocalFileAsCloudDocument } from "../localFiles/cloudOverlay"
import { useCloudPreferenceSync } from "./useCloudPreferenceSync"
import { useNativeTextEntryCommandBus } from "./useNativeTextEntryCommandBus"
import { getStoredBoolean, writeStoredPreferences } from "../state/preferencesStorage"

import { useTuskBilling } from "./useTuskBilling"
import { getPendingShareRequests, respondToShareRequest, type PendingShareRequest } from "../api"
import type { ProjectFolder } from "../../webapp/pages/Library"

export function useAppOrchestration() {
  // Application-global Cmd+A / Cmd+C / Cmd+V handler for native text
  // inputs (rename modals, settings fields, sidebar inline renames, …).
  // Mounted here — not inside an editor — so it stays active even in
  // Library view when no document editor is on screen. See
  // `useNativeTextEntryCommandBus` for the routing rationale.
  useNativeTextEntryCommandBus()

  // ── local state ──────────────────────────────────────────────
  const [projects, setProjects] = useState<Project[]>([])
  const [folders, setFolders] = useState<ProjectFolder[]>([])
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [view, setView] = useState<"projects" | "editor">("projects")
  const [bookCounter, setBookCounter] = useState(1)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  // Seed UI toggles from localStorage (same rationale as the style hook —
  // cloud sync overwrites these when it answers, but a reload before
  // cloud responds keeps the user's last choice instead of snapping
  // back to defaults).
  const [isMenuBarEnabled, setIsMenuBarEnabled] = useState<boolean>(() => getStoredBoolean("isMenuBarEnabled", false))
  const [isFlagsEnabled, setIsFlagsEnabled] = useState<boolean>(() => getStoredBoolean("isFlagsEnabled", false))
  const [isTranslucentNavPanel, setIsTranslucentNavPanel] = useState<boolean>(() => getStoredBoolean("isTranslucentNavPanel", true))

  useEffect(() => {
    writeStoredPreferences({
      isMenuBarEnabled,
      isFlagsEnabled,
      isTranslucentNavPanel,
    })
  }, [isMenuBarEnabled, isFlagsEnabled, isTranslucentNavPanel])
  const [isEditorTyping, setIsEditorTyping] = useState(false)
  const [isWorkspaceHydrated, setIsWorkspaceHydrated] = useState(false)
  const [projectDocumentMap, setProjectDocumentMap] = useState<Record<string, string>>({})
  const [pendingShareRequests, setPendingShareRequests] = useState<PendingShareRequest[]>([])
  // When non-null: the in-app VersionHistory modal is open for this project.
  // Closing the modal sets it back to null. Two call sites can open it (the
  // library context-menu and the project settings panel) — both just set
  // this id; rendering lives in App.tsx.
  const [versionHistoryProjectId, setVersionHistoryProjectId] = useState<string | null>(null)
  const viewRef = useRef<"projects" | "editor">("projects")
  const activeProjectRef = useRef<Project | null>(null)
  const projectDocumentMapRef = useRef<Record<string, string>>({})

  // refs for cross-hook callbacks (set after hooks are created)
  const billingResetRef = useRef<() => void>(() => {})
  // (Versions are now embedded in projects[]; clearing projects clears their
  // versions transitively. No separate reset ref needed.)
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
    session, isAuthBootstrapping, authLoadError,
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
    projects,
    setProjects,
    activeProjectRef,
    isWorkspaceHydrated,
    onRestoreVersion: handleRestoreVersion,
    onDuplicateVersion: handleDuplicateVersion,
  })

  const billing = useTuskBilling({
    session, isWorkspaceHydrated, currentPathname, checkoutResult, navigateReplace,
  })

  // keep refs in sync for logout callback
  billingResetRef.current = billing.reset

  // Electron is ALWAYS local-first: the user's filesystem is the source of
  // truth and cloud Documents arrive exclusively through
  // useCloudProjectsInLocalMode. useWorkspaceHydration's cloud fetch must
  // NEVER run here — it would pull `projects[]` from /api/sync and replace
  // the user's local files with whatever's on the server (or wipe them, or
  // create a stray "Book 1", if the server is empty).
  //
  // The gate below is `isElectron`, not `isLocalMode`. `isLocalMode` depends
  // on `localRoot.root`, which resolves asynchronously — so on the first
  // render(s) after a reload it's still false even though we're really in
  // local mode. During that window a restored session would kick off a cloud
  // hydrate that we can't cancel; when it lands (a beat after the disk has
  // loaded) it stomps the local files and forces the view back to the
  // library. Gating on `isElectron` (known synchronously) closes that race:
  // in Electron the hydrator always sees `session: null` and bails at its
  // `if (!session)` guard.
  //
  // (`isLocalMode` implies `isElectron`, so this is strictly broader than the
  // old `isLocalMode` gate — the only cases it newly covers are exactly the
  // pre-root-resolution renders that caused the bug.)
  const workspaceMutators: WorkspaceMutators = useMemo(() => ({
    setIsAuthBootstrapping, setAuthLoadError,
    onAuthFailure: (message) => {
      setSession(null)
      setSessionInStorage(null)
      setAuthLoadError(message)
    },
    setIsWorkspaceHydrated,
    setProjects, setProjectDocumentMap,
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
    setIsWorkspaceHydrated,
    billing.setTuskAiBilling,
    style.setPalette, style.setCustomPaletteBackground, style.setCustomPaletteAccent,
    style.setDisplayFont, style.setBodyFont, style.setUiFont,
    style.setFontSize, style.setIsWordCountEnabled,
  ])

  const { sharedDocumentIdsRef, shareIdByProjectIdRef, ownerEmailByProjectIdRef, permanentlyDeleteProjects } = useWorkspaceHydration({
    session: isElectron ? null : session,
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
    if (!isLocalMode || !localFsHandle) {
      // No on-disk backing for this project — usually means we're in
      // pure cloud mode and the user shouldn't have been offered the
      // action at all. Surface it instead of silently no-op'ing.
      console.warn("[moveToCloud] skipped: not in local mode or no FS handle")
      window.alert("Move to Cloud is only available in local-file mode.")
      return null
    }
    const filePath = localFsHandle.getFilePathForProject(projectId)
    if (!filePath) {
      console.warn("[moveToCloud] no file path for project", projectId)
      window.alert("Couldn't find a local file for this project — nothing to upload.")
      return null
    }

    let cloudId: string
    try {
      // Existing util — reads the file, uploads to cloud as a new
      // Document, returns the doc id. Doesn't touch the local file.
      cloudId = await uploadLocalFileAsCloudDocument(session.token, filePath)
    } catch (err) {
      console.error("[moveToCloud] upload failed; local file left intact:", err)
      const detail = err instanceof Error ? err.message : String(err)
      window.alert(`Failed to upload to cloud. The local file is unchanged.\n\n${detail}`)
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

  // ── Restore last location on reload / cold start (local mode) ──────────
  // Reopen whatever the user was on before the reload instead of dumping
  // them at the library home. Local mode only, and only when no explicit
  // URL deep-link is present (those win — they're how cloud / shared files
  // are addressed). The active tab isn't restored here: it's saved inside
  // the project file on disk, so it returns when the project reopens.
  const lastLocationRestoredRef = useRef(false)
  useEffect(() => {
    if (lastLocationRestoredRef.current) return
    if (!isWorkspaceHydrated || !isLocalMode) return

    // A URL deep-link (cloud / shared) takes precedence — the effect above
    // already handled it; don't override with the stored local location.
    if (currentPathname === "/app" && requestedProjectId) {
      lastLocationRestoredRef.current = true
      return
    }

    const saved = readLastEditorLocation()
    // Nothing to restore — settle and let the projects[0] fallback stand.
    if (!saved?.projectId) {
      lastLocationRestoredRef.current = true
      return
    }

    // The saved project may not have streamed in from disk yet (local files
    // load incrementally). Do NOT consume the one-shot until it's actually
    // present — otherwise we'd give up before the right project arrives and
    // get stuck on whatever loaded first. Retry on the next projects change.
    const target = projects.find((p) => p.id === saved.projectId)
    if (!target) return

    lastLocationRestoredRef.current = true
    setActiveProjectId(saved.projectId)
    if (saved.view === "editor") setView("editor")
  }, [isWorkspaceHydrated, isLocalMode, projects, currentPathname, requestedProjectId])

  // Persist the current location so the effect above can restore it.
  //
  // Crucially, do NOT write until restore has run (lastLocationRestoredRef).
  // Local files stream in incrementally, and the `projects[0]` fallback above
  // sets activeProjectId to the first-loaded project before the saved one has
  // arrived — if we persisted that, we'd overwrite the saved location with
  // the wrong project and restore would have nothing correct to read.
  useEffect(() => {
    if (!isLocalMode || !isWorkspaceHydrated) return
    if (!lastLocationRestoredRef.current) return
    if (!activeProjectId && view === "projects") return
    writeLastEditorLocation({ view, projectId: activeProjectId })
  }, [isLocalMode, isWorkspaceHydrated, view, activeProjectId])

  // ── OS file-open handler (Finder double-click on .tusk/.tusks) ─────────
  // electron/main.ts buffers paths from `open-file` / `second-instance` /
  // cold-start argv until the renderer subscribes via onOpenPath.
  //
  // Routing rule (per product spec):
  //   • File INSIDE the current window's workspace root → open it in THIS
  //     window (it already belongs here; the project list contains it).
  //   • File OUTSIDE the workspace → open a NEW window scoped to the file's
  //     own folder (?rootOverride=<dir>&openFile=<path>), leaving the
  //     current window untouched. Reuses the same window.open path as
  //     "Open folder in new window".
  //
  // Local mode only — in cloud mode there's no backing autosave.
  const openLocalFilePath = useCallback(async (filePath: string) => {
    if (!localFsHandle) return
    const fsPath = window.electronAPI?.path
    const root = localRoot.root
    const inside = root && fsPath
      ? isPathInsideRoot(filePath, root, fsPath.sep)
      : true // no root yet → just open in place rather than spawning a window

    if (!inside && fsPath) {
      // Outside the workspace → dedicated window rooted at the file's folder.
      const folder = fsPath.dirname(filePath)
      window.open(buildRootOverrideUrl(folder, filePath), "_blank")
      return
    }

    try {
      const projectId = await localFsHandle.openExternalFile(filePath)
      if (!projectId) return
      setActiveProjectId(projectId)
      setView("editor")
    } catch (err) {
      console.error("[orchestration] openExternalFile failed for", filePath, err)
    }
  }, [localFsHandle, localRoot.root])

  useEffect(() => {
    if (!isElectron) return
    if (!isLocalMode) return
    if (!localFsHandle) return
    const subscribe = window.electronAPI?.onOpenPath
    if (!subscribe) return
    const unsubscribe = subscribe((filePath: string) => { void openLocalFilePath(filePath) })
    // Tell main we're ready to receive paths NOW (listener attached + local
    // workspace resolved). Main buffers cold-start file opens until this
    // fires — flushing earlier dropped the file (readiness race).
    window.electronAPI?.notifyOpenPathReady?.()
    return unsubscribe
  }, [isElectron, isLocalMode, localFsHandle, openLocalFilePath])

  // When THIS window was spawned to open a specific out-of-workspace file
  // (?openFile=), load it once the workspace is ready. The rootOverride
  // boot path already scoped the workspace to the file's folder, so the
  // file is inside-root here and opens in place.
  const openedBootFileRef = useRef(false)
  useEffect(() => {
    if (!isElectron || !isLocalMode || !localFsHandle) return
    if (openedBootFileRef.current) return
    const bootFile = readOpenFileFromLocation()
    if (!bootFile) { openedBootFileRef.current = true; return }
    openedBootFileRef.current = true
    void openLocalFilePath(bootFile)
  }, [isElectron, isLocalMode, localFsHandle, openLocalFilePath])

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
        openVersionPreviewWindow(version, msg.projectId, "")
        return
      }

      if (msg.action === "export") {
        // version.snapshot is the JSON-stringified project at save time.
        // Parse it before handing to the PDF exporter (which expects a
        // Project object). A corrupt snapshot silently skips the export.
        const snapshotProject = parseVersionSnapshot(version.snapshot)
        if (snapshotProject) {
          exportProjectAsPdf(snapshotProject)
        }
        return
      }

      if (msg.action === "delete") {
        const idsSet = new Set([msg.versionId])
        setProjects((cur) =>
          cur.map((p) => (p.id === msg.projectId ? removeProjectVersions(p, idsSet) : p)),
        )
      }
    }

    window.addEventListener("message", onVersionAction)
    return () => { window.removeEventListener("message", onVersionAction) }
  }, [versioning.projectVersionsByProjectId])

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
    // The standalone version-preview window must NOT rebuild the global
    // application menu. The macOS menu is process-global, but each window
    // keeps its own command map; if the preview window rebuilds the menu
    // with its (different) item set, the native menu's command ids stop
    // matching the main window's command map — silently killing the main
    // window's Edit-menu shortcuts like Cmd+A. The preview window has its
    // own find modal and doesn't need the app menu.
    if (currentPathname === "/version-preview") return

    const { nativeItems, commandMap } = serializeMenuForElectron(menuBarProps.items)
    nativeMenuCommandMapRef.current = commandMap
    window.electronAPI?.updateMenu(nativeItems)
  }, [isElectronMac, menuBarProps.items, currentPathname])

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
    onOpenProject: (projectId: string) => {
      // Safety net: Unknown-kind projects (unsupported file extensions
      // surfaced in the library) have no editor — refuse to navigate to
      // them. The Library/Browser UIs already gate clicks, but a stray
      // keyboard shortcut or programmatic caller could still slip
      // through, and mounting the editor on an empty tabs[] would render
      // a blank DraftingEditor.
      const target = projects.find((p) => p.id === projectId)
      if (target?.kind === "Unknown") return
      setActiveProjectId(projectId)
      setView("editor")
    },
    onCreateProject: (kind: import("../utils/projects").ProjectKind) => {
      const nextName = generateUntitledName(projects, kind)
      const nextProject = createProject(nextName, kind)
      // Nest into the folder currently open in the Library so creating from the
      // sidebar/nav respects where the user is — the Library persists its open
      // folder to localStorage. Guard against a stale id (deleted folder).
      const openFolderId = readLastLibraryLocation()?.folderId ?? null
      const targetFolderId = openFolderId && folders.some((f) => f.id === openFolderId) ? openFolderId : null
      setProjects((cur) => [{ ...nextProject, folderId: targetFolderId, rootPosition: targetFolderId ? nextProject.rootPosition : "top" }, ...cur])
      setActiveProjectId(nextProject.id)
      // The baseline "Manual I" snapshot is created by the versioning hook's
      // sweep effect as soon as it observes a version-supporting project
      // with an empty versions[] (see useProjectVersioning.ts). Nothing to
      // do here.
    },
    onCreateFolder: () => {
      const nextIndex = folders.length + 1
      // Same nesting rule as onCreateProject: a new folder goes inside the
      // folder the user is currently viewing in the Library, else the root.
      const openFolderId = readLastLibraryLocation()?.folderId ?? null
      const parentFolderId = openFolderId && folders.some((f) => f.id === openFolderId) ? openFolderId : null
      setFolders((current) => [{ id: createLocalId(), name: `Folder ${nextIndex}`, description: "Add a folder description here. You don't have the memory of an elephant.", parentFolderId }, ...current])
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
    onProjectCreated: (_project: Project) => {
      // Same as onCreateProject: the baseline manual "I" comes from the
      // versioning sweep effect; no work to do at the call site.
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
    // Spawn a new BrowserWindow whose workspace root is this folder's
    // on-disk directory. We hand the absolute path through a
    // `?rootOverride=` query param; useLocalRoot reads it at boot. Only
    // available when there's a local FS handle (i.e. Electron + local
    // mode) — cloud-only folders have no on-disk directory to bind to.
    //
    // The optional-chained `getFolderPath?.()` guards against a stale
    // handleRef during HMR: `useRef(initialValue)` only honours the
    // initial value on first mount, so if this method was added after
    // the dev session started, the live ref might predate it. A no-op
    // is better than a crash; a full restart picks up the new shape.
    onOpenFolderInNewWindow: localFsHandle ? (folderId: string) => {
      const folderPath = localFsHandle.getFolderPath?.(folderId) ?? null
      if (!folderPath) return
      window.open(buildRootOverrideUrl(folderPath), "_blank")
    } : undefined,
    // Paint the macOS Finder color label so a folder edited in-app picks
    // up the same accent in Finder. Snaps the user's arbitrary hex to
    // one of Finder's seven preset label colors (helper handles the
    // mapping). Silently no-ops off macOS / without a local FS handle /
    // when Apple Events are denied — the in-app color still applies.
    onApplyFolderFinderColor: localFsHandle ? (folderId: string, color: string | null | undefined) => {
      const folderPath = localFsHandle.getFolderPath?.(folderId) ?? null
      if (!folderPath) return
      void setMacFolderColor(folderPath, color)
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
      // Opens the in-app VersionHistory modal — rendered top-level in
      // App.tsx — instead of a detached blob popup. Theme + fonts flow in
      // through the same CSS variables the rest of the app uses, and
      // updates in Settings take effect immediately.
      setVersionHistoryProjectId(projectId)
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
      // Same in-app modal as the library entry point — just opened from
      // the project settings panel rather than from the library context
      // menu.
      if (!activeProject) return
      setVersionHistoryProjectId(activeProject.id)
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

  // ── Version history modal props ──────────────────────────────────────
  //
  // Built last so it can close over the rest of the state. Every action
  // routes back into the same handlers that already power the menu /
  // popup actions:
  //   • Restore   → versioning.restoreVersionIntoProject
  //   • Duplicate → versioning.duplicateVersionIntoLibrary
  //   • Export    → exportProjectAsPdf(parseVersionSnapshot(snapshot))
  //   • Open new  → openVersionPreviewWindow (opens the in-app
  //                 /version-preview route in its own window; the full
  //                 history is in-app, only the per-version detail page
  //                 lives as a separate window)
  //   • Delete    → removeProjectVersions(project, ids) via setProjects
  const versionHistoryProject = versionHistoryProjectId
    ? projects.find((p) => p.id === versionHistoryProjectId) ?? null
    : null
  const versionHistoryProps = {
    isOpen: versionHistoryProjectId !== null && versionHistoryProject !== null,
    onClose: () => setVersionHistoryProjectId(null),
    projectName: versionHistoryProject?.name ?? "Project",
    versions: versionHistoryProject?.versions ?? [],
    onRestore: (versionId: string) => {
      if (!versionHistoryProjectId) return
      const ok = versioning.restoreVersionIntoProject(versionHistoryProjectId, versionId)
      if (ok) setVersionHistoryProjectId(null)
    },
    onDuplicate: (versionId: string) => {
      if (!versionHistoryProjectId) return
      const ok = versioning.duplicateVersionIntoLibrary(versionHistoryProjectId, versionId)
      if (ok) setVersionHistoryProjectId(null)
    },
    onExportPdf: (versionId: string) => {
      if (!versionHistoryProject) return
      const target = versionHistoryProject.versions?.find((v) => v.id === versionId)
      if (!target) return
      const snapshot = parseVersionSnapshot(target.snapshot)
      if (snapshot) exportProjectAsPdf(snapshot)
    },
    onOpenInNewWindow: (versionId: string) => {
      if (!versionHistoryProject) return
      const target = versionHistoryProject.versions?.find((v) => v.id === versionId)
      if (!target) return
      openVersionPreviewWindow(target, versionHistoryProject.id, versionHistoryProject.name)
    },
    onDelete: (versionIds: string[]) => {
      if (!versionHistoryProjectId || versionIds.length === 0) return
      const idsSet = new Set(versionIds)
      setProjects((current) =>
        current.map((project) =>
          project.id === versionHistoryProjectId
            ? removeProjectVersions(project, idsSet)
            : project,
        ),
      )
    },
  }

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
    versionHistoryProps,
  }
}
