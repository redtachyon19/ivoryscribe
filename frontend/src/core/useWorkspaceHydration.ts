import { type Dispatch, type SetStateAction, useEffect, useRef } from "react"
import {
  type BillingStatusResponse,
  createDocument,
  deleteDocument,
  getBillingStatus,
  getDocuments,
  getPreferences,
  updateDocument,
  updatePreferences,
} from "./api"
import {
  clampFontSize,
  DEFAULT_BODY_FONT,
  DEFAULT_CUSTOM_ACCENT,
  DEFAULT_CUSTOM_BACKGROUND,
  DEFAULT_DISPLAY_FONT,
  DEFAULT_UI_FONT,
  getInitialPalette,
  PALETTE_OPTIONS,
  type Palette,
} from "./appearance"
import { requestEditorFontFamilyChange } from "./editorEvents"
import {
  createProject,
  extractCounterFromNames,
  parseProjectFromDocument,
  type Project,
} from "./projects"
import { setSessionInStorage, type UserSession } from "./session"
import {
  parseProjectVersion,
  PROJECT_RECORD_TYPE,
  sortProjectVersionsDesc,
  type ProjectVersion,
} from "./versioning"
import type { ProjectFolder } from "../webapp/pages/Library"

type PreferencesPayload = {
  theme?: {
    palette?: string
    customPaletteBackground?: string
    customPaletteAccent?: string
  }
  editorSettings?: {
    displayFont?: string
    bodyFont?: string
    uiFont?: string
    selectedFont?: string
    fontSize?: number
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

type UseWorkspaceHydrationParams = {
  session: UserSession | null
  setSession: Dispatch<SetStateAction<UserSession | null>>
  setIsAuthBootstrapping: Dispatch<SetStateAction<boolean>>
  setAuthLoadError: Dispatch<SetStateAction<string>>
  // Shared state lifted to App
  isWorkspaceHydrated: boolean
  setIsWorkspaceHydrated: Dispatch<SetStateAction<boolean>>
  projectDocumentMap: Record<string, string>
  setProjectDocumentMap: Dispatch<SetStateAction<Record<string, string>>>
  // Hydration distribution targets
  setProjects: Dispatch<SetStateAction<Project[]>>
  setProjectVersionsByProjectId: Dispatch<SetStateAction<Record<string, ProjectVersion[]>>>
  setFolders: Dispatch<SetStateAction<ProjectFolder[]>>
  setActiveProjectId: Dispatch<SetStateAction<string | null>>
  setView: Dispatch<SetStateAction<"projects" | "editor">>
  setIsMenuBarEnabled: Dispatch<SetStateAction<boolean>>
  setIsFlagsEnabled: Dispatch<SetStateAction<boolean>>
  setPalette: Dispatch<SetStateAction<Palette>>
  setCustomPaletteBackground: Dispatch<SetStateAction<string>>
  setCustomPaletteAccent: Dispatch<SetStateAction<string>>
  setDisplayFont: Dispatch<SetStateAction<string>>
  setBodyFont: Dispatch<SetStateAction<string>>
  setUiFont: Dispatch<SetStateAction<string>>
  setFontSize: Dispatch<SetStateAction<number>>
  setIsWordCountEnabled: Dispatch<SetStateAction<boolean>>
  setBookCounter: Dispatch<SetStateAction<number>>
  setBlogCounter: Dispatch<SetStateAction<number>>
  setTuskAiBilling: Dispatch<SetStateAction<BillingStatusResponse>>
  // Sync state reads
  projects: Project[]
  activeProjectId: string | null
  palette: Palette
  customPaletteBackground: string
  customPaletteAccent: string
  displayFont: string
  bodyFont: string
  uiFont: string
  fontSize: number
  isWordCountEnabled: boolean
  folders: ProjectFolder[]
  isMenuBarEnabled: boolean
  isFlagsEnabled: boolean
  view: "projects" | "editor"
  bookCounter: number
  blogCounter: number
}

export function useWorkspaceHydration(params: UseWorkspaceHydrationParams) {
  const {
    session,
    setSession,
    setIsAuthBootstrapping,
    setAuthLoadError,
    isWorkspaceHydrated,
    setIsWorkspaceHydrated,
    projectDocumentMap,
    setProjectDocumentMap,
    setProjects,
    setProjectVersionsByProjectId,
    setFolders,
    setActiveProjectId,
    setView,
    setIsMenuBarEnabled,
    setIsFlagsEnabled,
    setPalette,
    setCustomPaletteBackground,
    setCustomPaletteAccent,
    setDisplayFont,
    setBodyFont,
    setUiFont,
    setFontSize,
    setIsWordCountEnabled,
    setBookCounter,
    setBlogCounter,
    setTuskAiBilling,
    projects,
    activeProjectId,
    palette,
    customPaletteBackground,
    customPaletteAccent,
    displayFont,
    bodyFont,
    uiFont,
    fontSize,
    isWordCountEnabled,
    folders,
    isMenuBarEnabled,
    isFlagsEnabled,
    view,
    bookCounter,
    blogCounter,
  } = params

  const saveTimeoutRef = useRef<number | null>(null)
  const isSyncingRef = useRef(false)

  const hydrateWorkspace = async (token: string) => {
    const [documentsResult, preferencesResult, billingResult] = await Promise.allSettled([
      getDocuments(token),
      getPreferences(token),
      getBillingStatus(token),
    ])

    if (documentsResult.status === "rejected") {
      throw documentsResult.reason
    }

    if (preferencesResult.status === "rejected") {
      throw preferencesResult.reason
    }

    const documents = documentsResult.value
    const preferences = preferencesResult.value

    if (billingResult.status === "fulfilled") {
      setTuskAiBilling(billingResult.value)
    } else {
      setTuskAiBilling({
        tuskAiActivated: false,
        tuskAiActivatedAt: null,
        purchase: null,
      })
    }

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

    // Always land in library on login/refresh, regardless of previously saved view.
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

    const nextBodyFont = editorSettings?.bodyFont ?? editorSettings?.selectedFont ?? DEFAULT_BODY_FONT
    const nextDisplayFont = editorSettings?.displayFont ?? DEFAULT_DISPLAY_FONT
    const nextUiFont = editorSettings?.uiFont ?? DEFAULT_UI_FONT

    setDisplayFont(nextDisplayFont)
    setBodyFont(nextBodyFont)
    setUiFont(nextUiFont)
    setFontSize(clampFontSize(typeof editorSettings?.fontSize === "number" ? editorSettings.fontSize : 32))
    setIsWordCountEnabled(Boolean(editorSettings?.isWordCountEnabled))

    requestEditorFontFamilyChange(nextBodyFont)

    setBookCounter(typeof uiSettings?.bookCounter === "number" ? uiSettings.bookCounter : extractCounterFromNames(projectList, "Book"))
    setBlogCounter(typeof uiSettings?.blogCounter === "number" ? uiSettings.blogCounter : extractCounterFromNames(projectList, "Blog"))
  }

  // Bootstrap effect
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

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [])

  // Debounced sync effect
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
              displayFont,
              bodyFont,
              uiFont,
              fontSize,
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
    bodyFont,
    customPaletteAccent,
    customPaletteBackground,
    displayFont,
    folders,
    fontSize,
    isFlagsEnabled,
    isWordCountEnabled,
    isMenuBarEnabled,
    isWorkspaceHydrated,
    palette,
    projectDocumentMap,
    projects,
    uiFont,
    session,
    view,
  ])

  return {}
}
