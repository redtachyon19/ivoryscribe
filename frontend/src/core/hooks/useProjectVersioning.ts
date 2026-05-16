import { type Dispatch, type MutableRefObject, type SetStateAction, useEffect, useRef, useState } from "react"
import { type DocumentRecord, createDocument, getDocuments, updateDocument } from "../api"
import { type Project } from "../utils/projects"
import type { UserSession } from "../state/session"
import {
  AUTOSAVE_VERSION_INTERVAL_MS,
  PROJECT_RECORD_TYPE,
  buildProjectDocumentPayload,
  buildProjectVersionPayload,
  getInitialManualVersionDefinition,
  getNextManualVersionDefinition,
  parseProjectVersion,
  planAutosaveVersion,
  serializeProjectSnapshot,
  sortProjectVersionsDesc,
  type ProjectVersion,
  type ProjectVersionDefinition,
} from "../state/versioning"
import { APP_SAVE_PROJECT_EVENT, APP_SAVE_PROJECT_VERSION_EVENT } from "../events/editorEvents"

type VersionActionMessage = {
  type: "ivory:version-action"
  action: "restore" | "duplicate"
  projectId: string
  versionId: string
}

type UseProjectVersioningParams = {
  sessionRef: MutableRefObject<UserSession | null>
  session: UserSession | null
  projects: Project[]
  projectDocumentMapRef: MutableRefObject<Record<string, string>>
  setProjectDocumentMap: Dispatch<SetStateAction<Record<string, string>>>
  isWorkspaceHydrated: boolean
  activeProjectRef: MutableRefObject<Project | null>
  viewRef: MutableRefObject<"projects" | "editor">
  /** Orchestrator-owned: apply a restored snapshot into projects[]. Returns
   *  true if the target project still exists. */
  onRestoreVersion: (projectId: string, snapshot: Project) => boolean
  /** Orchestrator-owned: insert a duplicated snapshot as a new project. Returns
   *  the new project id on success. */
  onDuplicateVersion: (snapshot: Project) => string | null
}

