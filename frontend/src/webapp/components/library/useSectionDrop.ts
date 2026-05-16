import { useState, type DragEvent, type Dispatch, type SetStateAction } from "react"
import type { Project } from "../../../core/utils/projects"
import type { ProjectFolder } from "../../pages/Library"

type SectionTarget = "library" | "archive" | "trash" | null

type UseSectionDropOptions = {
  folders: ProjectFolder[]
  setProjects: Dispatch<SetStateAction<Project[]>>
  setFolders: Dispatch<SetStateAction<ProjectFolder[]>>
}

export default function useSectionDrop({ folders, setProjects, setFolders }: UseSectionDropOptions) {
  const [sectionDropTarget, setSectionDropTarget] = useState<SectionTarget>(null)

  const handleSectionDragOver = (section: "library" | "archive" | "trash") => (event: DragEvent<HTMLElement>) => {
    event.preventDefault()
    if (sectionDropTarget !== section) setSectionDropTarget(section)
  }

  const handleSectionDragLeave = (event: DragEvent<HTMLElement>) => {
    const related = event.relatedTarget as HTMLElement | null
    if (related && event.currentTarget.contains(related)) return
    setSectionDropTarget(null)
  }

  const handleSectionDrop = (section: "library" | "archive" | "trash") => (event: DragEvent<HTMLElement>) => {
    event.preventDefault()
    event.stopPropagation()
    const raw = event.dataTransfer.getData("text/plain")
    if (!raw) {
      setSectionDropTarget(null)
      return
    }

    const ids = raw.split(",").filter(Boolean)
    const now = new Date().toISOString()
    const applySection = (p: Project): Project => {
      switch (section) {
        case "library":
          return { ...p, archivedAt: null, deletedAt: null }
        case "archive":
          return { ...p, archivedAt: p.archivedAt ?? now, deletedAt: null }
        case "trash":
          return { ...p, deletedAt: p.deletedAt ?? now, archivedAt: null }
      }
    }

    const folderIds = new Set(ids.filter((id) => folders.some((f) => f.id === id)))
    const projectIds = new Set(ids.filter((id) => !folderIds.has(id)))

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

  const getSectionDropClass = (section: "library" | "archive" | "trash") =>
    sectionDropTarget === section ? "project-browser__section-btn--drop-target" : ""

  return { sectionDropTarget, handleSectionDragOver, handleSectionDragLeave, handleSectionDrop, getSectionDropClass }
}

/** Lightweight drag-start handler for cross-section project moves (used by Archive, Trash, Recent pages). */
export function handleSectionDragStart(projectId: string, event: React.DragEvent<HTMLElement>) {
  event.dataTransfer.effectAllowed = "move"
  event.dataTransfer.setData("text/plain", projectId)
}
