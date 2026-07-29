import { useState, type DragEvent, type Dispatch, type SetStateAction } from "react"
import type { Project } from "../../../core/utils/projects"
import type { ProjectFolder } from "../../pages/Library"

export type DroppableSection = "library" | "archive" | "trash" | "cloud"
type SectionTarget = DroppableSection | null

type UseSectionDropOptions = {
  folders: ProjectFolder[]
  projects: Project[]
  setProjects: Dispatch<SetStateAction<Project[]>>
  setFolders: Dispatch<SetStateAction<ProjectFolder[]>>
  onMoveProjectToCloud?: (projectId: string) => Promise<string | null>
  onEnterSection?: () => void
}

export default function useSectionDrop({ folders, projects, setProjects, setFolders, onMoveProjectToCloud, onEnterSection }: UseSectionDropOptions) {
  const [sectionDropTarget, setSectionDropTarget] = useState<SectionTarget>(null)

  const handleSectionDragOver = (section: DroppableSection) => (event: DragEvent<HTMLElement>) => {
    if (section === "cloud" && !onMoveProjectToCloud) return
    event.preventDefault()
    event.stopPropagation()
    if (sectionDropTarget !== section) {
      onEnterSection?.()
      setSectionDropTarget(section)
    }
  }

  const handleSectionDragLeave = (event: DragEvent<HTMLElement>) => {
    const related = event.relatedTarget as HTMLElement | null
    if (related && event.currentTarget.contains(related)) return
    setSectionDropTarget(null)
  }

  const handleSectionDrop = (section: DroppableSection) => (event: DragEvent<HTMLElement>) => {
    event.preventDefault()
    event.stopPropagation()
    const raw = event.dataTransfer.getData("text/plain")
    if (!raw) {
      setSectionDropTarget(null)
      return
    }

    const ids = raw.split(",").filter(Boolean)
    const folderIds = new Set(ids.filter((id) => folders.some((f) => f.id === id)))
    const projectIds = new Set(ids.filter((id) => !folderIds.has(id)))

    if (section === "cloud") {
      if (!onMoveProjectToCloud) {
        console.warn("[sectionDrop] cloud drop ignored — no onMoveProjectToCloud handler wired up (cloud-only mode?)")
        setSectionDropTarget(null)
        return
      }
      const localProjectIds = new Set<string>()
      for (const pid of projectIds) {
        const p = projects.find((proj) => proj.id === pid)
        if (p && p.source !== "cloud") localProjectIds.add(pid)
      }
      for (const fId of folderIds) {
        for (const p of projects) {
          if (p.folderId === fId && p.source !== "cloud") localProjectIds.add(p.id)
        }
      }

      if (localProjectIds.size === 0) {
        console.warn("[sectionDrop] cloud drop resolved to zero local projects", { projectIds: Array.from(projectIds), folderIds: Array.from(folderIds) })
        setSectionDropTarget(null)
        return
      }

      void (async () => {
        let succeeded = 0
        for (const pid of localProjectIds) {
          try {
            const result = await onMoveProjectToCloud(pid)
            if (result) succeeded += 1
          } catch (err) {
            console.error("[sectionDrop] move to cloud failed for", pid, err)
          }
        }
        if (folderIds.size > 0 && succeeded > 0) {
          setFolders((cur) => cur.filter((f) => !folderIds.has(f.id)))
        }
      })()

      setSectionDropTarget(null)
      return
    }

    const now = new Date().toISOString()
    const applySection = (p: Project): Project => {
      switch (section) {
        case "library":
          return { ...p, archivedAt: null, deletedAt: null, folderId: null, rootPosition: "top" as const }
        case "archive":
          return { ...p, archivedAt: p.archivedAt ?? now, deletedAt: null }
        case "trash":
          return { ...p, deletedAt: p.deletedAt ?? now, archivedAt: null }
      }
    }

    setProjects((cur) =>
      cur.map((p) => {
        if (projectIds.has(p.id)) return applySection(p)
        for (const fId of folderIds) {
          if (p.folderId === fId) return { ...applySection(p), folderId: null, rootPosition: "top" as const }
        }
        return p
      }),
    )

    if (section !== "library") {
      const removedFolderIds = folderIds
      if (removedFolderIds.size > 0) {
        setFolders((cur) => cur.filter((f) => !removedFolderIds.has(f.id)))
      }
    }

    setSectionDropTarget(null)
  }

  const getSectionDropClass = (section: DroppableSection) =>
    sectionDropTarget === section ? "project-browser__section-btn--drop-target" : ""

  return { sectionDropTarget, setSectionDropTarget, handleSectionDragOver, handleSectionDragLeave, handleSectionDrop, getSectionDropClass }
}

export function handleSectionDragStart(projectId: string, event: React.DragEvent<HTMLElement>) {
  event.dataTransfer.effectAllowed = "move"
  event.dataTransfer.setData("text/plain", projectId)
}