export function useProjectVersioning(params: UseProjectVersioningParams) {
  const {
    sessionRef,
    session,
    projects,
    projectDocumentMapRef,
    setProjectDocumentMap,
    isWorkspaceHydrated,
    activeProjectRef,
    viewRef,
    onRestoreVersion,
    onDuplicateVersion,
  } = params

  const [projectVersionsByProjectId, setProjectVersionsByProjectId] = useState<Record<string, ProjectVersion[]>>({})
  const projectVersionsRef = useRef<Record<string, ProjectVersion[]>>({})
  const isVersionSaveInFlightRef = useRef(false)

  useEffect(() => {
    projectVersionsRef.current = projectVersionsByProjectId
  }, [projectVersionsByProjectId])

  const upsertProjectVersion = (projectId: string, version: ProjectVersion) => {
    setProjectVersionsByProjectId((current) => {
      const existingVersions = current[projectId] ?? []
      const nextVersions = sortProjectVersionsDesc([
        version,
        ...existingVersions.filter((existingVersion) => existingVersion.id !== version.id),
      ])

      return {
        ...current,
        [projectId]: nextVersions,
      }
    })
  }

  const persistProjectDocument = async (token: string, project: Project) => {
    const payload = buildProjectDocumentPayload(project)
    const existingDocumentId = projectDocumentMapRef.current[project.id]

    if (existingDocumentId) {
      await updateDocument(token, existingDocumentId, payload)
      return existingDocumentId
    }

    const remoteDocuments = await getDocuments(token)
    const existingRemoteDocument = remoteDocuments.find(
      (documentRecord) =>
        documentRecord.metadata?.recordType === PROJECT_RECORD_TYPE && documentRecord.metadata?.projectId === project.id,
    )

    if (existingRemoteDocument) {
      await updateDocument(token, existingRemoteDocument.id, payload)
      setProjectDocumentMap((current) => ({
        ...current,
        [project.id]: existingRemoteDocument.id,
      }))
      return existingRemoteDocument.id
    }

    const createdDocument = await createDocument(token, payload)
    setProjectDocumentMap((current) => ({
      ...current,
      [project.id]: createdDocument.id,
    }))
    return createdDocument.id
  }

  const createProjectVersionSnapshot = async (
    project: Project,
    definition: ProjectVersionDefinition,
    options?: { alertOnFailure?: boolean },
  ) => {
    const currentSession = sessionRef.current
    if (!currentSession) {
      return null
    }

    if (isVersionSaveInFlightRef.current) {
      return null
    }

    isVersionSaveInFlightRef.current = true

    try {
      await persistProjectDocument(currentSession.token, project)
      const createdDocument = await createDocument(currentSession.token, buildProjectVersionPayload(project, definition))
      const parsedVersion = parseProjectVersion(createdDocument as DocumentRecord)

      if (parsedVersion) {
        upsertProjectVersion(project.id, parsedVersion)
      }

      return parsedVersion
    } catch (error) {
      if (options?.alertOnFailure !== false && typeof window !== "undefined") {
        const message = error instanceof Error ? error.message : "Failed to save version"
        window.alert(message)
      }

      return null
    } finally {
      isVersionSaveInFlightRef.current = false
    }
  }

  const restoreVersionIntoProject = (projectId: string, versionId: string) => {
    const selectedVersion = (projectVersionsRef.current[projectId] ?? []).find((version) => version.id === versionId)
    if (!selectedVersion) {
      return false
    }

    return onRestoreVersion(projectId, selectedVersion.snapshot)
  }

  const duplicateVersionIntoLibrary = (projectId: string, versionId: string) => {
    const selectedVersion = (projectVersionsRef.current[projectId] ?? []).find((version) => version.id === versionId)
    if (!selectedVersion) {
      return false
    }

    return onDuplicateVersion(selectedVersion.snapshot) !== null
  }

  // Save project + save version event listeners
  useEffect(() => {
    const handleSaveProject = () => {
      const currentSession = sessionRef.current
      const currentProject = activeProjectRef.current
      if (!currentSession || !currentProject) {
        return
      }

      void persistProjectDocument(currentSession.token, currentProject)
    }

    const handleSaveProjectVersion = async () => {
      const currentProject = activeProjectRef.current
      if (!currentProject) {
        return
      }

      const currentSerializedSnapshot = serializeProjectSnapshot(currentProject)
      let versionsForProject = projectVersionsRef.current[currentProject.id] ?? []
      const hasManualVersion = versionsForProject.some((version) => version.saveKind === "manual")

      if (!hasManualVersion) {
        const initialDefinition = getInitialManualVersionDefinition(versionsForProject, currentSerializedSnapshot)
        const initialVersion = await createProjectVersionSnapshot(currentProject, initialDefinition, { alertOnFailure: false })
        if (initialVersion) {
          versionsForProject = sortProjectVersionsDesc([initialVersion, ...versionsForProject])
        }
      }

      const versionDefinition = getNextManualVersionDefinition(
        versionsForProject,
        currentSerializedSnapshot,
      )

      const savedVersion = await createProjectVersionSnapshot(currentProject, versionDefinition)
      if (savedVersion && typeof window !== "undefined") {
        window.alert(`Saved version ${savedVersion.label}.`)
      }
    }

    window.addEventListener(APP_SAVE_PROJECT_EVENT, handleSaveProject)
    window.addEventListener(APP_SAVE_PROJECT_VERSION_EVENT, handleSaveProjectVersion)

    return () => {
      window.removeEventListener(APP_SAVE_PROJECT_EVENT, handleSaveProject)
      window.removeEventListener(APP_SAVE_PROJECT_VERSION_EVENT, handleSaveProjectVersion)
    }
  }, [])

  // Autosave interval
  useEffect(() => {
    if (!isWorkspaceHydrated) {
      return
    }

    const intervalId = window.setInterval(() => {
      const currentSession = sessionRef.current
      const currentProject = activeProjectRef.current

      if (!currentSession || !currentProject || viewRef.current !== "editor" || isVersionSaveInFlightRef.current) {
        return
      }

      const versionDefinition = planAutosaveVersion(
        projectVersionsRef.current[currentProject.id] ?? [],
        serializeProjectSnapshot(currentProject),
      )

      if (!versionDefinition) {
        return
      }

      void createProjectVersionSnapshot(currentProject, versionDefinition, { alertOnFailure: false })
    }, AUTOSAVE_VERSION_INTERVAL_MS)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [isWorkspaceHydrated])

  // Version action message listener
  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

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
        void restoreVersionIntoProject(message.projectId, message.versionId)
        return
      }

      void duplicateVersionIntoLibrary(message.projectId, message.versionId)
    }

    window.addEventListener("message", onVersionActionMessage)
    return () => {
      window.removeEventListener("message", onVersionActionMessage)
    }
  }, [])

  // Baseline version creation for projects missing manual versions
  useEffect(() => {
    if (!session || !isWorkspaceHydrated || isVersionSaveInFlightRef.current) {
      return
    }

    const projectMissingManualBaseline = projects.find((project) => {
      const versions = projectVersionsByProjectId[project.id] ?? []
      return !versions.some((version) => version.saveKind === "manual")
    })

    if (!projectMissingManualBaseline) {
      return
    }

    const versions = projectVersionsByProjectId[projectMissingManualBaseline.id] ?? []
    const baselineDefinition = getInitialManualVersionDefinition(
      versions,
      serializeProjectSnapshot(projectMissingManualBaseline),
    )

    void createProjectVersionSnapshot(projectMissingManualBaseline, baselineDefinition, { alertOnFailure: false })
  }, [isWorkspaceHydrated, projectVersionsByProjectId, projects, session])

  return {
    projectVersionsByProjectId,
    setProjectVersionsByProjectId,
    projectVersionsRef,
    isVersionSaveInFlightRef,
    upsertProjectVersion,
    restoreVersionIntoProject,
    duplicateVersionIntoLibrary,
    createProjectVersionSnapshot,
    persistProjectDocument,
  }
}
