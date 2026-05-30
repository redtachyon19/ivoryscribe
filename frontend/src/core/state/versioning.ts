// Project versioning — UI + persistence helpers.
//
// Versions now live *inside* the project (and therefore inside the .tusk /
// .tusks file on disk, or the cloud Document content blob). The ProjectVersion
// type itself moved to core/utils/projects.ts so it can be referenced from
// the on-disk type schema in localFiles/types.ts without a circular import.
//
// What stays in this module:
//   • Cloud Document payload builder (the project as a whole still ships as
//     one Document; versions roundtrip inside its content).
//   • Sort + restore helpers operating on the new ProjectVersion shape.
//   • Settings-panel adapter and the two popup HTML page builders.
//   • Palette helpers used by those popups for theming.
//
// What got removed (compared to the pre-refactor file):
//   • PROJECT_VERSION_RECORD_TYPE and parseProjectVersion — versions are
//     no longer separate cloud Documents.
//   • buildProjectVersionPayload — same.
//   • The character-delta autosave planner (planAutosaveVersion,
//     getNextManualVersionDefinition, getInitialManualVersionDefinition).
//     Autosave triggers on word-count delta now, not character delta;
//     manual/autosave labels are generated in projects.ts.
//   • ProjectVersionDefinition (no longer needed; createProjectVersion
//     produces a ProjectVersion directly).

import {
  collectTabTitles,
  findTabTitleById,
  normalizeProjectAfterTabs,
  type Project,
  type ProjectKind,
  type ProjectVersion,
  type ProjectVersionKind,
} from "../utils/projects"

// The discriminator on a cloud Document record that identifies it as the
// canonical record for a project (vs other record types we may add later).
// Version records are NOT a separate type any more — they're embedded in
// the project Document's content. This constant is still imported by
// useWorkspaceHydration and useCloudProjectsInLocalMode for filtering the
// generic Documents list.
export const PROJECT_RECORD_TYPE = "ivory-project"

// Re-export the version types so existing call sites that imported them
// from this module keep compiling. New code should import directly from
// core/utils/projects.
export type { ProjectVersion, ProjectVersionKind } from "../utils/projects"

// The palette-to-hex lookup (`PALETTE_THEMES` + `resolveThemeForPalette`)
// that used to live here was only consumed by the standalone HTML popup —
// it baked a snapshot of the user's theme into the page so that detached
// page could render. The in-app modal that replaces it inherits the
// app's CSS variables directly, so neither helper is needed anymore.

// ── Cloud Document payload (project as a whole) ───────────────────────────

/** JSON-stringify a Project (including its embedded versions). Used as the
 *  cloud Document's `content` payload. */
export function serializeProjectSnapshot(project: Project): string {
  return JSON.stringify(project)
}

/** Builds the cloud Document payload representing a Project. The project's
 *  versions ride inside `content` automatically (they're part of the Project
 *  shape). Callers don't need to issue separate version uploads any more —
 *  the unified versioning hook just edits the project and the next push
 *  carries the new history. */
export function buildProjectDocumentPayload(project: Project) {
  return {
    title: project.name,
    content: serializeProjectSnapshot(project),
    metadata: {
      recordType: PROJECT_RECORD_TYPE,
      projectId: project.id,
    },
    theme: {
      projectColor: project.color,
    },
  }
}

// ── Sort + restore helpers ────────────────────────────────────────────────

/** Newest-first comparator. Ties (same savedAt to the millisecond) fall back
 *  to the version id so the sort is deterministic. */
export function compareProjectVersions(a: ProjectVersion, b: ProjectVersion): number {
  const aTime = Date.parse(a.savedAt)
  const bTime = Date.parse(b.savedAt)
  if (aTime !== bTime) return bTime - aTime
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0
}

export function sortProjectVersionsDesc(versions: ReadonlyArray<ProjectVersion>): ProjectVersion[] {
  return [...versions].sort(compareProjectVersions)
}

/** Restore a `snapshot` (a parsed Project, already JSON-parsed by the caller)
 *  into the currently-mounted `currentProject`. We preserve id / createdAt /
 *  folderId / rootPosition / versions so the project keeps its identity and
 *  its history doesn't get clobbered by the restore — the user wants to roll
 *  *content* back, not erase the trail that got them here. */
export function restoreProjectFromVersion(currentProject: Project, snapshot: Project): Project {
  const restoredProject: Project = {
    ...currentProject,
    ...snapshot,
    id: currentProject.id,
    createdAt: currentProject.createdAt,
    folderId: currentProject.folderId,
    rootPosition: currentProject.rootPosition,
    // Restoring an older snapshot must not nuke later history. The snapshot
    // payload doesn't carry a versions array (createProjectVersion strips
    // it before serializing) but be defensive.
    versions: currentProject.versions,
  }

  return normalizeProjectAfterTabs(restoredProject, snapshot.tabs)
}

