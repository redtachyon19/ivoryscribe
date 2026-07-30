import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react"
import { getDocuments, getSharedWithMe, updateDocument } from "../api"
import type { UserSession } from "../state/session"
import { PROJECT_RECORD_TYPE } from "../state/versioning"
import { parseProjectFromDocument, type Project } from "../utils/projects"

type Params = {
  session: UserSession | null
  isLocalMode: boolean
  projects: Project[]
  setProjects: Dispatch<SetStateAction<Project[]>>
  setProjectDocumentMap?: Dispatch<SetStateAction<Record<string, string>>>
}

export type CloudInLocalShareInfo = {
  sharedProjectIds: Set<string>
  ownerEmailByProjectId: Map<string, string>
  shareIdByProjectId: Map<string, string>
}

const AUTOSAVE_DEBOUNCE_MS = 1500

export function useCloudProjectsInLocalMode({
  session,
  isLocalMode,
  projects,
  setProjects,
  setProjectDocumentMap,
}: Params): CloudInLocalShareInfo & {
  registerCloudProject: (projectId: string, docId: string, project: Project) => void
} {
  const token = session?.token ?? null

  const [shareInfo, setShareInfo] = useState<CloudInLocalShareInfo>({
    sharedProjectIds: new Set(),
    ownerEmailByProjectId: new Map(),
    shareIdByProjectId: new Map(),
  })

  const docIdByProjectRef = useRef<Map<string, string>>(new Map())
  const lastPushedRef = useRef<Map<string, string>>(new Map())
  const saveTimersRef = useRef<Map<string, number>>(new Map())

  useEffect(() => {
    if (!isLocalMode || !token) {
      docIdByProjectRef.current = new Map()
      lastPushedRef.current = new Map()
      for (const timer of saveTimersRef.current.values()) {
        window.clearTimeout(timer)
      }
      saveTimersRef.current = new Map()
      setProjects((cur) => {
        const next = cur.filter((p) => p.source !== "cloud")
        return next.length === cur.length ? cur : next
      })
      setShareInfo({
        sharedProjectIds: new Set(),
        ownerEmailByProjectId: new Map(),
        shareIdByProjectId: new Map(),
      })
      return
    }

    let cancelled = false
    void (async () => {
      try {
        const [docsResult, sharedResult] = await Promise.allSettled([
          getDocuments(token),
          getSharedWithMe(token),
        ])
        if (cancelled) return

        const cloudProjects: Project[] = []
        const nextDocIdByProject = new Map<string, string>()
        const nextDocumentMap: Record<string, string> = {}
        const nextSharedProjectIds = new Set<string>()
        const nextOwnerEmailByProject = new Map<string, string>()
        const nextShareIdByProject = new Map<string, string>()

        if (docsResult.status === "fulfilled") {
          for (const doc of docsResult.value) {
            if (doc.metadata?.recordType !== PROJECT_RECORD_TYPE) continue
            const parsed = parseProjectFromDocument(doc)
            if (!parsed) continue
            cloudProjects.push({ ...parsed, source: "cloud" })
            nextDocIdByProject.set(parsed.id, doc.id)
            nextDocumentMap[parsed.id] = doc.id
          }
        }

        const ownedIds = new Set(cloudProjects.map((p) => p.id))
        if (sharedResult.status === "fulfilled") {
          for (const entry of sharedResult.value) {
            if (!entry.document || !entry.document.content) continue
            const parsed = parseProjectFromDocument(entry.document)
            if (!parsed) continue
            if (!ownedIds.has(parsed.id)) {
              cloudProjects.push({ ...parsed, source: "cloud" })
              nextDocIdByProject.set(parsed.id, entry.document.id)
              nextDocumentMap[parsed.id] = entry.document.id
            }
            nextSharedProjectIds.add(parsed.id)
            nextOwnerEmailByProject.set(parsed.id, entry.owner.email)
            nextShareIdByProject.set(parsed.id, entry.shareId)
          }
        }

        if (cancelled) return

        setProjects((cur) => {
          const local = cur.filter((p) => p.source !== "cloud")
          return [...local, ...cloudProjects]
        })

        const nextLastPushed = new Map<string, string>()
        for (const project of cloudProjects) {
          nextLastPushed.set(project.id, JSON.stringify({ ...project, activeId: null }))
        }
        lastPushedRef.current = nextLastPushed
        docIdByProjectRef.current = nextDocIdByProject

        if (setProjectDocumentMap) {
          setProjectDocumentMap((prev) => ({ ...prev, ...nextDocumentMap }))
        }
        setShareInfo({
          sharedProjectIds: nextSharedProjectIds,
          ownerEmailByProjectId: nextOwnerEmailByProject,
          shareIdByProjectId: nextShareIdByProject,
        })
      } catch (err) {
        console.warn("[useCloudProjectsInLocalMode] cloud fetch failed:", err)
      }
    })()

    return () => { cancelled = true }
  }, [token, isLocalMode, setProjects, setProjectDocumentMap])

  useEffect(() => {
    if (!isLocalMode || !token) return
    const docIds = docIdByProjectRef.current
    const lastPushed = lastPushedRef.current
    const saveTimers = saveTimersRef.current

    for (const project of projects) {
      if (project.source !== "cloud") continue
      const docId = docIds.get(project.id)
      if (!docId) continue

      const contentForComparison = JSON.stringify({ ...project, activeId: null })
      if (lastPushed.get(project.id) === contentForComparison) continue

      const existing = saveTimers.get(project.id)
      if (existing !== undefined) window.clearTimeout(existing)

      const timer = window.setTimeout(() => {
        saveTimers.delete(project.id)
        const contentJson = JSON.stringify(project)
        void updateDocument(token, docId, {
          title: project.name,
          content: contentJson,
          metadata: {
            recordType: PROJECT_RECORD_TYPE,
            projectId: project.id,
          },
          theme: { projectColor: project.color },
        })
          .then(() => {
            lastPushed.set(project.id, contentForComparison)
          })
          .catch((err) => {
            console.warn("[cloud autosave] failed for", project.id, err)
          })
      }, AUTOSAVE_DEBOUNCE_MS)
      saveTimers.set(project.id, timer)
    }
  }, [projects, token, isLocalMode])

  const registerCloudProject = useCallback((projectId: string, docId: string, project: Project) => {
    docIdByProjectRef.current.set(projectId, docId)
    lastPushedRef.current.set(
      projectId,
      JSON.stringify({ ...project, source: "cloud", activeId: null }),
    )
  }, [])

  useEffect(() => {
    return () => {
      for (const timer of saveTimersRef.current.values()) {
        window.clearTimeout(timer)
      }
      saveTimersRef.current.clear()
    }
  }, [])

  return { ...shareInfo, registerCloudProject }
}
