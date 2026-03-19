import { normalizeProjectAfterTabs, type Project } from "./projects"

export const PROJECT_RECORD_TYPE = "ivory-project"
export const PROJECT_VERSION_RECORD_TYPE = "ivory-project-version"
export const AUTOSAVE_VERSION_INTERVAL_MS = 90_000

const MIN_AUTOSAVE_CHARACTER_DIFF = 180
const MAJOR_AUTOSAVE_CHARACTER_DIFF = 1400
const MAJOR_AUTOSAVE_CHANGE_RATIO = 0.18

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

function isProjectSnapshot(value: unknown): value is Project {
  if (!value || typeof value !== "object") {
    return false
  }

  const candidate = value as Partial<Project>
  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.kind === "string" &&
    Array.isArray(candidate.tabs) &&
    typeof candidate.contentById === "object" &&
    candidate.contentById !== null
  )
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

  try {
    const parsedSnapshot = JSON.parse(documentRecord.content)
    if (!isProjectSnapshot(parsedSnapshot)) {
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
  } catch {
    return null
  }
}

export function getNextManualVersionDefinition(versions: ProjectVersion[], currentSerializedSnapshot: string): ProjectVersionDefinition {
  const nextBaseManualVersion =
    versions.reduce((highest, version) => Math.max(highest, version.baseManualVersion), 0) + 1
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