/** Parse a version's stored JSON snapshot back into a Project. Returns null
 *  if the payload is malformed (corrupt file, future-format snapshot) —
 *  callers surface that as "this version can't be opened" rather than
 *  throwing. */
export function parseVersionSnapshot(serialized: string): Project | null {
  try {
    const parsed = JSON.parse(serialized) as Project
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.tabs)) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

// ── Version display helpers ───────────────────────────────────────────────

export function formatVersionTimestamp(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return "Unknown save time"
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed)
}

export function stripHtmlPreview(value: string): string {
  if (!value) return ""

  if (typeof window === "undefined") {
    return value.slice(0, 280)
  }

  const text = new DOMParser().parseFromString(value, "text/html").body.textContent ?? ""
  return text.replace(/\s+/g, " ").trim().slice(0, 280)
}

// ── Settings-panel adapter ────────────────────────────────────────────────

export type VersionSettingsEntry = {
  id: string
  /** Display label — roman numeral for manual, arabic for autosave. */
  label: string
  /** Reused field name from the previous shape. Maps 1:1 onto the new
   *  ProjectVersionKind union; the UI uses it to pick badge styling. */
  saveKind: ProjectVersionKind
  /** ISO timestamp. The settings UI imports formatVersionTimestamp to render. */
  createdAt: string
  /** Word count at save time — used in place of the old changedCharacters
   *  delta so the preview row has something tangible to show. */
  wordCount: number
  preview: {
    projectName: string
    projectKind: ProjectKind
    entryCount: number
    activeDocumentTitle: string
    activeDocumentPreview: string
  }
}

/** Build a UI-facing summary for each version. Parses the snapshot JSON on
 *  the fly — fine because the settings panel renders this once per open
 *  and the version list is short. */
export function mapVersionsForSettings(versions: ReadonlyArray<ProjectVersion>): VersionSettingsEntry[] {
  return versions.map((version) => {
    const snapshot = parseVersionSnapshot(version.snapshot)
    if (!snapshot) {
      // Corrupt snapshot — render a degraded entry rather than dropping the
      // row entirely so the user can still see *something* and (manually,
      // outside the app) recover the file.
      return {
        id: version.id,
        label: version.label,
        saveKind: version.kind,
        createdAt: version.savedAt,
        wordCount: version.wordCount,
        preview: {
          projectName: "(unreadable snapshot)",
          projectKind: "Book",
          entryCount: 0,
          activeDocumentTitle: "(unreadable snapshot)",
          activeDocumentPreview: "This version's payload couldn't be parsed.",
        },
      }
    }

    const tabTitles = collectTabTitles(snapshot.tabs)
    const activeDocumentTitle =
      (snapshot.activeId ? findTabTitleById(snapshot.tabs, snapshot.activeId) : null) ??
      tabTitles[0] ??
      "Untitled Entry"
    const activeDocumentPreview =
      (snapshot.activeId ? stripHtmlPreview(snapshot.contentById[snapshot.activeId] ?? "") : "") ||
      stripHtmlPreview(snapshot.contentById[Object.keys(snapshot.contentById)[0] ?? ""] ?? "")

    return {
      id: version.id,
      label: version.label,
      saveKind: version.kind,
      createdAt: version.savedAt,
      wordCount: version.wordCount,
      preview: {
        projectName: snapshot.name,
        projectKind: snapshot.kind,
        entryCount: tabTitles.length,
        activeDocumentTitle,
        activeDocumentPreview,
      },
    }
  })
}

// ── Single-version preview window ────────────────────────────────────────

/** Payload handed from the main window to the standalone version-preview
 *  window via localStorage (keyed by version id). The preview reads it once
 *  and clears the key on mount. */
export type VersionPreviewHandoff = {
  version: ProjectVersion
  projectId: string
  projectName: string
}

/** Open the read-only single-version view in its own window. Instead of a
 *  detached HTML blob, this stashes the version in localStorage and opens the
 *  real in-app `/version-preview` route, so that window inherits the app
 *  palette and reuses the real Find & Replace modal + toolbar
 *  (see webapp/pages/VersionPreviewPage.tsx). */
export function openVersionPreviewWindow(
  version: ProjectVersion,
  projectId: string,
  projectName: string,
): void {
  if (typeof window === "undefined") return
  const key = `ivoryscribe.version-preview.${version.id}`
  try {
    window.localStorage.setItem(
      key,
      JSON.stringify({ version, projectId, projectName } satisfies VersionPreviewHandoff),
    )
  } catch {
    // localStorage may be unavailable / full — still open the window; it will
    // render its "unavailable" state.
  }
  window.open(`${window.location.origin}/version-preview?key=${encodeURIComponent(key)}`, "_blank")
}
