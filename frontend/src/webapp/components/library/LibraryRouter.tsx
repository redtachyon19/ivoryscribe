// Library routing: renders the Cloud / Archive / Trash / Library collection
// pages based on the active library section. Extracted from Editor.tsx.

import { type Dispatch, type SetStateAction } from "react"
import CloudView from "../../pages/Cloud"
import ArchiveView from "../../pages/Archive"
import TrashView from "../../pages/Trash"
import Library, { type ProjectFolder } from "../../pages/Library"
import type { Project } from "../../../core/utils/projects"
import type { PendingShareRequest } from "../../../core/api"
import type { VersionSettingsEntry } from "../../../core/state/versioning"
import type { LibrarySection } from "./useLibraryNavigation"

type LibraryRouterProps = {
  librarySection: LibrarySection
  sessionToken: string
  projects: Project[]
  folders: ProjectFolder[]
  activeProjectId: string | null
  bookCounter: number
  projectDocumentMap: Record<string, string>
  setBookCounter: Dispatch<SetStateAction<number>>
  setProjects: Dispatch<SetStateAction<Project[]>>
  setFolders: Dispatch<SetStateAction<ProjectFolder[]>>
  setActiveProjectId: Dispatch<SetStateAction<string | null>>
  onOpenProject: (projectId: string) => void
  onOpenProjectInNewTab: (projectId: string) => void
  onProjectCreated?: (project: Project) => void
  activeProjectVersionsByProjectId?: Record<string, VersionSettingsEntry[]>
  onShowVersionHistory?: (projectId: string) => void
  onPermanentlyDeleteProjects?: (ids: Set<string>) => Promise<void>
  pendingShareRequests: PendingShareRequest[]
  onAcceptShareRequest: (shareId: string) => void
  onRejectShareRequest: (shareId: string) => void
  onRefreshPendingShareRequests: () => void
  userEmail?: string
  sharedProjectIds?: Set<string>
  ownerEmailByProjectId?: Map<string, string>
  onEnableCloudSharing?: (projectId: string) => Promise<string | null>
}

export default function LibraryRouter({
  librarySection,
  sessionToken,
  projects,
  folders,
  activeProjectId,
  bookCounter,
  projectDocumentMap,
  setBookCounter,
  setProjects,
  setFolders,
  setActiveProjectId,
  onOpenProject,
  onOpenProjectInNewTab,
  onProjectCreated,
  activeProjectVersionsByProjectId = {},
  onShowVersionHistory,
  onPermanentlyDeleteProjects,
  pendingShareRequests,
  onAcceptShareRequest,
  onRejectShareRequest,
  onRefreshPendingShareRequests,
  userEmail,
  sharedProjectIds,
  ownerEmailByProjectId,
  onEnableCloudSharing,
}: LibraryRouterProps) {
  if (librarySection === "cloud") {
    return (
      <CloudView
        projects={projects}
        setProjects={setProjects}
        projectDocumentMap={projectDocumentMap}
        onOpenProject={onOpenProject}
        onOpenProjectInNewTab={onOpenProjectInNewTab}
      />
    )
  }

  if (librarySection === "archive") {
    return (
      <ArchiveView
        projects={projects}
        setProjects={setProjects}
        onOpenProject={onOpenProject}
        onOpenProjectInNewTab={onOpenProjectInNewTab}
      />
    )
  }

  if (librarySection === "trash") {
    return (
      <TrashView
        projects={projects}
        setProjects={setProjects}
        onOpenProject={onOpenProject}
        onOpenProjectInNewTab={onOpenProjectInNewTab}
        onShredProjects={onPermanentlyDeleteProjects}
      />
    )
  }

  return (
    <Library
      sessionToken={sessionToken}
      projects={projects}
      folders={folders}
      activeProjectId={activeProjectId}
      bookCounter={bookCounter}
      projectDocumentMap={projectDocumentMap}
      setBookCounter={setBookCounter}
      onOpenProject={onOpenProject}
      onOpenProjectInNewTab={onOpenProjectInNewTab}
      onProjectCreated={onProjectCreated}
      activeProjectVersionsByProjectId={activeProjectVersionsByProjectId}
      onShowVersionHistory={onShowVersionHistory}
      setProjects={setProjects}
      setFolders={setFolders}
      setActiveProjectId={setActiveProjectId}
      pendingShareRequests={pendingShareRequests}
      onAcceptShareRequest={onAcceptShareRequest}
      onRejectShareRequest={onRejectShareRequest}
      onRefreshPendingShareRequests={onRefreshPendingShareRequests}
      userEmail={userEmail}
      sharedProjectIds={sharedProjectIds}
      ownerEmailByProjectId={ownerEmailByProjectId}
      onEnableCloudSharing={onEnableCloudSharing}
    />
  )
}
