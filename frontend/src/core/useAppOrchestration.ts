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
} from "./appearance"
import { requestAppColorPaletteChange } from "./editorEvents"
import { getAppMenu, projectWorkspaceMenu } from "./menu"
import { downloadProjectAsMarkdown } from "./markdown"
import { exportProjectAsPdf } from "./pdfExport"
import { createProject, DEFAULT_DOCUMENT_CONTENT, type Project, type ProjectKind } from "./projects"
import { buildVersionHistoryPageHtml, buildVersionPreviewHtml, getInitialManualVersionDefinition, mapVersionsForSettings, resolveThemeForPalette, serializeProjectSnapshot, type VersionSettingsEntry } from "./versioning"
import { useSession } from "./useSession"
import { useRouting } from "./useRouting"
import { useAppStyle } from "./useAppStyle"
import { useProjectVersioning } from "./useProjectVersioning"
import { useWorkspaceHydration } from "./useWorkspaceHydration"

import { useTuskBilling } from "./useTuskBilling"
import { createLocalId } from "./libraryUtils"
import type { ProjectFolder } from "../webapp/pages/Library"

export function useAppOrchestration() {
  // ── local state ──────────────────────────────────────────────
  const [projects, setProjects] = useState<Project[]>([])
  const [folders, setFolders] = useState<ProjectFolder[]>([])
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [view, setView] = useState<"projects" | "editor">("projects")
  const [bookCounter, setBookCounter] = useState(1)
  const [blogCounter, setBlogCounter] = useState(1)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isMenuBarEnabled, setIsMenuBarEnabled] = useState(false)
  const [isFlagsEnabled, setIsFlagsEnabled] = useState(false)
  const [isEditorTyping, setIsEditorTyping] = useState(false)
  const [isWorkspaceHydrated, setIsWorkspaceHydrated] = useState(false)
  const [projectDocumentMap, setProjectDocumentMap] = useState<Record<string, string>>({})
  const viewRef = useRef<"projects" | "editor">("projects")
  const activeProjectRef = useRef<Project | null>(null)
  const projectDocumentMapRef = useRef<Record<string, string>>({})

  // refs for cross-hook callbacks (set after hooks are created)
  const billingResetRef = useRef<() => void>(() => {})
  const versioningResetRef = useRef<(v: Record<string, never>) => void>(() => {})

  // ── composed hooks ───────────────────────────────────────────
  const { currentPathname, requestedProjectId, checkoutResult, passwordResetToken, navigateTo, navigateReplace } = useRouting()
  const style = useAppStyle()

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
      setIsWorkspaceHydrated(false)
      setProjects([])
      versioningResetRef.current({})
      setFolders([])
      setProjectDocumentMap({})
      billingResetRef.current()
      setActiveProjectId(null)
      setView("projects")
    },
  })

  const versioning = useProjectVersioning({
    sessionRef, session, projects, setProjects,
    projectDocumentMapRef, setProjectDocumentMap,
    setActiveProjectId, setView, isWorkspaceHydrated,
    activeProjectRef, viewRef,
  })

  const billing = useTuskBilling({
    session, isWorkspaceHydrated, currentPathname, checkoutResult, navigateReplace,
  })

  // keep refs in sync for logout callback
  billingResetRef.current = billing.reset
  versioningResetRef.current = versioning.setProjectVersionsByProjectId as (v: Record<string, never>) => void

  useWorkspaceHydration({
    session, setSession, setIsAuthBootstrapping, setAuthLoadError,
    isWorkspaceHydrated, setIsWorkspaceHydrated, projectDocumentMap, setProjectDocumentMap,
    setProjects, setProjectVersionsByProjectId: versioning.setProjectVersionsByProjectId,
    setFolders, setActiveProjectId, setView, setIsMenuBarEnabled, setIsFlagsEnabled,
    setPalette: style.setPalette, setCustomPaletteBackground: style.setCustomPaletteBackground,
    setCustomPaletteAccent: style.setCustomPaletteAccent,
    setDisplayFont: style.setDisplayFont, setBodyFont: style.setBodyFont,
    setUiFont: style.setUiFont, setFontSize: style.setFontSize,
    setIsWordCountEnabled: style.setIsWordCountEnabled,
    setBookCounter, setBlogCounter, setTuskAiBilling: billing.setTuskAiBilling,
    projects, activeProjectId, palette: style.palette,
    customPaletteBackground: style.customPaletteBackground, customPaletteAccent: style.customPaletteAccent,
    displayFont: style.displayFont, bodyFont: style.bodyFont, uiFont: style.uiFont,
    fontSize: style.fontSize, isWordCountEnabled: style.isWordCountEnabled,
    folders, isMenuBarEnabled, isFlagsEnabled, view, bookCounter, blogCounter,
  })

  // ── ref syncs ────────────────────────────────────────────────
  useEffect(() => { viewRef.current = view }, [view])
  useEffect(() => { projectDocumentMapRef.current = projectDocumentMap }, [projectDocumentMap])

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
  }, [currentPathname, isWorkspaceHydrated, projects, requestedProjectId])

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
        if (version.snapshot.markdownEditorEnabled) {
          void downloadProjectAsMarkdown(version.snapshot)
        } else {
          exportProjectAsPdf(version.snapshot)
        }
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
    items: view === "projects" ? projectWorkspaceMenu : getAppMenu({ markdownEditorEnabled: Boolean(activeProject?.markdownEditorEnabled) }),
  }

  const brandProps = {
    hasMenu: isMenuBarEnabled && (view === "editor" || view === "projects"),
    onNavigateHome: () => navigateTo("/"),
  }

  const editorProps = session ? {
    sessionToken: session.token,
    project: activeProject,
    tuskAiActivated: billing.tuskAiBilling.tuskAiActivated,
    isStartingTuskCheckout: billing.isStartingTuskCheckout,
    activeContent,
    editorFontSize: style.fontSize,
    menuBarEnabled: isMenuBarEnabled,
    flagsEnabled: isFlagsEnabled,
    showWordCount: style.isWordCountEnabled,
    isEditorTyping,
    activeFolderName,
    projects,
    folders,
    setProjects,
    setFolders,
    onOpenProject: (projectId: string) => { setActiveProjectId(projectId); setView("editor") },
    onCreateProject: () => {
      const nextName = `Book ${bookCounter}`
      const nextProject = createProject(nextName, "Book")
      setProjects((cur) => [{ ...nextProject, folderId: null, rootPosition: "top" }, ...cur])
      setActiveProjectId(nextProject.id)
      setBookCounter((c) => c + 1)
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
    blogCounter,
    setBookCounter,
    setBlogCounter,
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
    onShowVersionHistory: (projectId: string) => {
      const versions = versioning.projectVersionsByProjectId[projectId] ?? []
      const proj = projects.find((p) => p.id === projectId)
      const projectName = proj?.name ?? "Project"
      const theme = resolveThemeForPalette(style.palette, { customPaletteBackground: style.customPaletteBackground, customPaletteAccent: style.customPaletteAccent })
      const html = buildVersionHistoryPageHtml({ versions, projectName, projectId, bodyFont: style.bodyFont, uiFont: style.uiFont, displayFont: style.displayFont, ...theme })
      const blobUrl = URL.createObjectURL(new Blob([html], { type: "text/html" }))
      window.open(blobUrl, "_blank")
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 30_000)
    },
  } : null

  const settingsProps = session ? {
    isOpen: isSettingsOpen,
    showProjectPreferences: view === "editor",
    menuBarEnabled: isMenuBarEnabled,
    flagsEnabled: isFlagsEnabled,
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
    accountFirstName: session.user.firstName ?? "",
    accountLastName: session.user.lastName ?? "",
    accountEmail: session.user.email ?? "",
    activeProjectName: activeProject?.name ?? "",
    activeProjectKind: activeProject?.kind ?? "Book",
    activeProjectMarkdownEditorEnabled: Boolean(activeProject?.markdownEditorEnabled),
    activeProjectColor: activeProject?.color ?? "#7ea8ff",
    activeProjectWallpaperEmojis: activeProject?.wallpaperEmojis ?? "",
    activeProjectVersions: activeProjectVersionsForSettings,
    onActiveProjectNameChange: (name: string) => updateActiveProject((p) => ({ ...p, name })),
    onActiveProjectKindChange: (kind: ProjectKind) => updateActiveProject((p) => ({ ...p, kind })),
    onActiveProjectMarkdownEditorEnabledChange: (enabled: boolean) => {
      updateActiveProject((p) => (p.markdownEditorEnabled ? p : { ...p, markdownEditorEnabled: enabled }))
    },
    onActiveProjectColorChange: (color: string) => updateActiveProject((p) => ({ ...p, color })),
    onActiveProjectWallpaperEmojisChange: (emojis: string) => updateActiveProject((p) => ({ ...p, wallpaperEmojis: emojis })),
    onShowVersionHistory: () => {
      if (!activeProject) return
      const versions = versioning.projectVersionsByProjectId[activeProject.id] ?? []
      const theme = resolveThemeForPalette(style.palette, { customPaletteBackground: style.customPaletteBackground, customPaletteAccent: style.customPaletteAccent })
      const html = buildVersionHistoryPageHtml({ versions, projectName: activeProject.name, projectId: activeProject.id, bodyFont: style.bodyFont, uiFont: style.uiFont, displayFont: style.displayFont, ...theme })
      const blobUrl = URL.createObjectURL(new Blob([html], { type: "text/html" }))
      window.open(blobUrl, "_blank")
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 30_000)
    },
    onExportProject: () => {
      if (!activeProject) return
      activeProject.markdownEditorEnabled ? downloadProjectAsMarkdown(activeProject) : exportProjectAsPdf(activeProject)
    },
    onSaveAccountProfile: saveAccountProfile,
    onRequestAccountEmailChange: requestEmailChange,
    onVerifyCurrentAccountEmailChange: verifyCurrentEmailChange,
    onConfirmAccountEmailChange: confirmEmailChange,
    onRequestPasswordReset: requestPasswordReset,
    onRequestAccountDeletion: requestDeletion,
    onConfirmAccountDeletionCode: confirmDeletionCode,
    onSignOut: logout,
  } : null

  return {
    // routing
    currentPathname,
    // auth
    session,
    isAuthBootstrapping,
    // style (for AppShell)
    style: { palette: style.palette, appStyleVariables: style.appStyleVariables },
    // view
    view,
    activeProject,
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
