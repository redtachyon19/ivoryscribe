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
} from "@shared/api"
import type { Palette } from "../utils/appearance"
import { applyPreferences, type PreferencesPayload } from "../utils/preferences"
import {
  createProject,
  extractCounterFromNames,
  parseProjectFromDocument,
  type Project,
} from "../utils/projects"
import type { UserSession } from "../state/session"
import {
  PROJECT_RECORD_TYPE,
} from "../state/versioning"
import type { ProjectFolder } from "../../webapp/pages/Library"

export type WorkspaceMutators = {
  setIsAuthBootstrapping: Dispatch<SetStateAction<boolean>>
  setAuthLoadError: Dispatch<SetStateAction<string>>
  onAuthFailure: (message: string) => void

  setIsWorkspaceHydrated: Dispatch<SetStateAction<boolean>>

  setProjects: Dispatch<SetStateAction<Project[]>>
  setProjectDocumentMap: Dispatch<SetStateAction<Record<string, string>>>
  setFolders: Dispatch<SetStateAction<ProjectFolder[]>>
  setActiveProjectId: Dispatch<SetStateAction<string | null>>
  setView: Dispatch<SetStateAction<"projects" | "editor">>
  setBookCounter: Dispatch<SetStateAction<number>>
  setPendingShareRequests: Dispatch<SetStateAction<PendingShareRequest[]>>
  setTuskAiBilling: Dispatch<SetStateAction<BillingStatusResponse>>

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
}

