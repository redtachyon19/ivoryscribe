import { parseProjectFromDocument, normalizeProjectAfterTabs, collectTabTitles, findTabTitleById, type Project, type ProjectKind } from "../utils/projects"
import { withEmojiFontFallback } from "../utils/appearance"

export const PROJECT_RECORD_TYPE = "ivory-project"
export const PROJECT_VERSION_RECORD_TYPE = "ivory-project-version"
export const AUTOSAVE_VERSION_INTERVAL_MS = 90_000

const MIN_AUTOSAVE_CHARACTER_DIFF = 180
const MAJOR_AUTOSAVE_CHARACTER_DIFF = 1400
const MAJOR_AUTOSAVE_CHANGE_RATIO = 0.18

type PaletteTheme = {
  appBg: string
  menuBg: string
  menuButton: string
  menuButtonHoverBg: string
  menuDropdownBg: string
  menuDropdownBorder: string
  appAccent: string
}

const PALETTE_THEMES: Record<string, PaletteTheme> = {
  ivory: { appBg: "#f8f3e3", menuBg: "#efe6cb", menuButton: "#1d170f", menuButtonHoverBg: "#e3d7b5", menuDropdownBg: "#f4ecd5", menuDropdownBorder: "#d2c49f", appAccent: "#9ab8ff" },
  elephant: { appBg: "#121212", menuBg: "#171717", menuButton: "#dfdfdf", menuButtonHoverBg: "#262626", menuDropdownBg: "#1d1d1d", menuDropdownBorder: "#313131", appAccent: "#f4f0ea" },
  midnight: { appBg: "#000000", menuBg: "#000000", menuButton: "#efefef", menuButtonHoverBg: "#121212", menuDropdownBg: "#040404", menuDropdownBorder: "#1f1f1f", appAccent: "#ff306a" },
  sunset: { appBg: "#231715", menuBg: "#32201c", menuButton: "#f9dfcf", menuButtonHoverBg: "#4a3128", menuDropdownBg: "#3b2722", menuDropdownBorder: "#5b3a30", appAccent: "#ffb38a" },
  woodland: { appBg: "#122017", menuBg: "#1b2c20", menuButton: "#deefd5", menuButtonHoverBg: "#2b4130", menuDropdownBg: "#223627", menuDropdownBorder: "#3c5b44", appAccent: "#b58b63" },
  glacier: { appBg: "#0d1a24", menuBg: "#112634", menuButton: "#d5ebf8", menuButtonHoverBg: "#1f3a4b", menuDropdownBg: "#173042", menuDropdownBorder: "#31556a", appAccent: "#ffffff" },
  custom: { appBg: "#0f0f0f", menuBg: "#101010", menuButton: "#d8d8d8", menuButtonHoverBg: "#1d1d1d", menuDropdownBg: "#151515", menuDropdownBorder: "#2a2a2a", appAccent: "#9ab8ff" },
}

export function resolveThemeForPalette(
  palette: string,
  customOverrides?: { customPaletteBackground?: string; customPaletteAccent?: string },
): PaletteTheme {
  const base = PALETTE_THEMES[palette] ?? PALETTE_THEMES.ivory
  if (palette !== "custom" || !customOverrides) {
    return base
  }

  // For custom palette, the real computed values come from useAppStyle mixHexColors logic.
  // We approximate by using the appStyleVariables values the orchestrator already computed.
  // The caller should pass the custom overrides which the orchestration layer has access to.
  return {
    ...base,
    appBg: customOverrides.customPaletteBackground ?? base.appBg,
    appAccent: customOverrides.customPaletteAccent ?? base.appAccent,
  }
}

