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
import { withEmojiFontFallback } from "../utils/appearance"

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

// ── HTML helpers shared by the popup builders ─────────────────────────────

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

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

// ── Single-version preview popup ─────────────────────────────────────────

export function buildVersionPreviewHtml(params: {
  version: ProjectVersion
  bodyFont: string
  projectId: string
}): string {
  const { version, bodyFont, projectId } = params
  const resolvedBodyFont = withEmojiFontFallback(bodyFont)
  const snapshot = parseVersionSnapshot(version.snapshot)
  const projectName = snapshot?.name ?? "(unreadable snapshot)"
  const activeDocumentTitle = snapshot
    ? ((snapshot.activeId ? findTabTitleById(snapshot.tabs, snapshot.activeId) : null) ?? "Untitled Entry")
    : "Untitled Entry"
  const activeDocumentPreview = snapshot?.activeId
    ? stripHtmlPreview(snapshot.contentById[snapshot.activeId] ?? "")
    : ""

  // Match the history list popup: title = project name as it was at save
  // time; metadata line carries the "Manual II" / "Auto Save 3" tag.
  const kindLabel = version.kind === "manual" ? `Manual ${version.label}` : `Auto Save ${version.label}`

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(projectName)} - ${escapeHtml(kindLabel)}</title>
    <style>
      body { margin: 0; padding: 24px; font-family: ${resolvedBodyFont}; background: #101113; color: #ececec; }
      .wrap { max-width: 860px; margin: 0 auto; }
      h1 { margin: 0 0 8px; font-weight: 400; font-size: 36px; }
      .meta { margin: 0; color: #b6bcc8; font-size: 15px; }
      .card { margin-top: 20px; border: 1px solid #313642; border-radius: 12px; padding: 14px; background: #171a21; }
      h2 { margin: 0 0 10px; font-weight: 400; font-size: 24px; }
      p { margin: 0; color: #dde3ee; line-height: 1.45; white-space: pre-wrap; }
      .actions { margin-top: 14px; display: flex; gap: 10px; flex-wrap: wrap; }
      .btn { border: 1px solid #3e4555; border-radius: 8px; background: #1f2531; color: #e9edf5; padding: 8px 12px; font-size: 15px; cursor: pointer; }
      .btn:hover { background: #273043; }
      .status { margin-top: 10px; color: #9bb6ff; font-size: 14px; min-height: 1.2em; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <h1>${escapeHtml(projectName)}</h1>
      <p class="meta">${escapeHtml(kindLabel)} &middot; ${escapeHtml(formatVersionTimestamp(version.savedAt))}</p>
      <div class="actions">
        <button id="restoreBtn" class="btn" type="button">Restore Version</button>
        <button id="duplicateBtn" class="btn" type="button">Add Copy to Library</button>
      </div>
      <p id="actionStatus" class="status"></p>
      <div class="card">
        <h2>${escapeHtml(activeDocumentTitle)}</h2>
        <p>${escapeHtml(activeDocumentPreview || "No preview content available for this entry.")}</p>
      </div>
    </div>
    <script>
      (function () {
        var projectId = ${JSON.stringify(projectId)};
        var versionId = ${JSON.stringify(version.id)};
        var status = document.getElementById("actionStatus");

        function sendAction(action) {
          if (!window.opener) {
            if (status) {
              status.textContent = "This tab is detached from the app window. Open from version history to enable actions.";
            }
            return;
          }

          window.opener.postMessage(
            {
              type: "ivory:version-action",
              action: action,
              projectId: projectId,
              versionId: versionId,
            },
            window.location.origin,
          );

          if (status) {
            status.textContent = action === "restore"
              ? "Restore request sent to app window."
              : "Duplicate request sent to app window.";
          }
        }

        var restoreBtn = document.getElementById("restoreBtn");
        var duplicateBtn = document.getElementById("duplicateBtn");

        if (restoreBtn) {
          restoreBtn.addEventListener("click", function () {
            sendAction("restore");
          });
        }

        if (duplicateBtn) {
          duplicateBtn.addEventListener("click", function () {
            sendAction("duplicate");
          });
        }
      })();
    </script>
  </body>
</html>`
}

// The full version-history page used to be built as a standalone HTML blob
// here (≈250 lines of inlined CSS/JS that the orchestration opened in a
// new tab). That detached page never picked up theme changes from the
// settings panel because each blob was a one-shot snapshot.
//
// The replacement is the in-app React modal at
// webapp/components/version-history/VersionHistory.tsx — same data, same
// actions, but living inside the React tree so the app's CSS variables
// flow through naturally. The `buildVersionPreviewHtml` above is still
// used for the per-version "Open in New Window" action because that
// genuinely benefits from being a separate browser window.
