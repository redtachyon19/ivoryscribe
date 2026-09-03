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
import { createProject, createId, generateUntitledName, isReadOnlyKind, normalizeProjectAfterTabs, DEFAULT_DOCUMENT_CONTENT, getProjectMarkdownIds, removeProjectVersions, type Project } from "../utils/projects"
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
import { uploadProjectAsCloudDocument } from "../localFiles/cloudOverlay"
import { useCloudPreferenceSync } from "./useCloudPreferenceSync"
import { useNativeTextEntryCommandBus } from "./useNativeTextEntryCommandBus"
import { getStoredBoolean, writeStoredPreferences } from "../state/preferencesStorage"

import { useTuskBilling } from "./useTuskBilling"
import { getPendingShareRequests, respondToShareRequest, type PendingShareRequest } from "@shared/api"
import type { ProjectFolder } from "../../webapp/pages/Library"

export function useAppOrchestration() {
  useNativeTextEntryCommandBus()

  const [projects, setProjects] = useState<Project[]>([])
  const [folders, setFolders] = useState<ProjectFolder[]>([])
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [view, setView] = useState<"projects" | "editor">("projects")
  const [bookCounter, setBookCounter] = useState(1)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
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
  const [versionHistoryProjectId, setVersionHistoryProjectId] = useState<string | null>(null)
  const viewRef = useRef<"projects" | "editor">("projects")
  const activeProjectRef = useRef<Project | null>(null)
  const projectDocumentMapRef = useRef<Record<string, string>>({})

  const billingResetRef = useRef<() => void>(() => {})
  const isLocalModeRef = useRef(false)

  const { currentPathname, requestedProjectId, requestedTabId, checkoutResult, passwordResetToken, navigateTo, navigateReplace } = useRouting()
  const style = useAppStyle()

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
      if (!isLocalModeRef.current) {
        setIsWorkspaceHydrated(false)
        setProjects([])
        setFolders([])
        setActiveProjectId(null)
      } else {
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

  billingResetRef.current = billing.reset

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
    actionSession: session,
    mutators: workspaceMutators,
    isWorkspaceHydrated, projectDocumentMap,
    projects, activeProjectId, palette: style.palette,
    customPaletteBackground: style.customPaletteBackground, customPaletteAccent: style.customPaletteAccent,
    displayFont: style.displayFont, bodyFont: style.bodyFont, uiFont: style.uiFont,
    fontSize: style.fontSize, isWordCountEnabled: style.isWordCountEnabled,
    folders, isMenuBarEnabled, isFlagsEnabled, isTranslucentNavPanel, view, bookCounter,
  })

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
    projects,
    folders,
  })

  const cloudInLocal = useCloudProjectsInLocalMode({
    session: isLocalMode ? session : null,
    isLocalMode,
    projects,
    setProjects,
    setProjectDocumentMap,
  })

  useEffect(() => {
    for (const [projectId, shareId] of cloudInLocal.shareIdByProjectId) {
      shareIdByProjectIdRef.current.set(projectId, shareId)
    }
  }, [cloudInLocal.shareIdByProjectId, shareIdByProjectIdRef])

  useDualStateMigration({
    isLocalMode,
    isWorkspaceHydrated,
    projects,
    projectDocumentMap,
    localFsHandle: localFsHandle ?? null,
    setProjects,
  })

  const [isAuthOverlayOpen, setIsAuthOverlayOpen] = useState(false)
  const pendingShareProjectIdRef = useRef<string | null>(null)

  const moveLocalProjectToCloud = async (projectId: string): Promise<string | null> => {
    if (!session) {
      pendingShareProjectIdRef.current = projectId
      setIsAuthOverlayOpen(true)
      return null
    }
    if (!isLocalMode || !localFsHandle) {
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

    const project = projects.find((p) => p.id === projectId)
    if (!project) {
      console.warn("[moveToCloud] project not in state", projectId)
      window.alert("Couldn't find this project — nothing to upload.")
      return null
    }
    if (isReadOnlyKind(project.kind)) {
      window.alert(`${project.kind} files can't be moved to the cloud — they stay on disk.`)
      return null
    }

    let cloudId: string
    try {
      cloudId = await uploadProjectAsCloudDocument(session.token, project)
    } catch (err) {
      console.error("[moveToCloud] upload failed; local file left intact:", err)
      const detail = err instanceof Error ? err.message : String(err)
      window.alert(`Failed to upload to cloud. The local file is unchanged.\n\n${detail}`)
      return null
    }

    cloudInLocal.registerCloudProject(projectId, cloudId, project)
    setProjectDocumentMap((cur) => ({ ...cur, [projectId]: cloudId }))
    setProjects((cur) => cur.map((p) => p.id === projectId ? { ...p, source: "cloud" } : p))
    try {
      await localFsHandle.promoteLocalProjectToCloud(projectId)
    } catch (err) {
      console.error("[moveToCloud] trash step failed:", err)
    }
    return cloudId
  }

  const enableCloudSharing = async (projectId: string): Promise<string | null> => {
    const existing = projectDocumentMap[projectId]
    if (existing) return existing
    return moveLocalProjectToCloud(projectId)
  }

  useEffect(() => { viewRef.current = view }, [view])
  useEffect(() => { projectDocumentMapRef.current = projectDocumentMap }, [projectDocumentMap])

  useEffect(() => {
    if (session && isAuthOverlayOpen) {
      setIsAuthOverlayOpen(false)
    }
  }, [session, isAuthOverlayOpen])

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

  // Set once the ?projectId= handoff has been resolved one way or another. The URL
  // sync effect below waits on this so it can't clear the params in the same commit
  // that this effect is restoring from them.
  const urlRestoreSettledRef = useRef(false)

  useEffect(() => {
    if (!isWorkspaceHydrated || currentPathname !== "/app") return
    if (!requestedProjectId) { urlRestoreSettledRef.current = true; return }
    if (!projects.some((p) => p.id === requestedProjectId)) {
      // Projects are loaded but nothing matches — deleted, or someone else's link.
      // Settle anyway so the sync effect isn't held hostage by a dead id.
      if (projects.length > 0) urlRestoreSettledRef.current = true
      return
    }
    setActiveProjectId(requestedProjectId)
    setView("editor")
    if (requestedTabId) {
      setProjects((cur) => {
        // Returning `cur` untouched matters: cur.map() would hand back a fresh array
        // on every run, and `projects` is a dependency here, so an unconditional map
        // re-triggers this effect forever once the URL actually carries a tabId.
        const target = cur.find((p) => p.id === requestedProjectId)
        if (!target || target.activeId === requestedTabId) return cur
        const tabIds = target.tabs.flatMap(function collect(t): string[] { return [t.id, ...t.children.flatMap(collect)] })
        if (!tabIds.includes(requestedTabId)) return cur
        return cur.map((p) => p.id === requestedProjectId ? { ...p, activeId: requestedTabId } : p)
      })
    }
    urlRestoreSettledRef.current = true
  }, [currentPathname, isWorkspaceHydrated, projects, requestedProjectId, requestedTabId])

  // The write half of the URL round-trip. useRouting has always parsed ?projectId=
  // and ?tabId= off /app, and the effect above has always consumed them — but
  // nothing ever produced them (every navigate call is a bare "/app"), so reload
  // dumped you in the library with the open document forgotten. Mirroring the
  // selection into the URL fixes reload in the browser and in Electron alike,
  // rather than only under isLocalMode the way the localStorage path does.
  //
  // Derived as a plain string so this doesn't re-run off the `projects` array on
  // every keystroke.
  const activeTabId = activeProject?.activeId ?? ""
  useEffect(() => {
    if (!isWorkspaceHydrated || currentPathname !== "/app") return
    if (!urlRestoreSettledRef.current) return

    const url = new URL(window.location.href)
    if (view === "editor" && activeProjectId) {
      url.searchParams.set("projectId", activeProjectId)
      if (activeTabId) url.searchParams.set("tabId", activeTabId)
      else url.searchParams.delete("tabId")
    } else {
      // Back in the library — drop them, otherwise reloading from the library
      // bounces you into whichever document you last had open.
      url.searchParams.delete("projectId")
      url.searchParams.delete("tabId")
    }

    // Editing the existing URL rather than rebuilding it keeps params we don't own,
    // notably the checkout/session_id pair useTuskBilling reads on return.
    const next = `${url.pathname}${url.search}`
    if (next === `${window.location.pathname}${window.location.search}`) return
    // Replace, not push: switching tabs shouldn't stack up history entries.
    navigateReplace(next)
  }, [isWorkspaceHydrated, currentPathname, view, activeProjectId, activeTabId, navigateReplace])

  // Deliberately NOT gated on isLocalMode. Electron loads the dev-server root or
  // file://…/index.html, never "/app", so the ?projectId= path above is inert in the
  // desktop app — this is the only restore it ever gets. Gating on isLocalMode
  // (Electron *with a local folder open*) meant cloud mode persisted nothing at all.
  const lastLocationRestoredRef = useRef(false)
  useEffect(() => {
    if (lastLocationRestoredRef.current) return
    if (!isWorkspaceHydrated) return

    // On the web the URL wins when it carries a target; don't fight it.
    if (currentPathname === "/app" && requestedProjectId) {
      lastLocationRestoredRef.current = true
      return
    }

    const saved = readLastEditorLocation()
    if (!saved?.projectId) {
      lastLocationRestoredRef.current = true
      return
    }

    const target = projects.find((p) => p.id === saved.projectId)
    if (!target) {
      // The saved id no longer resolves — project deleted, or a cloud project that
      // isn't present in this mode. Settle anyway once projects have actually
      // loaded: leaving the ref false permanently blocks the write effect below,
      // so one dead id freezes persistence forever and the stale entry can never
      // be overwritten. That deadlock is why this silently stopped working.
      if (projects.length > 0) lastLocationRestoredRef.current = true
      return
    }

    lastLocationRestoredRef.current = true
    setActiveProjectId(saved.projectId)
    if (saved.view === "editor") setView("editor")

    if (saved.tabId) {
      setProjects((cur) => {
        const project = cur.find((p) => p.id === saved.projectId)
        if (!project || project.activeId === saved.tabId) return cur
        const tabIds = project.tabs.flatMap(function collect(t): string[] { return [t.id, ...t.children.flatMap(collect)] })
        if (!tabIds.includes(saved.tabId!)) return cur
        return cur.map((p) => p.id === saved.projectId ? { ...p, activeId: saved.tabId! } : p)
      })
    }
  }, [isWorkspaceHydrated, projects, currentPathname, requestedProjectId])

  useEffect(() => {
    if (!isWorkspaceHydrated) return
    if (!lastLocationRestoredRef.current) return
    if (!activeProjectId && view === "projects") return
    writeLastEditorLocation({ view, projectId: activeProjectId, tabId: activeTabId || null })
  }, [isWorkspaceHydrated, view, activeProjectId, activeTabId])

  const openLocalFilePath = useCallback(async (filePath: string) => {
    if (!localFsHandle) return
    const fsPath = window.electronAPI?.path
    const root = localRoot.root
    const inside = root && fsPath
      ? isPathInsideRoot(filePath, root, fsPath.sep)
      : true

    if (!inside && fsPath) {
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
    window.electronAPI?.notifyOpenPathReady?.()
    return unsubscribe
  }, [isElectron, isLocalMode, localFsHandle, openLocalFilePath])

  const openedBootFileRef = useRef(false)
  useEffect(() => {
    if (!isElectron || !isLocalMode || !localFsHandle) return
    if (openedBootFileRef.current) return
    const bootFile = readOpenFileFromLocation()
    if (!bootFile) { openedBootFileRef.current = true; return }
    openedBootFileRef.current = true
    void openLocalFilePath(bootFile)
  }, [isElectron, isLocalMode, localFsHandle, openLocalFilePath])

  const handleAcceptShareRequest = async (shareId: string) => {
    if (!session) return
    try {
      const result = await respondToShareRequest(session.token, shareId, "accept")
      setPendingShareRequests((cur) => cur.filter((r) => r.id !== shareId))

      if (result.document) {
        const parsed = JSON.parse(result.document.content)
        if (parsed && typeof parsed === "object" && parsed.id) {
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
    }
  }

  const handleRejectShareRequest = async (shareId: string) => {
    if (!session) return
    try {
      await respondToShareRequest(session.token, shareId, "reject")
      setPendingShareRequests((cur) => cur.filter((r) => r.id !== shareId))
    } catch {
    }
  }

  const refreshPendingShareRequests = async () => {
    if (!session) return
    try {
      const requests = await getPendingShareRequests(session.token)
      setPendingShareRequests(requests)
    } catch {
    }
  }

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

  const updateActiveProject = (updater: (project: Project) => Project) => {
    const id = activeProjectId ?? activeProject?.id
    if (!id) return
    setProjects((cur) => cur.map((p) => (p.id !== id ? p : updater(p))))
  }

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

  const isElectronMac = Boolean(window.electronAPI) && window.electronAPI?.platform === "darwin"
  const nativeMenuCommandMapRef = useRef<Record<string, () => void>>({})

  useEffect(() => {
    if (!isElectronMac) return
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

  const editorProps = (session || isElectron) ? {
    sessionToken: session?.token ?? "",
    project: activeProject,
    tuskAiActivated: billing.tuskAiBilling.tuskAiActivated,
    isStartingTuskCheckout: billing.isStartingTuskCheckout,
    activeContent,
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
      const target = projects.find((p) => p.id === projectId)
      if (target?.kind === "Unknown") return
      setActiveProjectId(projectId)
      setView("editor")
    },
    onCreateProject: (kind: import("../utils/projects").ProjectKind) => {
      const nextName = generateUntitledName(projects, kind)
      const nextProject = createProject(nextName, kind)
      const openFolderId = readLastLibraryLocation()?.folderId ?? null
      const targetFolderId = openFolderId && folders.some((f) => f.id === openFolderId) ? openFolderId : null
      setProjects((cur) => [{ ...nextProject, folderId: targetFolderId, rootPosition: targetFolderId ? nextProject.rootPosition : "top" }, ...cur])
      setActiveProjectId(nextProject.id)
    },
    onCreateFolder: () => {
      const nextIndex = folders.length + 1
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
    view,
    activeProjectId,
    setActiveProjectId,
    bookCounter,
    setBookCounter,
    onProjectCreated: (_project: Project) => {
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
    onOpenFolderInNewWindow: localFsHandle ? (folderId: string) => {
      const folderPath = localFsHandle.getFolderPath?.(folderId) ?? null
      if (!folderPath) return
      window.open(buildRootOverrideUrl(folderPath), "_blank")
    } : undefined,
    onApplyFolderFinderColor: localFsHandle ? (folderId: string, color: string | null | undefined) => {
      const folderPath = localFsHandle.getFolderPath?.(folderId) ?? null
      if (!folderPath) return
      void setMacFolderColor(folderPath, color)
    } : undefined,
    userEmail: session?.user.email ?? "",
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
      setVersionHistoryProjectId(projectId)
    },
  } : null

  const settingsProps = (session || isElectron) ? {
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
      setVersionHistoryProjectId(activeProject.id)
    },
    onExportProject: (format: "pdf" | "docx" | "md" | "txt") => {
      if (!activeProject) return
      requestExportProject(format)
    },
    sessionToken: session?.token ?? "",
    documentId: activeProject ? projectDocumentMap[activeProject.id] : undefined,
    localWorkspaceRoot: isElectron ? localRoot.root : undefined,
    onChangeLocalWorkspace: isElectron ? localRoot.choose : undefined,
    autoCreateDefaultRoot: localRoot.autoCreateDefaultRoot,
    onAutoCreateDefaultRootChange: isElectron ? localRoot.setAutoCreateDefaultRoot : undefined,
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
    currentPathname,
    isLocalRootReady: localRoot.isReady,
    session,
    isAuthBootstrapping,
    isAuthOverlayOpen,
    closeAuthOverlay: () => setIsAuthOverlayOpen(false),
    style: { palette: style.palette, appStyleVariables: style.appStyleVariables },
    view,
    activeProject,
    isTranslucentNavPanel,
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
