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
  const promotedIdsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!isWorkspaceHydrated) {
      promotedIdsRef.current = new Set()
    }
  }, [isWorkspaceHydrated])

  useEffect(() => {
    if (!isLocalMode || !isWorkspaceHydrated || !localFsHandle) return

    const cloudConfirmed = new Set<string>()
    for (const p of projects) {
      if (p.source === "cloud") cloudConfirmed.add(p.id)
    }

    const candidates: Project[] = []
    for (const p of projects) {
      if (p.source !== "local") continue
      if (promotedIdsRef.current.has(p.id)) continue
      if (!projectDocumentMap[p.id]) continue
      if (!cloudConfirmed.has(p.id)) continue
      candidates.push(p)
    }

    if (candidates.length === 0) return

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

      const promotedSet = new Set(promotedIds)
      setProjects((cur) =>
        cur.filter((p) => !(p.source === "local" && promotedSet.has(p.id))),
      )
    })()
  }, [projects, projectDocumentMap, isLocalMode, isWorkspaceHydrated, localFsHandle, setProjects])
}
