import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import "./App.css"
import GlobalSettings from "./webapp/components/GlobalSettings"
import GlobalCaretOverlay from "./webapp/components/GlobalCaretOverlay"
import WebMenu from "./webapp/components/WebMenu"
import { FONT_OPTIONS, PALETTE_OPTIONS, type Palette } from "./core/appearance"
import {
  APP_COLOR_PALETTE_CHANGE_EVENT,
  EDITOR_FONT_FAMILY_CHANGE_EVENT,
  EDITOR_FONT_SIZE_CHANGE_EVENT,
  EDITOR_FONT_SIZE_SET_EVENT,
  requestAppColorPaletteChange,
  requestEditorFontFamilyChange,
  requestEditorFontSizeSet,
} from "./core/editorEvents"
import { projectWorkspaceMenu } from "./core/menu"
import { exportProjectAsPdf } from "./core/pdfExport"
import { DEFAULT_DOCUMENT_CONTENT, createProject, type Project, type ProjectKind } from "./core/projects"
import {
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
const PROJECT_RECORD_TYPE = "ivory-project"

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

    for (const documentRecord of documents) {
      if (documentRecord.metadata?.recordType !== PROJECT_RECORD_TYPE) {
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
    setFolders(Array.isArray(uiSettings?.folders) ? uiSettings.folders : [])

    const requestedActiveProjectId = uiSettings?.activeProjectId
    const resolvedActiveProjectId =
      typeof requestedActiveProjectId === "string" && projectList.some((project) => project.id === requestedActiveProjectId)
        ? requestedActiveProjectId
        : (projectList[0]?.id ?? null)
    setActiveProjectId(resolvedActiveProjectId)

    setView(uiSettings?.view === "editor" || uiSettings?.view === "projects" ? uiSettings.view : "projects")
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
    setSession(nextSession)
    setSessionInStorage(nextSession)

    if (typeof window !== "undefined") {
      window.history.replaceState({}, "", "/app")
      setCurrentLocation("/app")
    }

    setView("projects")
  }

  const logout = () => {
    setSession(null)
    setSessionInStorage(null)
    setAuthLoadError("")
    setIsWorkspaceHydrated(false)
    setProjects([])
    setFolders([])
    setProjectDocumentMap({})
    setActiveProjectId(null)
    setView("projects")
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

  const passwordResetToken = useMemo(() => {
    if (typeof window === "undefined" || currentPathname !== "/reset-password") {
      return ""
    }

    const url = new URL(currentLocation, window.location.origin)
    return url.searchParams.get("token")?.trim() ?? ""
  }, [currentLocation, currentPathname])

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
        {isMenuBarEnabled ? <WebMenu items={view === "projects" ? projectWorkspaceMenu : undefined} /> : null}
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
              setProjects={setProjects}
              setFolders={setFolders}
              setActiveProjectId={setActiveProjectId}
            />
          ) : (
            <EditorWorkspace
              project={activeProject}
              activeContent={activeContent}
              menuBarEnabled={isMenuBarEnabled}
              flagsEnabled={isFlagsEnabled}
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
          activeProjectColor={activeProject?.color ?? "#7ea8ff"}
          activeProjectWallpaperEmojis={activeProject?.wallpaperEmojis ?? ""}
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
          onExportProjectAsPdf={() => {
            if (!activeProject) {
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