import { type Dispatch, type SetStateAction, useEffect, useRef } from "react"
import {
  type BillingStatusResponse,
  type PendingShareRequest,
  createDocument,
  deleteDocument,
  leaveShare,
  getBillingStatus,
  getDocuments,
  getPreferences,
  getPendingShareRequests,
  getSharedWithMe,
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
    translucentNavPanel?: boolean
    view?: "projects" | "editor"
    bookCounter?: number
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
  setIsTranslucentNavPanel: Dispatch<SetStateAction<boolean>>
  setPalette: Dispatch<SetStateAction<Palette>>
  setCustomPaletteBackground: Dispatch<SetStateAction<string>>
  setCustomPaletteAccent: Dispatch<SetStateAction<string>>
  setDisplayFont: Dispatch<SetStateAction<string>>
  setBodyFont: Dispatch<SetStateAction<string>>
  setUiFont: Dispatch<SetStateAction<string>>
  setFontSize: Dispatch<SetStateAction<number>>
  setIsWordCountEnabled: Dispatch<SetStateAction<boolean>>
  setBookCounter: Dispatch<SetStateAction<number>>
  setTuskAiBilling: Dispatch<SetStateAction<BillingStatusResponse>>
  setPendingShareRequests: Dispatch<SetStateAction<PendingShareRequest[]>>
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
  isTranslucentNavPanel: boolean
  view: "projects" | "editor"
  bookCounter: number
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
    setIsTranslucentNavPanel,
    setPalette,
    setCustomPaletteBackground,
    setCustomPaletteAccent,
    setDisplayFont,
    setBodyFont,
    setUiFont,
    setFontSize,
    setIsWordCountEnabled,
    setBookCounter,
    setTuskAiBilling,
    setPendingShareRequests,
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
    isTranslucentNavPanel,
    view,
    bookCounter,
  } = params

  const saveTimeoutRef = useRef<number | null>(null)
  const isSyncingRef = useRef(false)
  const lastPushedContentRef = useRef<Map<string, string>>(new Map())
  const sharedDocumentIdsRef = useRef<Set<string>>(new Set())
  // Tombstones: project IDs that are being permanently deleted.
  // Prevents the polling loop from resurrecting them.
  const shredProjectIdsRef = useRef<Set<string>>(new Set())
  // Maps project ID → shareId for projects shared WITH this user (recipient side).
  // Used to call leaveShare when the user shreds a shared project.
  const shareIdByProjectIdRef = useRef<Map<string, string>>(new Map())
  // Maps project ID → owner email for projects shared WITH this user (recipient side).
  const ownerEmailByProjectIdRef = useRef<Map<string, string>>(new Map())

  const hydrateWorkspace = async (token: string) => {
    const [documentsResult, preferencesResult, billingResult, sharedResult, pendingResult] = await Promise.allSettled([
      getDocuments(token),
      getPreferences(token),
      getBillingStatus(token),
      getSharedWithMe(token),
      getPendingShareRequests(token),
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

    // Merge shared documents (projects shared with this user by others)
    const nextSharedDocumentIds = new Set<string>()
    if (sharedResult.status === "fulfilled") {
      const sharedEntries = sharedResult.value
      const ownedProjectIds = new Set(nextProjects.map((p) => p.id))

      for (const entry of sharedEntries) {
        if (!entry.document || !entry.document.content) continue

        const sharedProject = parseProjectFromDocument(entry.document)
        if (!sharedProject) continue

        // Skip if the user already owns a project with the same ID
        if (ownedProjectIds.has(sharedProject.id)) continue

        nextProjects.push(sharedProject)
        nextDocumentMap[sharedProject.id] = entry.document.id
        nextSharedDocumentIds.add(entry.document.id)
        shareIdByProjectIdRef.current.set(sharedProject.id, entry.shareId)
        ownerEmailByProjectIdRef.current.set(sharedProject.id, entry.owner.email)
      }
    }
    sharedDocumentIdsRef.current = nextSharedDocumentIds

    if (pendingResult.status === "fulfilled") {
      setPendingShareRequests(pendingResult.value)
    } else {
      setPendingShareRequests([])
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
    setIsTranslucentNavPanel(uiSettings?.translucentNavPanel !== false)

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

  // Poll for remote document updates from collaborators (both directions)
  useEffect(() => {
    if (!session || !isWorkspaceHydrated) {
      return
    }

    const pollRemoteUpdates = async () => {
      if (isSyncingRef.current) return
      try {
        // Fetch both owned documents and shared-with-me in parallel
        const [ownedDocs, sharedEntries] = await Promise.all([
          getDocuments(session.token),
          getSharedWithMe(session.token),
        ])

        // Build a map of remote project states from BOTH sources
        const remoteProjectUpdates = new Map<string, { project: Project; documentId: string }>()
        const nextSharedDocumentIds = new Set<string>()

        // Parse owned documents for changes made by collaborators
        for (const doc of ownedDocs) {
          if (doc.metadata?.recordType !== PROJECT_RECORD_TYPE) continue
          const project = parseProjectFromDocument(doc)
          if (!project) continue
          remoteProjectUpdates.set(project.id, { project, documentId: doc.id })
        }

        // Parse shared documents (recipient side)
        for (const entry of sharedEntries) {
          if (!entry.document || !entry.document.content) continue
          const sharedProject = parseProjectFromDocument(entry.document)
          if (!sharedProject) continue
          nextSharedDocumentIds.add(entry.document.id)
          // Shared entries take precedence (they're the canonical source for shared projects)
          remoteProjectUpdates.set(sharedProject.id, { project: sharedProject, documentId: entry.document.id })
          shareIdByProjectIdRef.current.set(sharedProject.id, entry.shareId)
          ownerEmailByProjectIdRef.current.set(sharedProject.id, entry.owner.email)
        }
        sharedDocumentIdsRef.current = nextSharedDocumentIds

        if (remoteProjectUpdates.size > 0) {
          setProjects((current) => {
            let changed = false
            const updated = current.map((p) => {
              const remote = remoteProjectUpdates.get(p.id)
              if (!remote) return p

              // Check if user has local unsaved edits for this project.
              const localContent = JSON.stringify({ ...p, activeId: null })
              const lastPushed = lastPushedContentRef.current.get(p.id)
              const hasLocalEdits = lastPushed != null && localContent !== lastPushed

              if (hasLocalEdits) {
                // User has unsaved edits — don't overwrite with remote data
                return p
              }

              // Apply remote content but preserve local activeId (per-user nav state)
              const merged = { ...remote.project, activeId: p.activeId }
              if (JSON.stringify(p) !== JSON.stringify(merged)) {
                changed = true
                lastPushedContentRef.current.set(p.id, JSON.stringify({ ...merged, activeId: null }))
                return merged
              }
              return p
            })

            const localIds = new Set(current.map((p) => p.id))
            for (const [, { project }] of remoteProjectUpdates) {
              if (!localIds.has(project.id) && !shredProjectIdsRef.current.has(project.id)) {
                changed = true
                updated.push(project)
                lastPushedContentRef.current.set(project.id, JSON.stringify({ ...project, activeId: null }))
              }
            }

            return changed ? updated : current
          })

          setProjectDocumentMap((current) => {
            const additions: Record<string, string> = {}
            for (const [projectId, { documentId }] of remoteProjectUpdates) {
              // Never re-add a shredded project to the document map
              if (shredProjectIdsRef.current.has(projectId)) continue
              if (current[projectId] !== documentId) {
                additions[projectId] = documentId
              }
            }
            return Object.keys(additions).length > 0 ? { ...current, ...additions } : current
          })
        }
      } catch {
        // Polling failure is non-critical
      }
    }

    const intervalId = window.setInterval(pollRemoteUpdates, 3000)
    return () => window.clearInterval(intervalId)
  }, [session, isWorkspaceHydrated])

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
          // ── Step 1: Push local changes to backend ────────────────
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
            // Never push a project that has been permanently shredded
            if (shredProjectIdsRef.current.has(project.id)) continue

            const contentJson = JSON.stringify(project)
            const contentForComparison = JSON.stringify({ ...project, activeId: null })
            const payload = {
              title: project.name,
              content: contentJson,
              metadata: {
                recordType: PROJECT_RECORD_TYPE,
                projectId: project.id,
              },
              theme: {
                projectColor: project.color,
              },
            }

            const existingDocumentId = projectDocumentMap[project.id] ?? remoteByProjectId.get(project.id)
            const isSharedDocument = existingDocumentId ? sharedDocumentIdsRef.current.has(existingDocumentId) : false

            if (existingDocumentId) {
              // Skip push if content hasn't changed since last push (avoids echo cycles)
              const lastPushed = lastPushedContentRef.current.get(project.id)
              if (lastPushed != null && contentForComparison === lastPushed) {
                nextDocumentMap[project.id] = existingDocumentId
                continue
              }

              try {
                await updateDocument(session.token, existingDocumentId, payload)
                lastPushedContentRef.current.set(project.id, contentForComparison)
              } catch {
                // Shared doc with view-only permission will 403 — keep the map entry
              }
              nextDocumentMap[project.id] = existingDocumentId
              continue
            }

            if (!isSharedDocument) {
              const created = await createDocument(session.token, payload)
              nextDocumentMap[project.id] = created.id
              lastPushedContentRef.current.set(project.id, contentForComparison)
            }
          }

          const localProjectIds = new Set(projects.map((project) => project.id))
          for (const documentRecord of remoteProjectDocuments) {
            const projectId =
              typeof documentRecord.metadata?.projectId === "string"
                ? documentRecord.metadata.projectId
                : null

            if (!projectId || (localProjectIds.has(projectId) && !shredProjectIdsRef.current.has(projectId))) {
              continue
            }

            if (sharedDocumentIdsRef.current.has(documentRecord.id)) {
              continue
            }

            await deleteDocument(session.token, documentRecord.id)
            // Confirmed remote deletion — safe to clear the tombstone
            shredProjectIdsRef.current.delete(projectId)
          }

          // Clear tombstones for shredded projects that had no remote doc at all
          for (const shredId of shredProjectIdsRef.current) {
            if (!remoteByProjectId.has(shredId)) {
              shredProjectIdsRef.current.delete(shredId)
            }
          }

          setProjectDocumentMap(nextDocumentMap)

          // ── Step 2: Pull shared document updates AFTER saving ────
          // Fetching after push ensures we get back what we just saved
          // (or newer changes from the owner), avoiding overwrite races.
          const sharedEntries = await getSharedWithMe(session.token)

          const nextSharedDocumentIds = new Set<string>()
          const sharedProjectUpdates = new Map<string, { project: Project; documentId: string }>()

          for (const entry of sharedEntries) {
            if (!entry.document || !entry.document.content) continue
            const sharedProject = parseProjectFromDocument(entry.document)
            if (!sharedProject) continue
            nextSharedDocumentIds.add(entry.document.id)
            sharedProjectUpdates.set(sharedProject.id, { project: sharedProject, documentId: entry.document.id })
            shareIdByProjectIdRef.current.set(sharedProject.id, entry.shareId)
            ownerEmailByProjectIdRef.current.set(sharedProject.id, entry.owner.email)
          }
          sharedDocumentIdsRef.current = nextSharedDocumentIds

          if (sharedProjectUpdates.size > 0) {
            setProjects((current) => {
              let changed = false
              const updated = current.map((p) => {
                const remote = sharedProjectUpdates.get(p.id)
                if (!remote) return p
                // Preserve local activeId — it's per-user navigation state
                const merged = { ...remote.project, activeId: p.activeId }
                if (JSON.stringify(p) !== JSON.stringify(merged)) {
                  changed = true
                  lastPushedContentRef.current.set(p.id, JSON.stringify({ ...merged, activeId: null }))
                  return merged
                }
                return p
              })

              const localIds = new Set(current.map((p) => p.id))
              for (const [projectId, { project }] of sharedProjectUpdates) {
                if (!localIds.has(projectId)) {
                  changed = true
                  updated.push(project)
                  lastPushedContentRef.current.set(projectId, JSON.stringify({ ...project, activeId: null }))
                }
              }

              return changed ? updated : current
            })

            setProjectDocumentMap((current) => {
              const additions: Record<string, string> = {}
              for (const [projectId, { documentId }] of sharedProjectUpdates) {
                if (current[projectId] !== documentId) {
                  additions[projectId] = documentId
                }
              }
              return Object.keys(additions).length > 0 ? { ...current, ...additions } : current
            })
          }

          // ── Step 3: Save preferences ────────────────────────────

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
              translucentNavPanel: isTranslucentNavPanel,
              view,
              bookCounter,
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
    bookCounter,
    bodyFont,
    customPaletteAccent,
    customPaletteBackground,
    displayFont,
    folders,
    fontSize,
    isFlagsEnabled,
    isTranslucentNavPanel,
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

  const permanentlyDeleteProjects = async (ids: Set<string>) => {
    if (!session) return

    // 1. Tombstone immediately — prevents polling from resurrecting these projects
    for (const id of ids) shredProjectIdsRef.current.add(id)

    // 2. Remove from local state immediately
    setProjects((cur) => cur.filter((p) => !ids.has(p.id)))
    setProjectDocumentMap((cur) => {
      const next = { ...cur }
      for (const id of ids) delete next[id]
      return next
    })

    // 3. Directly delete/leave each project on the backend.
    //    Do NOT rely on the debounced sync — it can be skipped if isSyncingRef is true.
    for (const projectId of ids) {
      const shareId = shareIdByProjectIdRef.current.get(projectId)
      if (shareId) {
        // Shared project (recipient side): leave the share so it disappears for this user
        try {
          await leaveShare(session.token, shareId)
        } catch { /* best-effort */ }
        shareIdByProjectIdRef.current.delete(projectId)
      } else {
        // Owned project: permanently delete the document
        const documentId = projectDocumentMap[projectId]
        if (documentId) {
          try {
            await deleteDocument(session.token, documentId)
          } catch { /* best-effort */ }
        }
      }
      // Clear tombstone — remote is gone
      shredProjectIdsRef.current.delete(projectId)
    }
  }

  return { sharedDocumentIdsRef, shareIdByProjectIdRef, ownerEmailByProjectIdRef, permanentlyDeleteProjects }
}