type UseWorkspaceHydrationParams = {
  session: UserSession | null
  actionSession?: UserSession | null
  mutators: WorkspaceMutators
  isWorkspaceHydrated: boolean
  projectDocumentMap: Record<string, string>
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
    actionSession,
    mutators,
    isWorkspaceHydrated,
    projectDocumentMap,
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

  const {
    setIsAuthBootstrapping,
    setAuthLoadError,
    onAuthFailure,
    setIsWorkspaceHydrated,
    setProjects,
    setProjectDocumentMap,
    setFolders,
    setActiveProjectId,
    setView,
    setBookCounter,
    setPendingShareRequests,
    setTuskAiBilling,
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
  } = mutators

  const saveTimeoutRef = useRef<number | null>(null)
  const isSyncingRef = useRef(false)
  const lastPushedContentRef = useRef<Map<string, string>>(new Map())
  const sharedDocumentIdsRef = useRef<Set<string>>(new Set())
  const shredProjectIdsRef = useRef<Set<string>>(new Set())
  const shareIdByProjectIdRef = useRef<Map<string, string>>(new Map())
  const ownerEmailByProjectIdRef = useRef<Map<string, string>>(new Map())

  const hydrateWorkspace = async (token: string, isStale?: () => boolean) => {
    const [documentsResult, preferencesResult, billingResult, sharedResult, pendingResult] = await Promise.allSettled([
      getDocuments(token),
      getPreferences(token),
      getBillingStatus(token),
      getSharedWithMe(token),
      getPendingShareRequests(token),
    ])

    if (isStale?.()) return

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

    for (const documentRecord of documents) {
      if (documentRecord.metadata?.recordType !== PROJECT_RECORD_TYPE) continue

      const project = parseProjectFromDocument(documentRecord)
      if (!project) {
        continue
      }

      nextProjects.push({ ...project, source: "cloud" })
      nextDocumentMap[project.id] = documentRecord.id
    }

    const nextSharedDocumentIds = new Set<string>()
    if (sharedResult.status === "fulfilled") {
      const sharedEntries = sharedResult.value
      const ownedProjectIds = new Set(nextProjects.map((p) => p.id))

      for (const entry of sharedEntries) {
        if (!entry.document || !entry.document.content) continue

        const sharedProject = parseProjectFromDocument(entry.document)
        if (!sharedProject) continue

        if (ownedProjectIds.has(sharedProject.id)) continue

        nextProjects.push({ ...sharedProject, source: "cloud" })
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
    const uiSettings = (preferences.uiSettings ?? {}) as PreferencesPayload["uiSettings"] & {
      folders?: ProjectFolder[]
      activeProjectId?: string | null
      bookCounter?: number
    }

    setProjects(projectList)
    setProjectDocumentMap(nextDocumentMap)
    setFolders(Array.isArray(uiSettings?.folders) ? uiSettings.folders : [])

    const requestedActiveProjectId = uiSettings?.activeProjectId
    const resolvedActiveProjectId =
      typeof requestedActiveProjectId === "string" && projectList.some((project) => project.id === requestedActiveProjectId)
        ? requestedActiveProjectId
        : (projectList[0]?.id ?? null)
    setActiveProjectId(resolvedActiveProjectId)

    setView("projects")

    applyPreferences(preferences, {
      setPalette, setCustomPaletteBackground, setCustomPaletteAccent,
      setDisplayFont, setBodyFont, setUiFont, setFontSize, setIsWordCountEnabled,
      setIsMenuBarEnabled, setIsFlagsEnabled, setIsTranslucentNavPanel,
    })

    setBookCounter(typeof uiSettings?.bookCounter === "number" ? uiSettings.bookCounter : extractCounterFromNames(projectList, "Book"))
  }

  useEffect(() => {
    let cancelled = false

    const bootstrapSession = async () => {
      if (!session) {
        setIsAuthBootstrapping(false)
        setIsWorkspaceHydrated(false)
        setAuthLoadError("")
        return
      }

      try {
        await hydrateWorkspace(session.token, () => cancelled)
        if (cancelled) return
        setIsWorkspaceHydrated(true)
        setAuthLoadError("")
      } catch (error) {
        if (cancelled) return
        const message = error instanceof Error ? error.message : "Workspace load failed"

        if (message.includes("[401]") || message.toLowerCase().includes("unauthorized")) {
          onAuthFailure("Your session expired. Please log in again.")
        } else {
          const fallbackProject = createProject("Book 1", "Book")
          setProjects([fallbackProject])
          setProjectDocumentMap({})
          setFolders([])
          setActiveProjectId(fallbackProject.id)
          setView("projects")
          setBookCounter(2)
          setIsWorkspaceHydrated(true)
          setAuthLoadError("")
        }
      } finally {
        if (!cancelled) setIsAuthBootstrapping(false)
      }
    }

    void bootstrapSession()
    return () => { cancelled = true }
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

    const pollRemoteUpdates = async () => {
      if (isSyncingRef.current) return
      try {
        const [ownedDocs, sharedEntries] = await Promise.all([
          getDocuments(session.token),
          getSharedWithMe(session.token),
        ])

        const remoteProjectUpdates = new Map<string, { project: Project; documentId: string }>()
        const nextSharedDocumentIds = new Set<string>()

        for (const doc of ownedDocs) {
          if (doc.metadata?.recordType !== PROJECT_RECORD_TYPE) continue
          const project = parseProjectFromDocument(doc)
          if (!project) continue
          remoteProjectUpdates.set(project.id, {
            project: { ...project, source: "cloud" },
            documentId: doc.id,
          })
        }

        for (const entry of sharedEntries) {
          if (!entry.document || !entry.document.content) continue
          const sharedProject = parseProjectFromDocument(entry.document)
          if (!sharedProject) continue
          nextSharedDocumentIds.add(entry.document.id)
          remoteProjectUpdates.set(sharedProject.id, {
            project: { ...sharedProject, source: "cloud" },
            documentId: entry.document.id,
          })
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

              const localContent = JSON.stringify({ ...p, activeId: null })
              const lastPushed = lastPushedContentRef.current.get(p.id)
              const hasLocalEdits = lastPushed != null && localContent !== lastPushed

              if (hasLocalEdits) {
                return p
              }

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
              if (shredProjectIdsRef.current.has(projectId)) continue
              if (current[projectId] !== documentId) {
                additions[projectId] = documentId
              }
            }
            return Object.keys(additions).length > 0 ? { ...current, ...additions } : current
          })
        }
      } catch {
      }
    }

    const intervalId = window.setInterval(pollRemoteUpdates, 3000)
    return () => window.clearInterval(intervalId)
  }, [session, isWorkspaceHydrated])

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
              const lastPushed = lastPushedContentRef.current.get(project.id)
              if (lastPushed != null && contentForComparison === lastPushed) {
                nextDocumentMap[project.id] = existingDocumentId
                continue
              }

              try {
                await updateDocument(session.token, existingDocumentId, payload)
                lastPushedContentRef.current.set(project.id, contentForComparison)
              } catch {
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
            shredProjectIdsRef.current.delete(projectId)
          }

          for (const shredId of shredProjectIdsRef.current) {
            if (!remoteByProjectId.has(shredId)) {
              shredProjectIdsRef.current.delete(shredId)
            }
          }

          setProjectDocumentMap(nextDocumentMap)

          const sharedEntries = await getSharedWithMe(session.token)

          const nextSharedDocumentIds = new Set<string>()
          const sharedProjectUpdates = new Map<string, { project: Project; documentId: string }>()

          for (const entry of sharedEntries) {
            if (!entry.document || !entry.document.content) continue
            const sharedProject = parseProjectFromDocument(entry.document)
            if (!sharedProject) continue
            nextSharedDocumentIds.add(entry.document.id)
            sharedProjectUpdates.set(sharedProject.id, {
              project: { ...sharedProject, source: "cloud" },
              documentId: entry.document.id,
            })
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
    const auth = actionSession ?? session
    if (!auth) return

    for (const id of ids) shredProjectIdsRef.current.add(id)

    setProjects((cur) => cur.filter((p) => !ids.has(p.id)))
    setProjectDocumentMap((cur) => {
      const next = { ...cur }
      for (const id of ids) delete next[id]
      return next
    })

    for (const projectId of ids) {
      const shareId = shareIdByProjectIdRef.current.get(projectId)
      if (shareId) {
        try {
          await leaveShare(auth.token, shareId)
        } catch (err) {
          console.error("[shred] leaveShare failed for", projectId, err)
        }
        shareIdByProjectIdRef.current.delete(projectId)
      } else {
        const documentId = projectDocumentMap[projectId]
        if (documentId) {
          try {
            await deleteDocument(auth.token, documentId)
          } catch (err) {
            console.error("[shred] deleteDocument failed for", projectId, err)
          }
        }
      }
      shredProjectIdsRef.current.delete(projectId)
    }
  }

  return { sharedDocumentIdsRef, shareIdByProjectIdRef, ownerEmailByProjectIdRef, permanentlyDeleteProjects }
}