type DocumentLike = {
  id: string
  title: string
  content: string
  theme: Record<string, unknown>
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export type ProjectVersionSaveKind = "manual" | "autosave"

export type ProjectVersionDefinition = {
  label: string
  saveKind: ProjectVersionSaveKind
  baseManualVersion: number
  minor: number
  patch: number
  changedCharacters: number
}

export type ProjectVersion = ProjectVersionDefinition & {
  id: string
  projectId: string
  createdAt: string
  updatedAt: string
  snapshot: Project
  serializedSnapshot: string
}

export function serializeProjectSnapshot(project: Project) {
  return JSON.stringify(project)
}

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

export function buildProjectVersionPayload(project: Project, definition: ProjectVersionDefinition) {
  return {
    title: `${project.name} Version ${definition.label}`,
    content: serializeProjectSnapshot(project),
    metadata: {
      recordType: PROJECT_VERSION_RECORD_TYPE,
      projectId: project.id,
      versionLabel: definition.label,
      saveKind: definition.saveKind,
      baseManualVersion: definition.baseManualVersion,
      minor: definition.minor,
      patch: definition.patch,
      changedCharacters: definition.changedCharacters,
    },
    theme: {
      projectColor: project.color,
      saveKind: definition.saveKind,
    },
  }
}

export function calculateCharacterDifference(previousValue: string, nextValue: string) {
  if (previousValue === nextValue) {
    return 0
  }

  const sharedLength = Math.min(previousValue.length, nextValue.length)
  let changedCharacters = Math.abs(previousValue.length - nextValue.length)

  for (let index = 0; index < sharedLength; index += 1) {
    if (previousValue[index] !== nextValue[index]) {
      changedCharacters += 1
    }
  }

  return changedCharacters
}

export function compareProjectVersions(a: ProjectVersion, b: ProjectVersion) {
  if (a.baseManualVersion !== b.baseManualVersion) {
    return b.baseManualVersion - a.baseManualVersion
  }

  if (a.minor !== b.minor) {
    return b.minor - a.minor
  }

  if (a.patch !== b.patch) {
    return b.patch - a.patch
  }

  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
}

export function sortProjectVersionsDesc(versions: ProjectVersion[]) {
  return [...versions].sort(compareProjectVersions)
}

export function parseProjectVersion(documentRecord: DocumentLike): ProjectVersion | null {
  if (documentRecord.metadata?.recordType !== PROJECT_VERSION_RECORD_TYPE) {
    return null
  }

  const projectId = typeof documentRecord.metadata?.projectId === "string" ? documentRecord.metadata.projectId : null
  const label = typeof documentRecord.metadata?.versionLabel === "string" ? documentRecord.metadata.versionLabel : null
  const saveKind = documentRecord.metadata?.saveKind === "manual" ? "manual" : documentRecord.metadata?.saveKind === "autosave" ? "autosave" : null
  const baseManualVersion =
    typeof documentRecord.metadata?.baseManualVersion === "number" ? documentRecord.metadata.baseManualVersion : null
  const minor = typeof documentRecord.metadata?.minor === "number" ? documentRecord.metadata.minor : null
  const patch = typeof documentRecord.metadata?.patch === "number" ? documentRecord.metadata.patch : null
  const changedCharacters =
    typeof documentRecord.metadata?.changedCharacters === "number" ? documentRecord.metadata.changedCharacters : 0

  if (!projectId || !label || !saveKind || baseManualVersion === null || minor === null || patch === null) {
    return null
  }

  const parsedSnapshot = parseProjectFromDocument({
    title: documentRecord.title,
    content: documentRecord.content,
    metadata: documentRecord.metadata,
  })
  if (!parsedSnapshot) {
    return null
  }

  return {
    id: documentRecord.id,
    projectId,
    label,
    saveKind,
    baseManualVersion,
    minor,
    patch,
    changedCharacters,
    createdAt: documentRecord.createdAt,
    updatedAt: documentRecord.updatedAt,
    snapshot: parsedSnapshot,
    serializedSnapshot: documentRecord.content,
  }
}

export function getNextManualVersionDefinition(versions: ProjectVersion[], currentSerializedSnapshot: string): ProjectVersionDefinition {
  const manualVersions = versions.filter((version) => version.saveKind === "manual")
  const nextBaseManualVersion = manualVersions.reduce((highest, version) => Math.max(highest, version.baseManualVersion), 0) + 1
  const latestVersion = sortProjectVersionsDesc(versions)[0]

  return {
    label: String(nextBaseManualVersion),
    saveKind: "manual",
    baseManualVersion: nextBaseManualVersion,
    minor: 0,
    patch: 0,
    changedCharacters: latestVersion
      ? calculateCharacterDifference(latestVersion.serializedSnapshot, currentSerializedSnapshot)
      : currentSerializedSnapshot.length,
  }
}

export function getInitialManualVersionDefinition(
  versions: ProjectVersion[],
  currentSerializedSnapshot: string,
): ProjectVersionDefinition {
  const latestVersion = sortProjectVersionsDesc(versions)[0]

  return {
    label: "0",
    saveKind: "manual",
    baseManualVersion: 0,
    minor: 0,
    patch: 0,
    changedCharacters: latestVersion
      ? calculateCharacterDifference(latestVersion.serializedSnapshot, currentSerializedSnapshot)
      : currentSerializedSnapshot.length,
  }
}

export function planAutosaveVersion(versions: ProjectVersion[], currentSerializedSnapshot: string): ProjectVersionDefinition | null {
  const sortedVersions = sortProjectVersionsDesc(versions)
  const latestManualVersion = sortedVersions.find((version) => version.saveKind === "manual")

  if (!latestManualVersion) {
    return null
  }

  const latestVersion = sortedVersions[0] ?? latestManualVersion
  const changedSinceLatestVersion = calculateCharacterDifference(latestVersion.serializedSnapshot, currentSerializedSnapshot)
  if (changedSinceLatestVersion < MIN_AUTOSAVE_CHARACTER_DIFF) {
    return null
  }

  const changedSinceManualVersion = calculateCharacterDifference(latestManualVersion.serializedSnapshot, currentSerializedSnapshot)
  const autosavesForManualVersion = sortedVersions.filter(
    (version) => version.saveKind === "autosave" && version.baseManualVersion === latestManualVersion.baseManualVersion,
  )
  const latestAutosaveVersion = autosavesForManualVersion[0] ?? null
  const baselineLength = Math.max(latestManualVersion.serializedSnapshot.length, 1)
  const majorChangeThreshold = Math.max(
    MAJOR_AUTOSAVE_CHARACTER_DIFF,
    Math.round(baselineLength * MAJOR_AUTOSAVE_CHANGE_RATIO),
  )

  const shouldBumpMinor = latestAutosaveVersion
    ? changedSinceLatestVersion >= Math.max(Math.round(majorChangeThreshold * 0.7), MIN_AUTOSAVE_CHARACTER_DIFF * 2)
    : changedSinceManualVersion >= majorChangeThreshold

  if (shouldBumpMinor) {
    const nextMinor = (latestAutosaveVersion?.minor ?? 0) + 1
    return {
      label: `${latestManualVersion.baseManualVersion}.${nextMinor}.1`,
      saveKind: "autosave",
      baseManualVersion: latestManualVersion.baseManualVersion,
      minor: nextMinor,
      patch: 1,
      changedCharacters: changedSinceLatestVersion,
    }
  }

  const nextMinor = latestAutosaveVersion?.minor ?? 0
  const nextPatch = (latestAutosaveVersion?.patch ?? 0) + 1

  return {
    label: `${latestManualVersion.baseManualVersion}.${nextMinor}.${nextPatch}`,
    saveKind: "autosave",
    baseManualVersion: latestManualVersion.baseManualVersion,
    minor: nextMinor,
    patch: nextPatch,
    changedCharacters: changedSinceLatestVersion,
  }
}

export function restoreProjectFromVersion(currentProject: Project, snapshot: Project) {
  const restoredProject = {
    ...currentProject,
    ...snapshot,
    id: currentProject.id,
    createdAt: currentProject.createdAt,
    folderId: currentProject.folderId,
    rootPosition: currentProject.rootPosition,
  }

  return normalizeProjectAfterTabs(restoredProject, snapshot.tabs)
}

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

export function formatVersionTimestamp(value: string) {
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

export function stripHtmlPreview(value: string) {
  if (!value) {
    return ""
  }

  if (typeof window === "undefined") {
    return value.slice(0, 280)
  }

  const text = new DOMParser().parseFromString(value, "text/html").body.textContent ?? ""
  return text.replace(/\s+/g, " ").trim().slice(0, 280)
}

export type VersionSettingsEntry = {
  id: string
  label: string
  saveKind: "manual" | "autosave"
  createdAt: string
  changedCharacters: number
  preview: {
    projectName: string
    projectKind: ProjectKind
    entryCount: number
    activeDocumentTitle: string
    activeDocumentPreview: string
  }
}

export function mapVersionsForSettings(versions: ProjectVersion[]): VersionSettingsEntry[] {
  return versions.map((version) => {
    const tabTitles = collectTabTitles(version.snapshot.tabs)
    const activeDocumentTitle =
      (version.snapshot.activeId ? findTabTitleById(version.snapshot.tabs, version.snapshot.activeId) : null) ??
      tabTitles[0] ??
      "Untitled Entry"
    const activeDocumentPreview =
      (version.snapshot.activeId ? stripHtmlPreview(version.snapshot.contentById[version.snapshot.activeId] ?? "") : "") ||
      stripHtmlPreview(version.snapshot.contentById[Object.keys(version.snapshot.contentById)[0] ?? ""] ?? "")

    return {
      id: version.id,
      label: version.label,
      saveKind: version.saveKind,
      createdAt: version.createdAt,
      changedCharacters: version.changedCharacters,
      preview: {
        projectName: version.snapshot.name,
        projectKind: version.snapshot.kind,
        entryCount: tabTitles.length,
        activeDocumentTitle,
        activeDocumentPreview,
      },
    }
  })
}

export function buildVersionPreviewHtml(params: {
  version: ProjectVersion
  bodyFont: string
  projectId: string
}): string {
  const { version, bodyFont, projectId } = params
  const resolvedBodyFont = withEmojiFontFallback(bodyFont)
  const activeDocumentTitle =
    (version.snapshot.activeId
      ? findTabTitleById(version.snapshot.tabs, version.snapshot.activeId)
      : null) ?? "Untitled Entry"
  const activeDocumentPreview = version.snapshot.activeId
    ? stripHtmlPreview(version.snapshot.contentById[version.snapshot.activeId] ?? "")
    : ""

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(version.snapshot.name)} - Version ${escapeHtml(version.label)}</title>
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
      <h1>${escapeHtml(version.snapshot.name)} - Version ${escapeHtml(version.label)}</h1>
      <p class="meta">${escapeHtml(formatVersionTimestamp(version.createdAt))} - ${escapeHtml(version.saveKind === "manual" ? "Manual" : "Autosave")}</p>
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

export function buildVersionHistoryPageHtml(params: {
  versions: ProjectVersion[]
  projectName: string
  projectId: string
  bodyFont: string
  uiFont: string
  displayFont: string
  appBg: string
  menuBg: string
  menuButton: string
  menuButtonHoverBg: string
  menuDropdownBg: string
  menuDropdownBorder: string
  appAccent: string
  isElectron?: boolean
}): string {
  const { versions, projectName, projectId, bodyFont, uiFont, displayFont, appBg, menuBg, menuButton, menuButtonHoverBg, menuDropdownBg, menuDropdownBorder, appAccent, isElectron } = params
  const openInNewLabel = isElectron ? "Open in New Window" : "Open in New Tab"
  const resolvedBodyFont = withEmojiFontFallback(bodyFont)
  const resolvedUiFont = withEmojiFontFallback(uiFont)
  const resolvedDisplayFont = withEmojiFontFallback(displayFont)

  // Lucide SVG icon paths (stroke-based, 24x24 viewBox)
  const iconSvg = (path: string, size = 15) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`

  const iconExternalLink = iconSvg('<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>')
  const iconCopy = iconSvg('<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>')
  const iconDownload = iconSvg('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>')
  const iconRotateCcw = iconSvg('<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>')
  const iconHistory = iconSvg('<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>')

  const versionRows = versions.map((version) => {
    const badgeClass = version.saveKind === "manual" ? "badge--manual" : "badge--autosave"
    const badgeLabel = version.saveKind === "manual" ? "Manual" : "Autosave"
    const timestamp = formatVersionTimestamp(version.createdAt)
    const delta = version.changedCharacters > 0
      ? `${version.changedCharacters.toLocaleString()} changed characters`
      : "No character delta recorded"
    const downloadLabel = "Download PDF"

    return `<article class="card">
      <div class="meta">
        <div class="version-line">
          <strong class="version-label">Version ${escapeHtml(version.label)}</strong>
          <span class="badge ${badgeClass}">${badgeLabel}</span>
        </div>
        <p class="time">${escapeHtml(timestamp)}</p>
        <p class="delta">${escapeHtml(delta)}</p>
      </div>
      <div class="actions">
        <button type="button" class="btn" data-action="view" data-version-id="${escapeHtml(version.id)}">${iconExternalLink}<span>${escapeHtml(openInNewLabel)}</span></button>
        <button type="button" class="btn" data-action="duplicate" data-version-id="${escapeHtml(version.id)}">${iconCopy}<span>Make a Copy</span></button>
        <button type="button" class="btn" data-action="export" data-version-id="${escapeHtml(version.id)}">${iconDownload}<span>${escapeHtml(downloadLabel)}</span></button>
        <button type="button" class="btn btn--restore" data-action="restore" data-version-id="${escapeHtml(version.id)}">${iconRotateCcw}<span>Restore</span></button>
      </div>
    </article>`
  }).join("\n")

  const emptyMessage = versions.length === 0
    ? `<p class="empty">New projects automatically start with Manual Version 0. Use File &gt; Save Version for Versions 1, 2, 3 and beyond.</p>`
    : ""

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(projectName)} - Version History</title>
    <style>
      :root {
        --app-bg: ${appBg};
        --menu-bg: ${menuBg};
        --menu-button: ${menuButton};
        --menu-button-hover-bg: ${menuButtonHoverBg};
        --menu-dropdown-bg: ${menuDropdownBg};
        --menu-dropdown-border: ${menuDropdownBorder};
        --app-accent: ${appAccent};
        --app-body-font: ${resolvedBodyFont};
        --app-ui-font: ${resolvedUiFont};
        --app-display-font: ${resolvedDisplayFont};
      }

      * { box-sizing: border-box; margin: 0; padding: 0; }

      body {
        margin: 0;
        padding: 32px 24px;
        font-family: var(--app-ui-font);
        background: var(--app-bg);
        color: var(--menu-button);
        -webkit-font-smoothing: antialiased;
      }

      .wrap { max-width: 860px; margin: 0 auto; }

      .header {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 4px;
      }

      .header svg { opacity: 0.7; flex-shrink: 0; }

      h1 {
        margin: 0;
        font-family: var(--app-display-font);
        font-weight: 400;
        font-size: 32px;
        color: var(--menu-button);
      }

      .subtitle {
        margin: 0 0 20px;
        color: color-mix(in srgb, var(--menu-button) 58%, transparent);
        font-size: 15px;
      }

      .card {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 14px;
        margin-bottom: 10px;
        border: 1px solid color-mix(in srgb, var(--menu-dropdown-border) 88%, transparent);
        border-radius: 12px;
        padding: 14px 16px;
        background: color-mix(in srgb, var(--menu-dropdown-bg) 82%, var(--app-bg));
        transition: border-color 160ms ease;
      }

      .card:hover {
        border-color: color-mix(in srgb, var(--menu-button) 22%, transparent);
      }

      .meta { min-width: 0; }

      .version-line {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }

      .version-label {
        font-size: 18px;
        font-weight: 600;
        color: var(--menu-button);
      }

      .badge {
        display: inline-flex;
        padding: 3px 8px;
        border-radius: 999px;
        font-size: 12px;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }

      .badge--manual {
        background: color-mix(in srgb, var(--app-accent) 24%, transparent);
        color: color-mix(in srgb, var(--menu-button) 88%, var(--app-accent));
      }

      .badge--autosave {
        background: rgba(122, 199, 154, 0.18);
        color: color-mix(in srgb, var(--menu-button) 78%, #7ac79a);
      }

      .time, .delta {
        margin: 2px 0 0;
        color: color-mix(in srgb, var(--menu-button) 64%, transparent);
        font-size: 15px;
        line-height: 1.4;
      }

      .actions {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 8px;
        flex-shrink: 0;
      }

      .btn {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        border: 1px solid color-mix(in srgb, var(--menu-dropdown-border) 88%, transparent);
        border-radius: 8px;
        background: color-mix(in srgb, var(--menu-button-hover-bg) 54%, transparent);
        color: var(--menu-button);
        font-family: var(--app-ui-font);
        font-size: 15px;
        padding: 8px 12px;
        cursor: pointer;
        transition: border-color 160ms ease, background-color 160ms ease, transform 140ms ease;
      }

      .btn:hover, .btn:focus-visible {
        border-color: color-mix(in srgb, var(--menu-button) 38%, transparent);
        background: color-mix(in srgb, var(--menu-button-hover-bg) 82%, transparent);
        outline: none;
      }

      .btn:active { transform: translateY(1px); }

      .btn svg { flex-shrink: 0; }

      .btn--restore {
        border-color: color-mix(in srgb, #e05050 28%, var(--menu-dropdown-border));
      }

      .btn--restore:hover {
        border-color: color-mix(in srgb, #e05050 50%, var(--menu-dropdown-border));
        background: color-mix(in srgb, #e05050 14%, var(--menu-button-hover-bg));
      }

      .empty {
        color: color-mix(in srgb, var(--menu-button) 64%, transparent);
        font-size: 16px;
        padding: 20px 0;
      }

      .status {
        margin-top: 10px;
        color: var(--app-accent);
        font-size: 14px;
        min-height: 1.4em;
      }

      @media (max-width: 640px) {
        .card { flex-direction: column; align-items: flex-start; }
        .actions { width: 100%; }
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="header">
        ${iconHistory}
        <h1>${escapeHtml(projectName)} — Version History</h1>
      </div>
      <p class="subtitle">${versions.length === 1 ? "1 saved version" : `${versions.length} saved versions`}</p>
      ${emptyMessage}
      ${versionRows}
      <p id="actionStatus" class="status"></p>
    </div>
    <script>
      (function () {
        var projectId = ${JSON.stringify(projectId)};
        var status = document.getElementById("actionStatus");

        function sendAction(action, versionId) {
          if (!window.opener) {
            if (status) status.textContent = "This tab is detached from the app window. Open from settings to enable actions.";
            return;
          }

          window.opener.postMessage(
            { type: "ivory:version-action", action: action, projectId: projectId, versionId: versionId },
            window.location.origin,
          );

          var labels = { view: "Opening in new tab…", duplicate: "Copy request sent.", export: "Download started.", restore: "Restore request sent." };
          if (status) status.textContent = labels[action] || (action + " request sent.");
        }

        document.addEventListener("click", function (e) {
          var btn = e.target.closest("[data-action]");
          if (!btn) return;
          sendAction(btn.getAttribute("data-action"), btn.getAttribute("data-version-id"));
        });
      })();
    </script>
  </body>
</html>`
}