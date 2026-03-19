import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import "./App.css"
import GlobalSettings from "./webapp/components/GlobalSettings"
import GlobalCaretOverlay from "./webapp/components/GlobalCaretOverlay"
import WebMenu from "./webapp/components/WebMenu"
import { FONT_OPTIONS, PALETTE_OPTIONS, type Palette } from "./core/appearance"
import {
  APP_COLOR_PALETTE_CHANGE_EVENT,
  APP_SAVE_PROJECT_EVENT,
  APP_SAVE_PROJECT_VERSION_EVENT,
  EDITOR_FONT_FAMILY_CHANGE_EVENT,
  EDITOR_FONT_SIZE_CHANGE_EVENT,
  EDITOR_FONT_SIZE_SET_EVENT,
  requestAppColorPaletteChange,
  requestEditorFontFamilyChange,
  requestEditorFontSizeSet,
} from "./core/editorEvents"
import { getAppMenu, projectWorkspaceMenu } from "./core/menu"
import { downloadProjectAsMarkdown } from "./core/markdown"
import { exportProjectAsPdf } from "./core/pdfExport"
import { DEFAULT_DOCUMENT_CONTENT, createId, createProject, normalizeProjectAfterTabs, type Project, type ProjectKind } from "./core/projects"
import {
  type DocumentRecord,
  confirmAccountEmailChange,
  confirmAccountDeletionCode,
  createDocument,
  deleteDocument,
  getDocuments,
  getPreferences,
  requestAccountEmailChange,
  requestPasswordResetLink,
  requestAccountDeletion,
  verifyCurrentEmailForAccountChange,
  updateAccountProfile,
  updateDocument,
  updatePreferences,
} from "./core/api"
import {
  AUTOSAVE_VERSION_INTERVAL_MS,
  PROJECT_RECORD_TYPE,
  buildProjectDocumentPayload,
  buildProjectVersionPayload,
  getInitialManualVersionDefinition,
  getNextManualVersionDefinition,
  parseProjectVersion,
  planAutosaveVersion,
  restoreProjectFromVersion,
  serializeProjectSnapshot,
  sortProjectVersionsDesc,
  type ProjectVersion,
  type ProjectVersionDefinition,
} from "./core/versioning"
import Home from "./landing/pages/Home"
import AuthPage from "./webapp/pages/AuthPage"
import EditorWorkspace from "./webapp/pages/EditorWorkspace"
import PasswordResetPage from "./webapp/pages/PasswordResetPage"
import ProjectLibrary, { type ProjectFolder } from "./webapp/pages/ProjectLibrary"

const MIN_FONT_SIZE = 20
const MAX_FONT_SIZE = 84
const VIEW_FADE_DURATION_MS = 240
const DEFAULT_CUSTOM_BACKGROUND = "#0f0f0f"
const DEFAULT_CUSTOM_ACCENT = "#9ab8ff"
const SESSION_STORAGE_KEY = "ivoryscribe.session"

type UserSession = {
  token: string
  user: {
    id: string
    firstName: string
    lastName: string
    email: string
    isEmailVerified: boolean
  }
}

type VersionActionMessage = {
  type: "ivory:version-action"
  action: "restore" | "duplicate"
  projectId: string
  versionId: string
}

type PreferencesPayload = {
  theme?: {
    palette?: string
    customPaletteBackground?: string
    customPaletteAccent?: string
  }
  editorSettings?: {
    selectedFont?: string
    fontSize?: number
    customFontName?: string
    isCustomFontSelected?: boolean
    isGlobalTextEnabled?: boolean
    isWordCountEnabled?: boolean
  }
  uiSettings?: {
    folders?: ProjectFolder[]
    activeProjectId?: string | null
    menuBarEnabled?: boolean
    flagsEnabled?: boolean
    view?: "projects" | "editor"
    bookCounter?: number
    blogCounter?: number
  }
}

function getSessionFromStorage(): UserSession | null {
  if (typeof window === "undefined") {
    return null
  }

  const raw = window.localStorage.getItem(SESSION_STORAGE_KEY)
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as UserSession
    if (!parsed?.token || !parsed?.user?.id || !parsed?.user?.email) {
      return null
    }

    return parsed
  } catch {
    return null
  }
}

function setSessionInStorage(session: UserSession | null) {
  if (typeof window === "undefined") {
    return
  }

  if (!session) {
    window.localStorage.removeItem(SESSION_STORAGE_KEY)
    return
  }

  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
}

function extractCounterFromNames(projects: Project[], kind: ProjectKind) {
  const prefix = kind === "Book" ? "Book" : "Blog"
  const matcher = new RegExp(`^${prefix}\\s+(\\d+)$`, "i")
  const max = projects.reduce((currentMax, project) => {
    if (project.kind !== kind) {
      return currentMax
    }

    const match = project.name.match(matcher)
    if (!match) {
      return currentMax
    }

    const value = Number.parseInt(match[1], 10)
    return Number.isNaN(value) ? currentMax : Math.max(currentMax, value)
  }, 0)

  return max + 1
}

function isProjectSnapshot(value: unknown): value is Project {
  if (!value || typeof value !== "object") {
    return false
  }

  const candidate = value as Partial<Project>
  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.kind === "string" &&
    Array.isArray(candidate.tabs) &&
    typeof candidate.contentById === "object" &&
    candidate.contentById !== null
  )
}

function parseProjectFromDocument(documentRecord: { title: string; content: string; metadata: Record<string, unknown> }) {
  try {
    const parsedContent = JSON.parse(documentRecord.content)
    if (!isProjectSnapshot(parsedContent)) {
      return null
    }

    return parsedContent
  } catch {
    return null
  }
}

function collectTabTitles(tabs: Project["tabs"]): string[] {
  return tabs.flatMap((tab) => [tab.title, ...collectTabTitles(tab.children)])
}

function findTabTitleById(tabs: Project["tabs"], targetId: string): string | null {
  for (const tab of tabs) {
    if (tab.id === targetId) {
      return tab.title
    }

    const nested = findTabTitleById(tab.children, targetId)
    if (nested) {
      return nested
    }
  }

  return null
}

