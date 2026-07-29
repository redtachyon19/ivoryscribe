import {
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react"
import {
  AUTOSAVE_WORD_DELTA,
  appendProjectVersion,
  countProjectWords,
  createProjectVersion,
  projectKindSupportsVersions,
  type Project,
  type ProjectVersion,
} from "../utils/projects"
import { APP_SAVE_PROJECT_EVENT, APP_SAVE_PROJECT_VERSION_EVENT } from "../events/editorEvents"
import { emitSaveFlash } from "../events/saveEvents"
import { boardSignature } from "../../webapp/components/editor/utils/pinboardData"

const PRESENTATION_AUTOSAVE_IDLE_MS = 5000
const PRESENTATION_AUTOSAVE_MIN_GAP_MS = 90000

function presentationSignature(project: Project): string {
  return Object.keys(project.contentById)
    .sort()
    .map((id) => boardSignature(project.contentById[id] ?? ""))
    .join("")
}

type VersionActionMessage = {
  type: "ivory:version-action"
  action: "restore" | "duplicate"
  projectId: string
  versionId: string
}

type UseProjectVersioningParams = {
  projects: Project[]
  setProjects: Dispatch<SetStateAction<Project[]>>
  activeProjectRef: MutableRefObject<Project | null>
  isWorkspaceHydrated: boolean
  onRestoreVersion: (projectId: string, snapshot: Project) => boolean
  onDuplicateVersion: (snapshot: Project) => string | null
}

function pushVersionOntoProject(
  setProjects: Dispatch<SetStateAction<Project[]>>,
  projectId: string,
  version: ProjectVersion,
) {
  setProjects((current) =>
    current.map((project) =>
      project.id === projectId ? appendProjectVersion(project, version) : project,
    ),
  )
}

export function useProjectVersioning(params: UseProjectVersioningParams) {
  const {
    projects,
    setProjects,
    activeProjectRef,
    isWorkspaceHydrated,
    onRestoreVersion,
    onDuplicateVersion,
  } = params

  const projectVersionsByProjectId = useMemo<Record<string, ProjectVersion[]>>(() => {
    const next: Record<string, ProjectVersion[]> = {}
    for (const project of projects) {
      next[project.id] = project.versions ?? []
    }
    return next
  }, [projects])

  const projectVersionsRef = useRef<Record<string, ProjectVersion[]>>({})
  useEffect(() => {
    projectVersionsRef.current = projectVersionsByProjectId
  }, [projectVersionsByProjectId])

  useEffect(() => {
    let lastManualSaveAt = 0

    const handleSaveProject = () => {
      const currentProject = activeProjectRef.current
      if (!currentProject) return
      if (!projectKindSupportsVersions(currentProject.kind)) return
      const autosave = createProjectVersion(currentProject, "autosave")
      const latest = currentProject.versions?.[0]
      if (latest && latest.snapshot === autosave.snapshot) return
      pushVersionOntoProject(setProjects, currentProject.id, autosave)
      emitSaveFlash("auto")
    }

    const handleSaveProjectVersion = () => {
      const currentProject = activeProjectRef.current
      if (!currentProject) return
      if (!projectKindSupportsVersions(currentProject.kind)) return
      const now = typeof performance !== "undefined" ? performance.now() : 0
      if (now - lastManualSaveAt < 500) return
      lastManualSaveAt = now

      const manualVersion = createProjectVersion(currentProject, "manual")
      pushVersionOntoProject(setProjects, currentProject.id, manualVersion)

      emitSaveFlash("manual")
    }

    window.addEventListener(APP_SAVE_PROJECT_EVENT, handleSaveProject)
    window.addEventListener(APP_SAVE_PROJECT_VERSION_EVENT, handleSaveProjectVersion)

    return () => {
      window.removeEventListener(APP_SAVE_PROJECT_EVENT, handleSaveProject)
      window.removeEventListener(APP_SAVE_PROJECT_VERSION_EVENT, handleSaveProjectVersion)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const lastSnapshotWordCountRef = useRef<Map<string, number>>(new Map())

  const projectsRef = useRef(projects)
  projectsRef.current = projects
  const lastSnapshotSignatureRef = useRef<Map<string, string>>(new Map())
  const lastAutosaveAtRef = useRef<Map<string, number>>(new Map())
  const presentationTimersRef = useRef<Map<string, number>>(new Map())

  const runPresentationAutosave = useCallback(
    (projectId: string) => {
      presentationTimersRef.current.delete(projectId)
      const project = projectsRef.current.find((p) => p.id === projectId)
      if (!project || project.deletedAt || project.archivedAt) return

      const signature = presentationSignature(project)
      if (signature === lastSnapshotSignatureRef.current.get(projectId)) return

      const now = Date.now()
      const lastAt = lastAutosaveAtRef.current.get(projectId) ?? 0
      const sinceLast = now - lastAt
      if (sinceLast < PRESENTATION_AUTOSAVE_MIN_GAP_MS) {
        const timer = window.setTimeout(
          () => runPresentationAutosave(projectId),
          PRESENTATION_AUTOSAVE_MIN_GAP_MS - sinceLast,
        )
        presentationTimersRef.current.set(projectId, timer)
        return
      }

      const autosave = createProjectVersion(project, "autosave")
      lastSnapshotSignatureRef.current.set(projectId, signature)
      lastAutosaveAtRef.current.set(projectId, now)
      pushVersionOntoProject(setProjects, projectId, autosave)
      emitSaveFlash("auto")
    },
    [setProjects],
  )

  const schedulePresentationAutosave = useCallback(
    (projectId: string) => {
      const existing = presentationTimersRef.current.get(projectId)
      if (existing !== undefined) window.clearTimeout(existing)
      const timer = window.setTimeout(
        () => runPresentationAutosave(projectId),
        PRESENTATION_AUTOSAVE_IDLE_MS,
      )
      presentationTimersRef.current.set(projectId, timer)
    },
    [runPresentationAutosave],
  )

  useEffect(() => {
    const timers = presentationTimersRef.current
    return () => {
      for (const timer of timers.values()) window.clearTimeout(timer)
      timers.clear()
    }
  }, [])

  useEffect(() => {
    if (!isWorkspaceHydrated) return

    for (const project of projects) {
      if (!projectKindSupportsVersions(project.kind)) continue
      if (project.deletedAt) continue
      if (project.archivedAt) continue

      const versions = project.versions ?? []

      if (versions.length === 0) {
        const baseline = createProjectVersion(project, "manual")
        lastSnapshotWordCountRef.current.set(project.id, baseline.wordCount)
        pushVersionOntoProject(setProjects, project.id, baseline)
        return
      }

      if (project.kind === "Presentation") {
        const signature = presentationSignature(project)
        if (!lastSnapshotSignatureRef.current.has(project.id)) {
          lastSnapshotSignatureRef.current.set(project.id, signature)
          continue
        }
        if (signature === lastSnapshotSignatureRef.current.get(project.id)) continue
        schedulePresentationAutosave(project.id)
        continue
      }

      const currentWordCount = countProjectWords(project)
      const lastCount =
        lastSnapshotWordCountRef.current.get(project.id) ?? versions[0]?.wordCount ?? 0
      const delta = Math.abs(currentWordCount - lastCount)
      if (delta < AUTOSAVE_WORD_DELTA) continue

      const autosave = createProjectVersion(project, "autosave")
      lastSnapshotWordCountRef.current.set(project.id, autosave.wordCount)
      pushVersionOntoProject(setProjects, project.id, autosave)
      emitSaveFlash("auto")
      return
    }
  }, [projects, isWorkspaceHydrated, setProjects, schedulePresentationAutosave])

  const restoreVersionIntoProject = (projectId: string, versionId: string): boolean => {
    const selectedVersion = (projectVersionsRef.current[projectId] ?? []).find(
      (version) => version.id === versionId,
    )
    if (!selectedVersion) return false

    let parsedSnapshot: Project
    try {
      parsedSnapshot = JSON.parse(selectedVersion.snapshot) as Project
    } catch {
      return false
    }
    if (!parsedSnapshot || !Array.isArray(parsedSnapshot.tabs)) return false

    return onRestoreVersion(projectId, parsedSnapshot)
  }

  const duplicateVersionIntoLibrary = (projectId: string, versionId: string): boolean => {
    const selectedVersion = (projectVersionsRef.current[projectId] ?? []).find(
      (version) => version.id === versionId,
    )
    if (!selectedVersion) return false

    let parsedSnapshot: Project
    try {
      parsedSnapshot = JSON.parse(selectedVersion.snapshot) as Project
    } catch {
      return false
    }
    if (!parsedSnapshot || !Array.isArray(parsedSnapshot.tabs)) return false

    return onDuplicateVersion(parsedSnapshot) !== null
  }

  useEffect(() => {
    if (typeof window === "undefined") return

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
        restoreVersionIntoProject(message.projectId, message.versionId)
        return
      }

      duplicateVersionIntoLibrary(message.projectId, message.versionId)
    }

    window.addEventListener("message", onVersionActionMessage)
    return () => {
      window.removeEventListener("message", onVersionActionMessage)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return {
    projectVersionsByProjectId,
    projectVersionsRef,
    restoreVersionIntoProject,
    duplicateVersionIntoLibrary,
  }
}
