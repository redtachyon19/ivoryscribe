// useCloudProjectsInLocalMode — pulls the signed-in user's cloud
// Documents into the Library while running in *local* mode, autosaves
// edits to those cloud projects back to the API, and surfaces share
// metadata so the Library can show the right chip.
//
// Mental model:
//   • Local mode means the user has chosen a workspace folder on disk.
//   • `useLocalFilesystemSync` populates `projects[]` from disk, tagged
//     `source: "local"`.
//   • This hook *also* fetches cloud Documents (owned + shared-with-me)
//     and merges them into the same `projects[]`, tagged
//     `source: "cloud"`. Cloud and local projects never collide
//     because the new model forbids a project from existing in both.
//   • When a cloud project's content changes (the editor writes via
//     `onProjectChange` → `setProjects`), this hook debounces a push
//     to the cloud API. The local sync ignores cloud projects
//     entirely (gated on `source === "local"`), so nothing about a
//     cloud project ever lands on disk.
//
// What this hook is NOT:
//   • A general cloud-mode sync engine. `useWorkspaceHydration` owns
//     that for cloud mode and runs gated off in local mode — calling
//     it here would also push *local* projects to the cloud, i.e. the
//     dual-state cache we're tearing out.
//   • A cache. Going offline / signing out removes cloud projects
//     from the Library (they need the network to load *and* edit).

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react"
import { getDocuments, getSharedWithMe, updateDocument } from "../api"
import type { UserSession } from "../state/session"
import { PROJECT_RECORD_TYPE } from "../state/versioning"
import { parseProjectFromDocument, type Project } from "../utils/projects"

type Params = {
  session: UserSession | null
  isLocalMode: boolean
  projects: Project[]
  setProjects: Dispatch<SetStateAction<Project[]>>
  /** Same global state useWorkspaceHydration writes to in cloud mode.
   *  We merge our cloud-doc ids in via a functional update so the
   *  local-sync writes (which only carry legacy local cloud-ids during
   *  the dual-state transition) don't clobber us, and vice versa. */
  setProjectDocumentMap?: Dispatch<SetStateAction<Record<string, string>>>
}

export type CloudInLocalShareInfo = {
  /** Project IDs that are currently shared (with us or by us). Drives
   *  the Users chip in the project card. */
  sharedProjectIds: Set<string>
  /** For projects shared *with* the current user, the email of the
   *  owner. Surfaced in the share UI. */
  ownerEmailByProjectId: Map<string, string>
}

const AUTOSAVE_DEBOUNCE_MS = 1500

export function useCloudProjectsInLocalMode({
  session,
  isLocalMode,
  projects,
  setProjects,
  setProjectDocumentMap,
}: Params): CloudInLocalShareInfo {
  const token = session?.token ?? null

  // Output share-metadata via state so the orchestration can pick it
  // up and forward to Library. Refs would be invisible to render.
  const [shareInfo, setShareInfo] = useState<CloudInLocalShareInfo>({
    sharedProjectIds: new Set(),
    ownerEmailByProjectId: new Map(),
  })

  // Per-project cloud-document id (projectId → cloud Document.id). The
  // autosave loop needs this to know which doc to PUT to. Populated by
  // the fetch effect, used by the autosave effect.
  const docIdByProjectRef = useRef<Map<string, string>>(new Map())
  // JSON of {…project, activeId: null} that we last successfully
  // pushed. Used to skip no-op autosaves (cursor moves shouldn't
  // round-trip to the cloud).
  const lastPushedRef = useRef<Map<string, string>>(new Map())
  // Per-project pending push timer.
  const saveTimersRef = useRef<Map<string, number>>(new Map())

  // ── Fetch + merge effect ──────────────────────────────────────────
  useEffect(() => {
    // Not eligible to display cloud projects: strip them out and clear
    // our tracking maps so a future re-entry starts fresh.
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
      setShareInfo({ sharedProjectIds: new Set(), ownerEmailByProjectId: new Map() })
      return
    }

    let cancelled = false
    void (async () => {
      try {
        // Fetch owned + shared documents in parallel — both are cloud
        // projects from our perspective and both go into projects[].
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

        // Owned cloud documents
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

        // Shared-with-me cloud documents. Don't double-add anything we
        // already see in the owned list (shouldn't happen, but the
        // cloud-mode hydration has the same guard).
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
          }
        }

        if (cancelled) return

        // Replace cloud entries wholesale (the cloud API just told us
        // the canonical list), keep all local projects exactly as
        // they are. Local sync owns local projects.
        setProjects((cur) => {
          const local = cur.filter((p) => p.source !== "cloud")
          return [...local, ...cloudProjects]
        })

        // Seed the "what did we last push?" map so the very next edit
        // (and not the initial load) is what triggers an autosave.
        const nextLastPushed = new Map<string, string>()
        for (const project of cloudProjects) {
          nextLastPushed.set(project.id, JSON.stringify({ ...project, activeId: null }))
        }
        lastPushedRef.current = nextLastPushed
        docIdByProjectRef.current = nextDocIdByProject

        // Merge our document ids into the global map. Functional
        // update so local-sync's writes (legacy cloud-id stamping from
        // old on-disk files) don't blow us away, and we don't blow
        // them away either.
        if (setProjectDocumentMap) {
          setProjectDocumentMap((prev) => ({ ...prev, ...nextDocumentMap }))
        }
        setShareInfo({
          sharedProjectIds: nextSharedProjectIds,
          ownerEmailByProjectId: nextOwnerEmailByProject,
        })
      } catch (err) {
        console.warn("[useCloudProjectsInLocalMode] cloud fetch failed:", err)
      }
    })()

    return () => { cancelled = true }
  }, [token, isLocalMode, setProjects, setProjectDocumentMap])

  // ── Autosave effect: push edits to cloud projects up to the API ───
  //
  // Runs whenever React state changes. For each cloud project, compare
  // its current JSON-without-activeId to the last-pushed JSON; if
  // different, debounce-push via updateDocument. activeId is stripped
  // so cursor movement alone doesn't round-trip.
  useEffect(() => {
    if (!isLocalMode || !token) return
    const docIds = docIdByProjectRef.current
    const lastPushed = lastPushedRef.current
    const saveTimers = saveTimersRef.current

    for (const project of projects) {
      if (project.source !== "cloud") continue
      const docId = docIds.get(project.id)
      if (!docId) continue // not yet known (initial fetch in flight)

      const contentForComparison = JSON.stringify({ ...project, activeId: null })
      if (lastPushed.get(project.id) === contentForComparison) continue

      // Replace any in-flight pending timer for this project.
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
            // 403 happens for shared docs with view-only permission —
            // expected. Anything else is a network error we'll retry
            // on the next edit. We deliberately don't roll back local
            // state; the user's draft stays in memory.
            console.warn("[cloud autosave] failed for", project.id, err)
          })
      }, AUTOSAVE_DEBOUNCE_MS)
      saveTimers.set(project.id, timer)
    }
  }, [projects, token, isLocalMode])

  // Cleanup any pending timers on unmount so we don't fire a push
  // after the component has gone away.
  useEffect(() => {
    return () => {
      for (const timer of saveTimersRef.current.values()) {
        window.clearTimeout(timer)
      }
      saveTimersRef.current.clear()
    }
  }, [])

  return shareInfo
}