function buildDuplicateProjectName(baseName: string, existingNames: string[]) {
  const normalizedExistingNames = new Set(existingNames.map((name) => name.trim().toLowerCase()))
  let suffix = 1

  while (true) {
    const candidate = suffix === 1 ? `${baseName} Copy` : `${baseName} Copy ${suffix}`
    if (!normalizedExistingNames.has(candidate.trim().toLowerCase())) {
      return candidate
    }

    suffix += 1
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

function formatVersionTimestamp(value: string) {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return "Unknown save time"
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed)
}

function stripHtmlPreview(value: string) {
  if (!value) {
    return ""
  }

  if (typeof window === "undefined") {
    return value.slice(0, 280)
  }

  const text = new DOMParser().parseFromString(value, "text/html").body.textContent ?? ""
  return text.replace(/\s+/g, " ").trim().slice(0, 280)
}

function hexToRgb(value: string) {
  const normalized = value.trim().replace("#", "")
  if (normalized.length !== 6) {
    return null
  }

  const parsed = Number.parseInt(normalized, 16)
  if (Number.isNaN(parsed)) {
    return null
  }

  return {
    r: (parsed >> 16) & 255,
    g: (parsed >> 8) & 255,
    b: parsed & 255,
  }
}

function mixHexColors(base: string, target: string, ratio: number) {
  const from = hexToRgb(base)
  const to = hexToRgb(target)

  if (!from || !to) {
    return base
  }

  const clampRatio = Math.min(1, Math.max(0, ratio))
  const r = Math.round(from.r + (to.r - from.r) * clampRatio)
  const g = Math.round(from.g + (to.g - from.g) * clampRatio)
  const b = Math.round(from.b + (to.b - from.b) * clampRatio)

  return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`
}

function pickReadableTextColor(background: string) {
  const rgb = hexToRgb(background)
  if (!rgb) {
    return "#f5f5f5"
  }

  const brightness = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000
  return brightness >= 150 ? "#111111" : "#f5f5f5"
}

function clampFontSize(value: number) {
  return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, value))
}

function getSystemPalette(isDarkMode: boolean): Palette {
  return isDarkMode ? "elephant" : "ivory"
}

function getInitialPalette(): Palette {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "ivory"
  }

  return getSystemPalette(window.matchMedia("(prefers-color-scheme: dark)").matches)
}

export default function App() {
  const [session, setSession] = useState<UserSession | null>(() => getSessionFromStorage())
  const [isAuthBootstrapping, setIsAuthBootstrapping] = useState(true)
  const [authLoadError, setAuthLoadError] = useState("")
  const [projectDocumentMap, setProjectDocumentMap] = useState<Record<string, string>>({})
  const [projectVersionsByProjectId, setProjectVersionsByProjectId] = useState<Record<string, ProjectVersion[]>>({})
  const [isWorkspaceHydrated, setIsWorkspaceHydrated] = useState(false)
  // The app has two high-level screens: project library and editor workspace.
  const [view, setView] = useState<"projects" | "editor">("projects")
  // All project data (tabs + content) lives at the App level so child pages stay stateless.
  const [projects, setProjects] = useState<Project[]>([])
  const [folders, setFolders] = useState<ProjectFolder[]>([])
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [bookCounter, setBookCounter] = useState(1)
  const [blogCounter, setBlogCounter] = useState(1)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isMenuBarEnabled, setIsMenuBarEnabled] = useState(false)
  const [isFlagsEnabled, setIsFlagsEnabled] = useState(false)
  const [isEditorTyping, setIsEditorTyping] = useState(false)
  const [selectedFont, setSelectedFont] = useState<string>(FONT_OPTIONS[0]!.value)
  const [customFontName, setCustomFontName] = useState("")
  const [isCustomFontSelected, setIsCustomFontSelected] = useState(false)
  const [isGlobalTextEnabled, setIsGlobalTextEnabled] = useState(false)
  const [isWordCountEnabled, setIsWordCountEnabled] = useState(false)
  const [fontSize, setFontSize] = useState(32)
  const [palette, setPalette] = useState<Palette>(() => getInitialPalette())
  const [customPaletteBackground, setCustomPaletteBackground] = useState(DEFAULT_CUSTOM_BACKGROUND)
  const [customPaletteAccent, setCustomPaletteAccent] = useState(DEFAULT_CUSTOM_ACCENT)
  const [viewFadePhase, setViewFadePhase] = useState<"idle" | "fading-out" | "fading-in">("idle")
  const [currentLocation, setCurrentLocation] = useState(() =>
    typeof window === "undefined" ? "/" : `${window.location.pathname}${window.location.search}`,
  )
  const saveTimeoutRef = useRef<number | null>(null)
  const isSyncingRef = useRef(false)
  const sessionRef = useRef<UserSession | null>(session)
  const viewRef = useRef<"projects" | "editor">("projects")
  const activeProjectRef = useRef<Project | null>(null)
  const projectDocumentMapRef = useRef<Record<string, string>>({})
  const projectVersionsRef = useRef<Record<string, ProjectVersion[]>>({})
  const isVersionSaveInFlightRef = useRef(false)

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    const onPopState = () => {
      setCurrentLocation(`${window.location.pathname}${window.location.search}`)
    }

    window.addEventListener("popstate", onPopState)
    return () => {
      window.removeEventListener("popstate", onPopState)
    }
  }, [])
  const hydrateWorkspace = async (token: string) => {
    const [documentsResult, preferencesResult] = await Promise.allSettled([getDocuments(token), getPreferences(token)])

    if (documentsResult.status === "rejected") {
      throw documentsResult.reason
    }

    if (preferencesResult.status === "rejected") {
      throw preferencesResult.reason
    }

    const documents = documentsResult.value
    const preferences = preferencesResult.value

    const nextProjects: Project[] = []
    const nextDocumentMap: Record<string, string> = {}
    const nextVersionsByProjectId: Record<string, ProjectVersion[]> = {}

    for (const documentRecord of documents) {
      if (documentRecord.metadata?.recordType !== PROJECT_RECORD_TYPE) {
        const versionRecord = parseProjectVersion(documentRecord)
        if (!versionRecord) {
          continue
        }

        const existingVersions = nextVersionsByProjectId[versionRecord.projectId] ?? []
        nextVersionsByProjectId[versionRecord.projectId] = sortProjectVersionsDesc([...existingVersions, versionRecord])
        continue
      }

      const project = parseProjectFromDocument(documentRecord)
      if (!project) {
        continue
      }

      nextProjects.push(project)
      nextDocumentMap[project.id] = documentRecord.id
    }

    const projectList = nextProjects.length ? nextProjects : [createProject("Book 1", "Book")]
    const uiSettings = (preferences.uiSettings ?? {}) as PreferencesPayload["uiSettings"]
    const themeSettings = (preferences.theme ?? {}) as PreferencesPayload["theme"]
    const editorSettings = (preferences.editorSettings ?? {}) as PreferencesPayload["editorSettings"]

    setProjects(projectList)
    setProjectDocumentMap(nextDocumentMap)
    setProjectVersionsByProjectId(nextVersionsByProjectId)
    setFolders(Array.isArray(uiSettings?.folders) ? uiSettings.folders : [])

    const requestedActiveProjectId = uiSettings?.activeProjectId
    const resolvedActiveProjectId =
      typeof requestedActiveProjectId === "string" && projectList.some((project) => project.id === requestedActiveProjectId)
        ? requestedActiveProjectId
        : (projectList[0]?.id ?? null)
    setActiveProjectId(resolvedActiveProjectId)

    // Always land in project library on login/refresh, regardless of previously saved view.
    setView("projects")
    setIsMenuBarEnabled(Boolean(uiSettings?.menuBarEnabled))
    setIsFlagsEnabled(Boolean(uiSettings?.flagsEnabled))

    const loadedPalette =
      typeof themeSettings?.palette === "string" &&
      PALETTE_OPTIONS.some((option) => option.value === themeSettings.palette)
        ? (themeSettings.palette as Palette)
        : getInitialPalette()
    setPalette(loadedPalette)
    setCustomPaletteBackground(themeSettings?.customPaletteBackground ?? DEFAULT_CUSTOM_BACKGROUND)
    setCustomPaletteAccent(themeSettings?.customPaletteAccent ?? DEFAULT_CUSTOM_ACCENT)

    setSelectedFont(editorSettings?.selectedFont ?? FONT_OPTIONS[0]!.value)
    setFontSize(clampFontSize(typeof editorSettings?.fontSize === "number" ? editorSettings.fontSize : 32))
    setCustomFontName(editorSettings?.customFontName ?? "")
    setIsCustomFontSelected(Boolean(editorSettings?.isCustomFontSelected))
    setIsGlobalTextEnabled(Boolean(editorSettings?.isGlobalTextEnabled))
    setIsWordCountEnabled(Boolean(editorSettings?.isWordCountEnabled))

    setBookCounter(typeof uiSettings?.bookCounter === "number" ? uiSettings.bookCounter : extractCounterFromNames(projectList, "Book"))
    setBlogCounter(typeof uiSettings?.blogCounter === "number" ? uiSettings.blogCounter : extractCounterFromNames(projectList, "Blog"))
  }

  useEffect(() => {
    const bootstrapSession = async () => {
      if (!session) {
        setIsAuthBootstrapping(false)
        setIsWorkspaceHydrated(false)
        setAuthLoadError("")
        return
      }

      try {
        await hydrateWorkspace(session.token)
        setIsWorkspaceHydrated(true)
        setAuthLoadError("")
      } catch (error) {
        const message = error instanceof Error ? error.message : "Workspace load failed"

        if (message.includes("[401]") || message.toLowerCase().includes("unauthorized")) {
          setSession(null)
          setSessionInStorage(null)
          setAuthLoadError("Your session expired. Please log in again.")
        } else {
          const fallbackProject = createProject("Book 1", "Book")
          setProjects([fallbackProject])
          setProjectDocumentMap({})
          setProjectVersionsByProjectId({})
          setFolders([])
          setActiveProjectId(fallbackProject.id)
          setView("projects")
          setBookCounter(2)
          setBlogCounter(1)
          setIsWorkspaceHydrated(true)
          setAuthLoadError("")
        }
      } finally {
        setIsAuthBootstrapping(false)
      }
    }

    void bootstrapSession()
  }, [session])

  useEffect(() => {
    sessionRef.current = session
  }, [session])

  useEffect(() => {
    viewRef.current = view
  }, [view])

  useEffect(() => {
    projectDocumentMapRef.current = projectDocumentMap
  }, [projectDocumentMap])

  useEffect(() => {
    projectVersionsRef.current = projectVersionsByProjectId
  }, [projectVersionsByProjectId])

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!session || !isWorkspaceHydrated) {
      return
    }

    if (saveTimeoutRef.current) {
      window.clearTimeout(saveTimeoutRef.current)
    }

    saveTimeoutRef.current = window.setTimeout(() => {
      if (isSyncingRef.current) {
        return
      }

      isSyncingRef.current = true

      const syncWorkspace = async () => {
        try {
          const remoteDocuments = await getDocuments(session.token)
          const remoteProjectDocuments = remoteDocuments.filter(
            (documentRecord) => documentRecord.metadata?.recordType === PROJECT_RECORD_TYPE,
          )

          const remoteByProjectId = new Map<string, string>()
          for (const documentRecord of remoteProjectDocuments) {
            const projectId =
              typeof documentRecord.metadata?.projectId === "string"
                ? documentRecord.metadata.projectId
                : undefined
            if (!projectId) {
              continue
            }
            remoteByProjectId.set(projectId, documentRecord.id)
          }

          const nextDocumentMap: Record<string, string> = {}

          for (const project of projects) {
            const payload = {
              title: project.name,
              content: JSON.stringify(project),
              metadata: {
                recordType: PROJECT_RECORD_TYPE,
                projectId: project.id,
              },
              theme: {
                projectColor: project.color,
              },
            }

            const existingDocumentId = projectDocumentMap[project.id] ?? remoteByProjectId.get(project.id)
            if (existingDocumentId) {
              await updateDocument(session.token, existingDocumentId, payload)
              nextDocumentMap[project.id] = existingDocumentId
              continue
            }

            const created = await createDocument(session.token, payload)
            nextDocumentMap[project.id] = created.id
          }

          const localProjectIds = new Set(projects.map((project) => project.id))
          for (const documentRecord of remoteProjectDocuments) {
            const projectId =
              typeof documentRecord.metadata?.projectId === "string"
                ? documentRecord.metadata.projectId
                : null

            if (!projectId || localProjectIds.has(projectId)) {
              continue
            }

            await deleteDocument(session.token, documentRecord.id)
          }

          setProjectDocumentMap(nextDocumentMap)

          await updatePreferences(session.token, {
            theme: {
              palette,
              customPaletteBackground,
              customPaletteAccent,
            },
            editorSettings: {
              selectedFont,
              fontSize,
              customFontName,
              isCustomFontSelected,
              isGlobalTextEnabled,
              isWordCountEnabled,
            },
            uiSettings: {
              folders,
              activeProjectId,
              menuBarEnabled: isMenuBarEnabled,
              flagsEnabled: isFlagsEnabled,
              view,
              bookCounter,
              blogCounter,
            },
          })
        } catch {
          // Keep the app responsive even if sync fails temporarily.
        } finally {
          isSyncingRef.current = false
        }
      }

      void syncWorkspace()
    }, 700)
  }, [
    activeProjectId,
    blogCounter,
    bookCounter,
    customFontName,
    customPaletteAccent,
    customPaletteBackground,
    folders,
    fontSize,
    isCustomFontSelected,
    isFlagsEnabled,
    isGlobalTextEnabled,
    isWordCountEnabled,
    isMenuBarEnabled,
    isWorkspaceHydrated,
    palette,
    projectDocumentMap,
    projects,
    selectedFont,
    session,
    view,
  ])

  const handleAuthenticated = async (nextSession: UserSession) => {
    setAuthLoadError("")
    setIsSettingsOpen(false)
    setSession(nextSession)
    setSessionInStorage(nextSession)

    if (typeof window !== "undefined") {
      window.history.replaceState({}, "", "/app")
      setCurrentLocation("/app")
    }

    setView("projects")
  }

  const logout = () => {
    setIsSettingsOpen(false)
    setSession(null)
    setSessionInStorage(null)
    setAuthLoadError("")
    setIsWorkspaceHydrated(false)
    setProjects([])
    setProjectVersionsByProjectId({})
    setFolders([])
    setProjectDocumentMap({})
    setActiveProjectId(null)
    setView("projects")
  }

  const upsertProjectVersion = (projectId: string, version: ProjectVersion) => {
    setProjectVersionsByProjectId((current) => {
      const existingVersions = current[projectId] ?? []
      const nextVersions = sortProjectVersionsDesc([
        version,
        ...existingVersions.filter((existingVersion) => existingVersion.id !== version.id),
      ])

      return {
        ...current,
        [projectId]: nextVersions,
      }
    })
  }

  const restoreVersionIntoProject = (projectId: string, versionId: string) => {
    const selectedVersion = (projectVersionsRef.current[projectId] ?? []).find((version) => version.id === versionId)
    if (!selectedVersion) {
      return false
    }

    let restored = false
    setProjects((current) =>
      current.map((project) => {
        if (project.id !== projectId) {
          return project
        }

        restored = true
        return restoreProjectFromVersion(project, selectedVersion.snapshot)
      }),
    )

    if (!restored) {
      return false
    }

    setActiveProjectId(projectId)
    setView("editor")
    return true
  }

  const duplicateVersionIntoLibrary = (projectId: string, versionId: string) => {
    const selectedVersion = (projectVersionsRef.current[projectId] ?? []).find((version) => version.id === versionId)
    if (!selectedVersion) {
      return false
    }

    const duplicatedSnapshot = JSON.parse(JSON.stringify(selectedVersion.snapshot)) as Project
    let duplicatedProjectId: string | null = null

    setProjects((current) => {
      const duplicateName = buildDuplicateProjectName(
        duplicatedSnapshot.name,
        current.map((project) => project.name),
      )
      const duplicatedProjectBase: Project = {
        ...duplicatedSnapshot,
        id: createId(),
        createdAt: new Date().toISOString(),
        name: duplicateName,
        folderId: null,
        rootPosition: "top",
      }
      const duplicatedProject = normalizeProjectAfterTabs(duplicatedProjectBase, duplicatedProjectBase.tabs)
      duplicatedProjectId = duplicatedProject.id
      return [duplicatedProject, ...current]
    })

    if (!duplicatedProjectId) {
      return false
    }

    setActiveProjectId(duplicatedProjectId)
    setView("projects")
    return true
  }

  const persistProjectDocument = async (token: string, project: Project) => {
    const payload = buildProjectDocumentPayload(project)
    const existingDocumentId = projectDocumentMapRef.current[project.id]

    if (existingDocumentId) {
      await updateDocument(token, existingDocumentId, payload)
      return existingDocumentId
    }

    const remoteDocuments = await getDocuments(token)
    const existingRemoteDocument = remoteDocuments.find(
      (documentRecord) =>
        documentRecord.metadata?.recordType === PROJECT_RECORD_TYPE && documentRecord.metadata?.projectId === project.id,
    )

    if (existingRemoteDocument) {
      await updateDocument(token, existingRemoteDocument.id, payload)
      setProjectDocumentMap((current) => ({
        ...current,
        [project.id]: existingRemoteDocument.id,
      }))
      return existingRemoteDocument.id
    }

    const createdDocument = await createDocument(token, payload)
    setProjectDocumentMap((current) => ({
      ...current,
      [project.id]: createdDocument.id,
    }))
    return createdDocument.id
  }

  const createProjectVersionSnapshot = async (
    project: Project,
    definition: ProjectVersionDefinition,
    options?: { alertOnFailure?: boolean },
  ) => {
    const currentSession = sessionRef.current
    if (!currentSession) {
      return null
    }

    if (isVersionSaveInFlightRef.current) {
      return null
    }

    isVersionSaveInFlightRef.current = true

    try {
      await persistProjectDocument(currentSession.token, project)
      const createdDocument = await createDocument(currentSession.token, buildProjectVersionPayload(project, definition))
      const parsedVersion = parseProjectVersion(createdDocument as DocumentRecord)

      if (parsedVersion) {
        upsertProjectVersion(project.id, parsedVersion)
      }

      return parsedVersion
    } catch (error) {
      if (options?.alertOnFailure !== false && typeof window !== "undefined") {
        const message = error instanceof Error ? error.message : "Failed to save version"
        window.alert(message)
      }

      return null
    } finally {
      isVersionSaveInFlightRef.current = false
    }
  }

  const updateSessionUser = (nextUser: {
    id: string
    firstName: string
    lastName: string
    email: string
    isEmailVerified: boolean
  }) => {
    setSession((currentSession) => {
      if (!currentSession) {
        return currentSession
      }

      const nextSession = {
        ...currentSession,
        user: {
          ...currentSession.user,
          ...nextUser,
        },
      }

      setSessionInStorage(nextSession)
      return nextSession
    })
  }

  const handleAccountProfileSave = async (input: { firstName: string; lastName: string }) => {
    if (!session) {
      throw new Error("You need to be logged in to update account settings.")
    }

    const updatedUser = await updateAccountProfile(session.token, input)
    updateSessionUser(updatedUser)
  }

  const handleAccountPasswordResetRequest = async () => {
    if (!session) {
      throw new Error("You need to be logged in to update your password.")
    }

    return requestPasswordResetLink(session.token)
  }

  const handleAccountEmailChangeRequest = async (email: string) => {
    if (!session) {
      throw new Error("You need to be logged in to change your email.")
    }

    return requestAccountEmailChange(session.token, email)
  }

  const handleAccountCurrentEmailChangeVerify = async (code: string) => {
    if (!session) {
      throw new Error("You need to be logged in to verify your current email.")
    }

    return verifyCurrentEmailForAccountChange(session.token, code)
  }

  const handleAccountEmailChangeConfirm = async (code: string) => {
    if (!session) {
      throw new Error("You need to be logged in to confirm your email change.")
    }

    const updatedUser = await confirmAccountEmailChange(session.token, code)
    updateSessionUser(updatedUser)
  }

  const handleAccountDeletionRequest = async () => {
    if (!session) {
      throw new Error("You need to be logged in to delete your account.")
    }

    return requestAccountDeletion(session.token)
  }

  const handleAccountDeletionCodeConfirm = async (input: { userId: string; code: string }) => {
    await confirmAccountDeletionCode(input)
    logout()
  }


  // Resolve the active project ID to a real project object with a fallback.
  const activeProject = useMemo(() => {
    if (!activeProjectId) {
      return projects[0] ?? null
    }

    return projects.find((project) => project.id === activeProjectId) ?? projects[0] ?? null
  }, [projects, activeProjectId])

  const activeContent = useMemo(() => {
    if (!activeProject || !activeProject.activeId) {
      return DEFAULT_DOCUMENT_CONTENT
    }

    return activeProject.contentById[activeProject.activeId] ?? DEFAULT_DOCUMENT_CONTENT
  }, [activeProject])

  const activeProjectVersionsForSettings = useMemo(() => {
    if (!activeProject) {
      return [] as Array<{
        id: string
        label: string
        saveKind: "manual" | "autosave"
        createdAt: string
        changedCharacters: number
        preview: {
          projectName: string
          projectKind: ProjectKind
          entryCount: number
          activeDocumentTitle: string
          activeDocumentPreview: string
        }
      }>
    }

    return (projectVersionsByProjectId[activeProject.id] ?? []).map((version) => {
      const tabTitles = collectTabTitles(version.snapshot.tabs)
      const activeDocumentTitle =
        (version.snapshot.activeId ? findTabTitleById(version.snapshot.tabs, version.snapshot.activeId) : null) ??
        tabTitles[0] ??
        "Untitled Entry"
      const activeDocumentPreview =
        (version.snapshot.activeId ? stripHtmlPreview(version.snapshot.contentById[version.snapshot.activeId] ?? "") : "") ||
        stripHtmlPreview(version.snapshot.contentById[Object.keys(version.snapshot.contentById)[0] ?? ""] ?? "")

      return {
        id: version.id,
        label: version.label,
        saveKind: version.saveKind,
        createdAt: version.createdAt,
        changedCharacters: version.changedCharacters,
        preview: {
          projectName: version.snapshot.name,
          projectKind: version.snapshot.kind,
          entryCount: tabTitles.length,
          activeDocumentTitle,
          activeDocumentPreview,
        },
      }
    })
  }, [activeProject, projectVersionsByProjectId])

  useEffect(() => {
    activeProjectRef.current = activeProject
  }, [activeProject])

  useEffect(() => {
    const handleSaveProject = () => {
      const currentSession = sessionRef.current
      const currentProject = activeProjectRef.current
      if (!currentSession || !currentProject) {
        return
      }

      void persistProjectDocument(currentSession.token, currentProject)
    }

    const handleSaveProjectVersion = async () => {
      const currentProject = activeProjectRef.current
      if (!currentProject) {
        return
      }

      const currentSerializedSnapshot = serializeProjectSnapshot(currentProject)
      let versionsForProject = projectVersionsRef.current[currentProject.id] ?? []
      const hasManualVersion = versionsForProject.some((version) => version.saveKind === "manual")

      if (!hasManualVersion) {
        const initialDefinition = getInitialManualVersionDefinition(versionsForProject, currentSerializedSnapshot)
        const initialVersion = await createProjectVersionSnapshot(currentProject, initialDefinition, { alertOnFailure: false })
        if (initialVersion) {
          versionsForProject = sortProjectVersionsDesc([initialVersion, ...versionsForProject])
        }
      }

      const versionDefinition = getNextManualVersionDefinition(
        versionsForProject,
        currentSerializedSnapshot,
      )

      const savedVersion = await createProjectVersionSnapshot(currentProject, versionDefinition)
      if (savedVersion && typeof window !== "undefined") {
        window.alert(`Saved version ${savedVersion.label}.`)
      }
    }

    window.addEventListener(APP_SAVE_PROJECT_EVENT, handleSaveProject)
    window.addEventListener(APP_SAVE_PROJECT_VERSION_EVENT, handleSaveProjectVersion)

    return () => {
      window.removeEventListener(APP_SAVE_PROJECT_EVENT, handleSaveProject)
      window.removeEventListener(APP_SAVE_PROJECT_VERSION_EVENT, handleSaveProjectVersion)
    }
  }, [])

  useEffect(() => {
    if (!isWorkspaceHydrated) {
      return
    }

    const intervalId = window.setInterval(() => {
      const currentSession = sessionRef.current
      const currentProject = activeProjectRef.current

      if (!currentSession || !currentProject || viewRef.current !== "editor" || isVersionSaveInFlightRef.current) {
        return
      }

      const versionDefinition = planAutosaveVersion(
        projectVersionsRef.current[currentProject.id] ?? [],
        serializeProjectSnapshot(currentProject),
      )

      if (!versionDefinition) {
        return
      }

      void createProjectVersionSnapshot(currentProject, versionDefinition, { alertOnFailure: false })
    }, AUTOSAVE_VERSION_INTERVAL_MS)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [isWorkspaceHydrated])

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    const onVersionActionMessage = (event: MessageEvent<unknown>) => {
      if (event.origin !== window.location.origin || !event.data || typeof event.data !== "object") {
        return
      }

      const message = event.data as Partial<VersionActionMessage>
      if (
        message.type !== "ivory:version-action" ||
        (message.action !== "restore" && message.action !== "duplicate") ||
        typeof message.projectId !== "string" ||
        typeof message.versionId !== "string"
      ) {
        return
      }

      if (message.action === "restore") {
        void restoreVersionIntoProject(message.projectId, message.versionId)
        return
      }

      void duplicateVersionIntoLibrary(message.projectId, message.versionId)
    }

    window.addEventListener("message", onVersionActionMessage)
    return () => {
      window.removeEventListener("message", onVersionActionMessage)
    }
  }, [])

  useEffect(() => {
    if (!session || !isWorkspaceHydrated || isVersionSaveInFlightRef.current) {
      return
    }

    const projectMissingManualBaseline = projects.find((project) => {
      const versions = projectVersionsByProjectId[project.id] ?? []
      return !versions.some((version) => version.saveKind === "manual")
    })

    if (!projectMissingManualBaseline) {
      return
    }

    const versions = projectVersionsByProjectId[projectMissingManualBaseline.id] ?? []
    const baselineDefinition = getInitialManualVersionDefinition(
      versions,
      serializeProjectSnapshot(projectMissingManualBaseline),
    )

    void createProjectVersionSnapshot(projectMissingManualBaseline, baselineDefinition, { alertOnFailure: false })
  }, [isWorkspaceHydrated, projectVersionsByProjectId, projects, session])

  useEffect(() => {
    // Keep an active project selected whenever projects are present.
    if (!activeProjectId && projects[0]) {
      setActiveProjectId(projects[0].id)
    }
  }, [projects, activeProjectId])

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return
    }

    const colorSchemeQuery = window.matchMedia("(prefers-color-scheme: dark)")

    const onColorSchemeChange = (event: MediaQueryListEvent) => {
      setPalette(getSystemPalette(event.matches))
    }

    const legacyColorSchemeQuery = colorSchemeQuery as MediaQueryList & {
      addListener?: (listener: (event: MediaQueryListEvent) => void) => void
      removeListener?: (listener: (event: MediaQueryListEvent) => void) => void
    }

    if ("addEventListener" in colorSchemeQuery) {
      colorSchemeQuery.addEventListener("change", onColorSchemeChange)
    } else if (legacyColorSchemeQuery.addListener) {
      legacyColorSchemeQuery.addListener(onColorSchemeChange)
    }

    return () => {
      if ("removeEventListener" in colorSchemeQuery) {
        colorSchemeQuery.removeEventListener("change", onColorSchemeChange)
      } else if (legacyColorSchemeQuery.removeListener) {
        legacyColorSchemeQuery.removeListener(onColorSchemeChange)
      }
    }
  }, [])

  useEffect(() => {
    const onFontFamilyChange = (event: Event) => {
      const customEvent = event as CustomEvent<{ fontFamily: string }>
      const nextFontFamily = customEvent.detail?.fontFamily
      if (!nextFontFamily) {
        return
      }

      setSelectedFont(nextFontFamily)
    }

    const onFontSizeChange = (event: Event) => {
      const customEvent = event as CustomEvent<{ delta: number }>
      const delta = customEvent.detail?.delta ?? 0

      if (!delta) {
        return
      }

      setFontSize((current) => clampFontSize(current + delta))
    }

    const onFontSizeSet = (event: Event) => {
      const customEvent = event as CustomEvent<{ value: number }>
      const value = customEvent.detail?.value
      if (typeof value !== "number" || Number.isNaN(value)) {
        return
      }

      setFontSize(clampFontSize(value))
    }

    const onPaletteChange = (event: Event) => {
      const customEvent = event as CustomEvent<{ palette: string }>
      const nextPalette = customEvent.detail?.palette
      if (!nextPalette) {
        return
      }

      const isSupported = PALETTE_OPTIONS.some((option) => option.value === nextPalette)
      if (!isSupported) {
        return
      }

      setPalette(nextPalette as Palette)
    }

    window.addEventListener(EDITOR_FONT_FAMILY_CHANGE_EVENT, onFontFamilyChange as EventListener)
    window.addEventListener(EDITOR_FONT_SIZE_CHANGE_EVENT, onFontSizeChange as EventListener)
    window.addEventListener(EDITOR_FONT_SIZE_SET_EVENT, onFontSizeSet as EventListener)
    window.addEventListener(APP_COLOR_PALETTE_CHANGE_EVENT, onPaletteChange as EventListener)

    return () => {
      window.removeEventListener(EDITOR_FONT_FAMILY_CHANGE_EVENT, onFontFamilyChange as EventListener)
      window.removeEventListener(EDITOR_FONT_SIZE_CHANGE_EVENT, onFontSizeChange as EventListener)
      window.removeEventListener(EDITOR_FONT_SIZE_SET_EVENT, onFontSizeSet as EventListener)
      window.removeEventListener(APP_COLOR_PALETTE_CHANGE_EVENT, onPaletteChange as EventListener)
    }
  }, [])

  // Central helper used by editor page children to mutate only the active project.
  const updateActiveProject = (updater: (project: Project) => Project) => {
    const currentActiveId = activeProjectId ?? activeProject?.id
    if (!currentActiveId) {
      return
    }

    setProjects((current) =>
      current.map((project) => {
        if (project.id !== currentActiveId) {
          return project
        }

        return updater(project)
      }),
    )
  }

  const createNewProject = (kind: ProjectKind, folderId?: string) => {
    // Auto-name projects by kind to mirror docs-style quick creation.
    const nextName = kind === "Book" ? `Book ${bookCounter}` : `Blog ${blogCounter}`
    const nextProject = createProject(nextName, kind)

    setProjects((current) => [
      {
        ...nextProject,
        folderId: folderId ?? null,
        rootPosition: folderId ? nextProject.rootPosition : "top",
      },
      ...current,
    ])
    setActiveProjectId(nextProject.id)

    if (kind === "Book") {
      setBookCounter((current) => current + 1)
    } else {
      setBlogCounter((current) => current + 1)
    }

    if (sessionRef.current && isWorkspaceHydrated) {
      const baselineDefinition = getInitialManualVersionDefinition([], serializeProjectSnapshot(nextProject))
      void createProjectVersionSnapshot(nextProject, baselineDefinition, { alertOnFailure: false })
    }
  }

  const openProject = (projectId: string) => {
    // Opening a project always transitions to the editor workspace.
    setActiveProjectId(projectId)
    setView("editor")
  }

  const returnToProjectLibrary = () => {
    // Smoothly transition back to the dashboard instead of snapping between screens.
    if (viewFadePhase !== "idle") {
      return
    }

    setViewFadePhase("fading-out")
  }

  useEffect(() => {
    if (viewFadePhase !== "fading-out") {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setView("projects")
      setViewFadePhase("fading-in")
    }, VIEW_FADE_DURATION_MS)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [viewFadePhase])

  useEffect(() => {
    if (viewFadePhase !== "fading-in") {
      return
    }

    const frameId = window.requestAnimationFrame(() => {
      setViewFadePhase("idle")
    })

    return () => {
      window.cancelAnimationFrame(frameId)
    }
  }, [viewFadePhase])

  const applyFontFamily = (fontFamily: string) => {
    setSelectedFont(fontFamily)
    setCustomFontName("")
    setIsCustomFontSelected(false)
    requestEditorFontFamilyChange(fontFamily)
  }

  const applyCustomFontName = (fontName: string) => {
    const trimmedName = fontName.trim()
    setCustomFontName(trimmedName)
    setIsCustomFontSelected(true)

    if (!trimmedName) {
      return
    }

    const nextFontFamily = `"${trimmedName}", "Times", "Times New Roman", serif`
    setSelectedFont(nextFontFamily)
    requestEditorFontFamilyChange(nextFontFamily)
  }

  const applyFontSize = (nextFontSize: number) => {
    requestEditorFontSizeSet(clampFontSize(nextFontSize))
  }

  const shouldApplyGlobalFont = isGlobalTextEnabled
  const appStyleVariables = useMemo(() => {
    const variables: Record<string, string> = {
      "--app-font-family": selectedFont,
    }

    if (palette !== "custom") {
      return variables as CSSProperties
    }

    const textColor = pickReadableTextColor(customPaletteBackground)
    const menuBackground = mixHexColors(customPaletteBackground, textColor === "#111111" ? "#ffffff" : "#000000", 0.06)
    const menuHover = mixHexColors(customPaletteBackground, textColor === "#111111" ? "#ffffff" : "#000000", 0.12)
    const dropdownBackground = mixHexColors(customPaletteBackground, textColor === "#111111" ? "#ffffff" : "#000000", 0.09)
    const borderColor = mixHexColors(customPaletteBackground, textColor, 0.18)
    const placeholderColor = textColor === "#111111" ? "rgba(17, 17, 17, 0.44)" : "rgba(245, 245, 245, 0.46)"
    const isLightTextMode = textColor === "#111111"

    variables["--app-bg"] = customPaletteBackground
    variables["--app-accent"] = customPaletteAccent
    variables["--brand-color"] = textColor
    variables["--menu-bg"] = menuBackground
    variables["--menu-border"] = borderColor
    variables["--menu-button"] = textColor
    variables["--menu-button-hover-bg"] = menuHover
    variables["--menu-dropdown-bg"] = dropdownBackground
    variables["--menu-dropdown-border"] = borderColor
    variables["--editor-text"] = textColor
    variables["--editor-title"] = textColor
    variables["--editor-placeholder"] = placeholderColor
    variables["--project-wallpaper-opacity"] = isLightTextMode ? "0.2" : "0.12"
    variables["--project-wallpaper-filter"] = isLightTextMode ? "grayscale(1) brightness(0.22) contrast(1.2)" : "none"

    return variables as CSSProperties
  }, [customPaletteAccent, customPaletteBackground, palette, selectedFont])

  const currentPathname = useMemo(() => {
    if (typeof window === "undefined") {
      return "/"
    }

    return new URL(currentLocation, window.location.origin).pathname
  }, [currentLocation])

  const requestedProjectId = useMemo(() => {
    if (typeof window === "undefined" || currentPathname !== "/app") {
      return ""
    }

    const url = new URL(currentLocation, window.location.origin)
    return url.searchParams.get("projectId")?.trim() ?? ""
  }, [currentLocation, currentPathname])

  const passwordResetToken = useMemo(() => {
    if (typeof window === "undefined" || currentPathname !== "/reset-password") {
      return ""
    }

    const url = new URL(currentLocation, window.location.origin)
    return url.searchParams.get("token")?.trim() ?? ""
  }, [currentLocation, currentPathname])

  useEffect(() => {
    if (!isWorkspaceHydrated || currentPathname !== "/app" || !requestedProjectId) {
      return
    }

    if (!projects.some((project) => project.id === requestedProjectId)) {
      return
    }

    setActiveProjectId(requestedProjectId)
    setView("editor")
  }, [currentPathname, isWorkspaceHydrated, projects, requestedProjectId])

  if (currentPathname === "/reset-password") {
    return (
      <div className={`app app--palette-${palette}`.trim()} style={appStyleVariables}>
        <PasswordResetPage
          token={passwordResetToken}
          onBackToApp={() => {
            if (typeof window === "undefined") {
              return
            }

            const nextPath = session ? "/app" : "/auth"
            window.history.replaceState({}, "", nextPath)
            setCurrentLocation(nextPath)
          }}
        />
      </div>
    )
  }

  if (isAuthBootstrapping) {
    return (
      <div className={`app app--palette-${palette}`.trim()} style={appStyleVariables}>
        <section className="app-loading">
          <p>Loading workspace...</p>
        </section>
      </div>
    )
  }

  if (currentPathname === "/") {
    return (
      <div className={`app app--palette-${palette}`.trim()} style={appStyleVariables}>
        <Home
          isLoggedIn={Boolean(session)}
          onLaunchDashboard={() => {
            if (typeof window !== "undefined") {
              window.history.replaceState({}, "", "/app")
              setCurrentLocation("/app")
            }

            setView("projects")
          }}
          onOpenAuth={() => {
            if (typeof window !== "undefined") {
              window.history.pushState({}, "", "/auth")
              setCurrentLocation("/auth")
            }
          }}
        />
      </div>
    )
  }

  if (currentPathname === "/auth" || !session) {
    return (
      <div className={`app app--palette-${palette}`.trim()} style={appStyleVariables}>
        <AuthPage
          onAuthenticated={handleAuthenticated}
          loadError={authLoadError}
          isLoggedIn={Boolean(session)}
          signedInFirstName={session?.user.firstName ?? ""}
          onLaunchDashboard={() => {
            if (typeof window !== "undefined") {
              window.history.replaceState({}, "", "/app")
              setCurrentLocation("/app")
            }

            setView("projects")
          }}
          onSignOut={logout}
          onBackToLanding={() => {
            if (typeof window !== "undefined") {
              window.history.pushState({}, "", "/")
              setCurrentLocation("/")
            }
          }}
        />
      </div>
    )
  }

  return (
    <div
      className={`app app--palette-${palette} ${shouldApplyGlobalFont ? "app--custom-font" : ""}`.trim()}
      style={appStyleVariables}
    >
      <main className="app-main">
        {isMenuBarEnabled ? (
          <WebMenu
            items={
              view === "projects"
                ? projectWorkspaceMenu
                : getAppMenu({ markdownEditorEnabled: Boolean(activeProject?.markdownEditorEnabled) })
            }
          />
        ) : null}
        <button
          type="button"
          className={`app-brand ${isMenuBarEnabled && (view === "editor" || view === "projects") ? "app-brand--with-menu" : ""}`.trim()}
          aria-label="Go to home page"
          onClick={() => {
            if (typeof window !== "undefined") {
              window.history.pushState({}, "", "/")
              setCurrentLocation("/")
            }
          }}
        >
          <span className="app-brand__name">ivoryscribe</span>
          <span className="app-brand__tagline">write an epic. save a species.</span>
        </button>

        {/* Dashboard if requested (or if nothing is active), otherwise the editor workspace. */}
        <div className={`app-view ${viewFadePhase === "fading-out" ? "app-view--fade-out" : ""} ${viewFadePhase === "fading-in" ? "app-view--fade-in" : ""}`.trim()}>
          {view === "projects" || !activeProject ? (
            <ProjectLibrary
              projects={projects}
              folders={folders}
              activeProjectId={activeProjectId}
              onCreateProject={createNewProject}
              onOpenProject={openProject}
              onOpenProjectInNewTab={(projectId) => {
                if (typeof window === "undefined") {
                  return
                }

                const url = new URL("/app", window.location.origin)
                url.searchParams.set("projectId", projectId)
                window.open(url.toString(), "_blank")
              }}
              setProjects={setProjects}
              setFolders={setFolders}
              setActiveProjectId={setActiveProjectId}
            />
          ) : (
            <EditorWorkspace
              project={activeProject}
              activeContent={activeContent}
              editorFontSize={fontSize}
              menuBarEnabled={isMenuBarEnabled}
              flagsEnabled={isFlagsEnabled}
              showWordCount={isWordCountEnabled}
              isEditorTyping={isEditorTyping}
              onReturnToDashboard={returnToProjectLibrary}
              onProjectChange={updateActiveProject}
              onEditorTypingStateChange={setIsEditorTyping}
            />
          )}
        </div>

        <GlobalSettings
          isOpen={isSettingsOpen}
          showProjectPreferences={view === "editor"}
          menuBarEnabled={isMenuBarEnabled}
          flagsEnabled={isFlagsEnabled}
          hideTrigger={isEditorTyping}
          selectedFont={selectedFont}
          globalTextEnabled={isGlobalTextEnabled}
          showWordCount={isWordCountEnabled}
          fontSize={fontSize}
          palette={palette}
          paletteOptions={PALETTE_OPTIONS}
          fontOptions={[...FONT_OPTIONS]}
          customFontName={customFontName}
          customFontSelected={isCustomFontSelected}
          onToggleOpen={() => {
            setIsSettingsOpen((current) => !current)
          }}
          onClose={() => {
            setIsSettingsOpen(false)
          }}
          onMenuBarEnabledChange={setIsMenuBarEnabled}
          onFlagsEnabledChange={setIsFlagsEnabled}
          onFontChange={applyFontFamily}
          onCustomFontNameChange={applyCustomFontName}
          onCustomFontSelectedChange={setIsCustomFontSelected}
          onGlobalTextEnabledChange={setIsGlobalTextEnabled}
          onShowWordCountChange={setIsWordCountEnabled}
          onFontSizeChange={applyFontSize}
          onPaletteChange={(nextPalette) => {
            requestAppColorPaletteChange(nextPalette)
          }}
          customPaletteBackground={customPaletteBackground}
          customPaletteAccent={customPaletteAccent}
          onCustomPaletteBackgroundChange={setCustomPaletteBackground}
          onCustomPaletteAccentChange={setCustomPaletteAccent}
          accountFirstName={session.user.firstName ?? ""}
          accountLastName={session.user.lastName ?? ""}
          accountEmail={session.user.email ?? ""}
          activeProjectName={activeProject?.name ?? ""}
          activeProjectKind={activeProject?.kind ?? "Book"}
          activeProjectMarkdownEditorEnabled={Boolean(activeProject?.markdownEditorEnabled)}
          activeProjectColor={activeProject?.color ?? "#7ea8ff"}
          activeProjectWallpaperEmojis={activeProject?.wallpaperEmojis ?? ""}
          activeProjectVersions={activeProjectVersionsForSettings}
          onActiveProjectNameChange={(nextName) => {
            updateActiveProject((currentProject) => ({
              ...currentProject,
              name: nextName,
            }))
          }}
          onActiveProjectKindChange={(nextKind) => {
            updateActiveProject((currentProject) => ({
              ...currentProject,
              kind: nextKind,
            }))
          }}
          onActiveProjectMarkdownEditorEnabledChange={(enabled) => {
            updateActiveProject((currentProject) => {
              if (currentProject.markdownEditorEnabled) {
                return {
                  ...currentProject,
                  markdownEditorEnabled: true,
                }
              }

              return {
                ...currentProject,
                markdownEditorEnabled: enabled,
              }
            })
          }}
          onActiveProjectColorChange={(nextColor) => {
            updateActiveProject((currentProject) => ({
              ...currentProject,
              color: nextColor,
            }))
          }}
          onActiveProjectWallpaperEmojisChange={(nextWallpaperEmojis) => {
            updateActiveProject((currentProject) => ({
              ...currentProject,
              wallpaperEmojis: nextWallpaperEmojis,
            }))
          }}
          onRestoreProjectVersion={(versionId) => {
            if (!activeProject) {
              return
            }

            void restoreVersionIntoProject(activeProject.id, versionId)
          }}
          onDuplicateProjectVersion={(versionId) => {
            if (!activeProject) {
              return
            }

            void duplicateVersionIntoLibrary(activeProject.id, versionId)
          }}
          onOpenProjectVersionInNewTab={(versionId) => {
            if (!activeProject || typeof window === "undefined") {
              return
            }

            const selectedVersion = (projectVersionsByProjectId[activeProject.id] ?? []).find(
              (version) => version.id === versionId,
            )
            if (!selectedVersion) {
              return
            }

            const activeDocumentTitle =
              (selectedVersion.snapshot.activeId
                ? findTabTitleById(selectedVersion.snapshot.tabs, selectedVersion.snapshot.activeId)
                : null) ?? "Untitled Entry"
            const activeDocumentPreview = selectedVersion.snapshot.activeId
              ? stripHtmlPreview(selectedVersion.snapshot.contentById[selectedVersion.snapshot.activeId] ?? "")
              : ""

            const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(selectedVersion.snapshot.name)} - Version ${escapeHtml(selectedVersion.label)}</title>
    <style>
      body { margin: 0; padding: 24px; font-family: "Times New Roman", Times, serif; background: #101113; color: #ececec; }
      .wrap { max-width: 860px; margin: 0 auto; }
      h1 { margin: 0 0 8px; font-weight: 400; font-size: 36px; }
      .meta { margin: 0; color: #b6bcc8; font-size: 15px; }
      .card { margin-top: 20px; border: 1px solid #313642; border-radius: 12px; padding: 14px; background: #171a21; }
      h2 { margin: 0 0 10px; font-weight: 400; font-size: 24px; }
      p { margin: 0; color: #dde3ee; line-height: 1.45; white-space: pre-wrap; }
      .actions { margin-top: 14px; display: flex; gap: 10px; flex-wrap: wrap; }
      .btn { border: 1px solid #3e4555; border-radius: 8px; background: #1f2531; color: #e9edf5; padding: 8px 12px; font-size: 15px; cursor: pointer; }
      .btn:hover { background: #273043; }
      .status { margin-top: 10px; color: #9bb6ff; font-size: 14px; min-height: 1.2em; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <h1>${escapeHtml(selectedVersion.snapshot.name)} - Version ${escapeHtml(selectedVersion.label)}</h1>
      <p class="meta">${escapeHtml(formatVersionTimestamp(selectedVersion.createdAt))} - ${escapeHtml(selectedVersion.saveKind === "manual" ? "Manual" : "Autosave")}</p>
      <div class="actions">
        <button id="restoreBtn" class="btn" type="button">Restore Version</button>
        <button id="duplicateBtn" class="btn" type="button">Add Copy to Library</button>
      </div>
      <p id="actionStatus" class="status"></p>
      <div class="card">
        <h2>${escapeHtml(activeDocumentTitle)}</h2>
        <p>${escapeHtml(activeDocumentPreview || "No preview content available for this entry.")}</p>
      </div>
    </div>
    <script>
      (function () {
        var projectId = ${JSON.stringify(activeProject.id)};
        var versionId = ${JSON.stringify(selectedVersion.id)};
        var status = document.getElementById("actionStatus");

        function sendAction(action) {
          if (!window.opener) {
            if (status) {
              status.textContent = "This tab is detached from the app window. Open from version history to enable actions.";
            }
            return;
          }

          window.opener.postMessage(
            {
              type: "ivory:version-action",
              action: action,
              projectId: projectId,
              versionId: versionId,
            },
            window.location.origin,
          );

          if (status) {
            status.textContent = action === "restore"
              ? "Restore request sent to app window."
              : "Duplicate request sent to app window.";
          }
        }

        var restoreBtn = document.getElementById("restoreBtn");
        var duplicateBtn = document.getElementById("duplicateBtn");

        if (restoreBtn) {
          restoreBtn.addEventListener("click", function () {
            sendAction("restore");
          });
        }

        if (duplicateBtn) {
          duplicateBtn.addEventListener("click", function () {
            sendAction("duplicate");
          });
        }
      })();
    </script>
  </body>
</html>`

            const blob = new Blob([html], { type: "text/html" })
            const blobUrl = URL.createObjectURL(blob)
            window.open(blobUrl, "_blank")
            window.setTimeout(() => {
              URL.revokeObjectURL(blobUrl)
            }, 15_000)
          }}
          onExportProject={() => {
            if (!activeProject) {
              return
            }

            if (activeProject.markdownEditorEnabled) {
              downloadProjectAsMarkdown(activeProject)
              return
            }

            exportProjectAsPdf(activeProject)
          }}
          onSaveAccountProfile={handleAccountProfileSave}
          onRequestAccountEmailChange={handleAccountEmailChangeRequest}
          onVerifyCurrentAccountEmailChange={handleAccountCurrentEmailChangeVerify}
          onConfirmAccountEmailChange={handleAccountEmailChangeConfirm}
          onRequestPasswordReset={handleAccountPasswordResetRequest}
          onRequestAccountDeletion={handleAccountDeletionRequest}
          onConfirmAccountDeletionCode={handleAccountDeletionCodeConfirm}
          onSignOut={logout}
        />
      </main>
      <GlobalCaretOverlay />
    </div>
  )
}