import {
  collectTabTitles,
  findTabTitleById,
  normalizeProjectAfterTabs,
  type Project,
  type ProjectKind,
  type ProjectVersion,
  type ProjectVersionKind,
} from "../utils/projects"

export const PROJECT_RECORD_TYPE = "ivory-project"

export type { ProjectVersion, ProjectVersionKind } from "../utils/projects"

export function serializeProjectSnapshot(project: Project): string {
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

export function compareProjectVersions(a: ProjectVersion, b: ProjectVersion): number {
  const aTime = Date.parse(a.savedAt)
  const bTime = Date.parse(b.savedAt)
  if (aTime !== bTime) return bTime - aTime
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0
}

export function sortProjectVersionsDesc(versions: ReadonlyArray<ProjectVersion>): ProjectVersion[] {
  return [...versions].sort(compareProjectVersions)
}

export function restoreProjectFromVersion(currentProject: Project, snapshot: Project): Project {
  const restoredProject: Project = {
    ...currentProject,
    ...snapshot,
    id: currentProject.id,
    createdAt: currentProject.createdAt,
    folderId: currentProject.folderId,
    rootPosition: currentProject.rootPosition,
    versions: currentProject.versions,
  }

  return normalizeProjectAfterTabs(restoredProject, snapshot.tabs)
}

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

export type VersionSettingsEntry = {
  id: string
  label: string
  saveKind: ProjectVersionKind
  createdAt: string
  wordCount: number
  preview: {
    projectName: string
    projectKind: ProjectKind
    entryCount: number
    activeDocumentTitle: string
    activeDocumentPreview: string
  }
}

export function mapVersionsForSettings(versions: ReadonlyArray<ProjectVersion>): VersionSettingsEntry[] {
  return versions.map((version) => {
    const snapshot = parseVersionSnapshot(version.snapshot)
    if (!snapshot) {
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

export type VersionPreviewHandoff = {
  version: ProjectVersion
  projectId: string
  projectName: string
}

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
  }
  window.open(`${window.location.origin}/version-preview?key=${encodeURIComponent(key)}`, "_blank")
}
