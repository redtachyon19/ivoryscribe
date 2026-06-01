// Unified project versioning hook.
//
// Versions now live inside the project itself (and therefore inside the
// .tusk / .tusks file on disk, or the cloud Document blob). This hook is
// no longer responsible for any cloud Document writes — the project Document
// upload that already happens for cloud projects carries the embedded
// versions along for free, and the local FS sync writes them into the
// .tusk / .tusks file via the codec.
//
// Triggers:
//   • Manual save (File > Save Version, fires APP_SAVE_PROJECT_VERSION_EVENT):
//     push a manual version (label = next roman numeral) onto the active
//     project.
//   • Autosave: after every projects[] state change, diff current word count
//     against the most recent version's word count. If the delta crosses
//     AUTOSAVE_WORD_DELTA, push an autosave version (label = next arabic).
//
// Restore / duplicate replay the snapshot JSON stored on the version back
// into projects[].
//
// Markdown / PlainText / PDF / Image projects don't carry versions (gated
// via projectKindSupportsVersions). Markdown and PlainText are single-file
// edits where the user chose against history; PDF/Image/Unknown are read-
// only and have no editable content to snapshot.

import {
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
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

type VersionActionMessage = {
  type: "ivory:version-action"
  action: "restore" | "duplicate"
  projectId: string
  versionId: string
}

type UseProjectVersioningParams = {
  /** Current projects[]. Used to diff word counts and to find the active
   *  project on event handlers. */
  projects: Project[]
  /** Setter for projects[]. The hook pushes versions onto a project by
   *  cloning it through this setter — no separate version-store state. */
  setProjects: Dispatch<SetStateAction<Project[]>>
  /** Ref tracking the active project so the manual-save event handler can
   *  read it without re-subscribing on every render. */
  activeProjectRef: MutableRefObject<Project | null>
  /** Gate: skip everything until the workspace finished hydrating. Before
   *  hydration projects[] may be a transient placeholder we don't want to
   *  snapshot. */
  isWorkspaceHydrated: boolean
  /** Orchestrator-owned: apply a restored snapshot into projects[]. Returns
   *  true if the target project still exists. */
  onRestoreVersion: (projectId: string, snapshot: Project) => boolean
  /** Orchestrator-owned: insert a duplicated snapshot as a new project.
   *  Returns the new project id on success. */
  onDuplicateVersion: (snapshot: Project) => string | null
}

/** Internal helper: append `version` to whichever project matches `projectId`
 *  in `setProjects`. Stays out of the public surface — both the manual and
 *  autosave paths go through it. */
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

  // Map keyed by project id → that project's versions array. Derived from
  // projects[] so call sites that read `versioning.projectVersionsByProjectId`
  // keep working unchanged (the orchestration layer feeds it into the
  // settings UI). useMemo keeps the reference stable when no version array
  // actually changed.
  const projectVersionsByProjectId = useMemo<Record<string, ProjectVersion[]>>(() => {
    const next: Record<string, ProjectVersion[]> = {}
    for (const project of projects) {
      next[project.id] = project.versions ?? []
    }
    return next
  }, [projects])

  // Latest snapshot of the version map for event handlers to read without
  // re-subscribing every render.
  const projectVersionsRef = useRef<Record<string, ProjectVersion[]>>({})
  useEffect(() => {
    projectVersionsRef.current = projectVersionsByProjectId
  }, [projectVersionsByProjectId])

  // ── Manual save: File > Save Version ────────────────────────────────────
  useEffect(() => {
    const handleSaveProject = () => {
      // The "Save Project" event is decoupled from versioning in the
      // embedded model — local files autosave through useLocalFilesystemSync,
      // cloud projects sync through useWorkspaceHydration's push effect.
      // Nothing for this hook to do here, but we keep the listener so
      // existing keyboard shortcuts don't 404.
    }

    const handleSaveProjectVersion = () => {
      const currentProject = activeProjectRef.current
      if (!currentProject) return
      // Don't snapshot kinds that have no version slot — silently bail so
      // the menu item / shortcut still appears to "work" without an error.
      if (!projectKindSupportsVersions(currentProject.kind)) return

      const manualVersion = createProjectVersion(currentProject, "manual")
      pushVersionOntoProject(setProjects, currentProject.id, manualVersion)

      if (typeof window !== "undefined") {
        window.alert(`Saved version ${manualVersion.label}.`)
      }
    }

    window.addEventListener(APP_SAVE_PROJECT_EVENT, handleSaveProject)
    window.addEventListener(APP_SAVE_PROJECT_VERSION_EVENT, handleSaveProjectVersion)

    return () => {
      window.removeEventListener(APP_SAVE_PROJECT_EVENT, handleSaveProject)
      window.removeEventListener(APP_SAVE_PROJECT_VERSION_EVENT, handleSaveProjectVersion)
    }
    // activeProjectRef and setProjects are stable refs — no deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Autosave on word-count delta ────────────────────────────────────────
  //
  // We track the word count we last snapshotted for each project. Whenever
  // projects[] changes, we sweep all version-supporting projects and push
  // an autosave if their current word count moved by ≥ AUTOSAVE_WORD_DELTA
  // since the last version. The first non-empty save on a project (i.e.
  // no versions yet) also creates a baseline manual "I" so the user has
  // an anchor.
  //
  // Why ref-tracked baseline counts rather than reading versions[0]?
  // Because two rapid edits in the same tick (a paste followed by a
  // formatting tweak) both run this effect — without the ref, both ticks
  // would see the same versions[] (the setProjects from the first tick
  // hasn't committed yet), each would compute "delta exceeded", and we'd
  // double-snapshot. The ref pinpoints the in-flight commit and prevents
  // the second tick from firing.
  const lastSnapshotWordCountRef = useRef<Map<string, number>>(new Map())

  useEffect(() => {
    if (!isWorkspaceHydrated) return

    for (const project of projects) {
      if (!projectKindSupportsVersions(project.kind)) continue
      if (project.deletedAt) continue
      if (project.archivedAt) continue

      const versions = project.versions ?? []
      const currentWordCount = countProjectWords(project)

      // Baseline: empty version list ⇒ push a manual "I" so the user has a
      // starting point. We also seed lastSnapshotWordCountRef so the next
      // delta is measured from this baseline, not from 0.
      if (versions.length === 0) {
        const baseline = createProjectVersion(project, "manual")
        lastSnapshotWordCountRef.current.set(project.id, baseline.wordCount)
        pushVersionOntoProject(setProjects, project.id, baseline)
        return
      }

      // Word-count delta check. The reference point is the most recent
      // version's wordCount — which is what we just stored in
      // lastSnapshotWordCountRef on the previous commit. Fall back to the
      // versions list if the ref hasn't been seeded yet (first render
      // after hydrate).
      const lastCount =
        lastSnapshotWordCountRef.current.get(project.id) ?? versions[0]?.wordCount ?? 0
      const delta = Math.abs(currentWordCount - lastCount)
      if (delta < AUTOSAVE_WORD_DELTA) continue

      const autosave = createProjectVersion(project, "autosave")
      lastSnapshotWordCountRef.current.set(project.id, autosave.wordCount)
      pushVersionOntoProject(setProjects, project.id, autosave)
      // Only one autosave per sweep — pushing into setProjects re-runs this
      // effect anyway, and snapshotting two projects in the same tick is
      // never urgent enough to justify the complexity.
      return
    }
  }, [projects, isWorkspaceHydrated, setProjects])

  // ── Restore / duplicate (driven by postMessage from the popup) ─────────
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

  // postMessage listener used by the per-version preview window (the
  // /version-preview route opened via the modal's "Open in New Window"
  // toolbar action — see openVersionPreviewWindow). The version-history
  // list itself is in-app, so it doesn't postMessage at all — its buttons
  // call into the modal's props directly. This listener handles the preview
  // window's Restore / Add Copy actions; Export / Delete are handled by the
  // orchestration-level listener.
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
    // restoreVersionIntoProject + duplicateVersionIntoLibrary close over
    // refs that update independently — no deps needed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return {
    projectVersionsByProjectId,
    projectVersionsRef,
    restoreVersionIntoProject,
    duplicateVersionIntoLibrary,
  }
}
