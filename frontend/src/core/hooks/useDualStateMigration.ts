// useDualStateMigration — one-time per-session sweep that retires the
// legacy dual-state model (local file with embedded `cloud-id` stamp,
// kept in lockstep with a cloud Document via cloudOverlay).
//
// New model: a project lives in exactly one place — local OR cloud,
// never both. For every project that the legacy model kept as "local
// file + cloud backup", this hook trashes the local file and lets the
// cloud copy take over.
//
// Safety properties:
//   • Only acts on projects with `source: "local"` whose on-disk file
//     has an embedded cloud-id (visible via `projectDocumentMap[id]`).
//   • Only acts *after* the cloud fetch has independently confirmed
//     that a matching cloud Document exists for that project id and
//     is accessible to the current user. If the cloud copy isn't
//     visible (no network, doc deleted, lost permissions), the local
//     file stays intact and the project remains local.
//   • Promotes via `LocalFilesystemHandle.promoteLocalProjectToCloud`,
//     which moves the file to the system Trash — recoverable for ~30
//     days on macOS via Finder → Trash → Put Back.
//   • Idempotent within a session: a ref tracks which project ids we
//     already promoted, so a re-render of `projects` doesn't re-run.
//
// We deliberately do NOT push local content to cloud before trashing.
// The legacy `cloudOverlay` already pushed on every save, so the
// cloud copy should be at least as fresh as the local one. If a user
// wants to be sure, they can do "Move to Cloud" explicitly *before*
// closing/relaunching the app; that path uploads and then trashes.

import { useEffect, useRef, type Dispatch, type SetStateAction } from "react"
import type { LocalFilesystemHandle } from "../localFiles/useLocalFilesystemSync"
import type { Project } from "../utils/projects"

type Params = {
  isLocalMode: boolean
  isWorkspaceHydrated: boolean
  projects: Project[]
  projectDocumentMap: Record<string, string>
  localFsHandle: LocalFilesystemHandle | null
  setProjects: Dispatch<SetStateAction<Project[]>>
}

export function useDualStateMigration({
  isLocalMode,
  isWorkspaceHydrated,
  projects,
  projectDocumentMap,
  localFsHandle,
  setProjects,
}: Params) {
  // Project ids we've already promoted (or attempted to) in this
  // session — guards against re-running on every render. Reset only
  // when the workspace is re-hydrated (root change) so a fresh disk
  // scan can find new dual-state files.
  const promotedIdsRef = useRef<Set<string>>(new Set())

  // Reset the in-session tracker when hydration toggles off — that
  // happens on root changes and signals "the world just changed,
  // start over."
  useEffect(() => {
    if (!isWorkspaceHydrated) {
      promotedIdsRef.current = new Set()
    }
  }, [isWorkspaceHydrated])

  useEffect(() => {
    if (!isLocalMode || !isWorkspaceHydrated || !localFsHandle) return

    // Build the set of project ids that the cloud fetch has confirmed
    // are reachable. If a candidate's id isn't in here, we don't
    // touch its local file — we can't prove the cloud copy is safe.
    const cloudConfirmed = new Set<string>()
    for (const p of projects) {
      if (p.source === "cloud") cloudConfirmed.add(p.id)
    }

    const candidates: Project[] = []
    for (const p of projects) {
      if (p.source !== "local") continue
      if (promotedIdsRef.current.has(p.id)) continue
      // The on-disk file must have had an embedded cloud-id at hydrate
      // time. `projectDocumentMap` is populated by the local-sync
      // hydrate (legacy path) and the cloud-fetch hook (new path);
      // either way, having an entry means a cloud Document exists.
      if (!projectDocumentMap[p.id]) continue
      // And the cloud fetch must have confirmed the cloud doc is
      // visible to *this* user (we own it or it's shared with us).
      if (!cloudConfirmed.has(p.id)) continue
      candidates.push(p)
    }

    if (candidates.length === 0) return

    // Claim them up front so a second render doesn't re-attempt the
    // same ones while the trash IPC is in flight.
    for (const c of candidates) {
      promotedIdsRef.current.add(c.id)
    }

    void (async () => {
      const promotedIds: string[] = []
      for (const c of candidates) {
        const filePath = localFsHandle.getFilePathForProject(c.id)
        try {
          const trashed = await localFsHandle.promoteLocalProjectToCloud(c.id)
          if (trashed) {
            promotedIds.push(c.id)
            console.log(
              `[migration] promoted "${c.name}" (${c.id}) to cloud; trashed ${filePath}`,
            )
          }
        } catch (err) {
          console.error(`[migration] failed to trash local file for ${c.id}:`, err)
        }
      }

      if (promotedIds.length === 0) return

      // Drop the local entries from state. Their cloud twins (already
      // in state with the same ids, tagged source: "cloud") take over
      // the slot in the Library and the editor.
      const promotedSet = new Set(promotedIds)
      setProjects((cur) =>
        cur.filter((p) => !(p.source === "local" && promotedSet.has(p.id))),
      )
    })()
  }, [projects, projectDocumentMap, isLocalMode, isWorkspaceHydrated, localFsHandle, setProjects])
}
