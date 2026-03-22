import { useState, type DragEvent, type Dispatch, type SetStateAction } from "react"
import type { Project } from "../../../core/projects"
import type { ProjectFolder } from "../../pages/Library"

type SectionTarget = "library" | "archive" | "deleted" | null

type UseSectionDropOptions = {
  folders: ProjectFolder[]
  setProjects: Dispatch<SetStateAction<Project[]>>
  setFolders: Dispatch<SetStateAction<ProjectFolder[]>>
}

export default function useSectionDrop({ folders, setProjects, setFolders }: UseSectionDropOptions) {
  const [sectionDropTarget, setSectionDropTarget] = useState<SectionTarget>(null)

  const handleSectionDragOver = (section: "library" | "archive" | "deleted") => (event: DragEvent<HTMLElement>) => {
    event.preventDefault()
    if (sectionDropTarget !== section) setSectionDropTarget(section)
  }

  const handleSectionDragLeave = (event: DragEvent<HTMLElement>) => {
    const related = event.relatedTarget as HTMLElement | null
    if (related && event.currentTarget.contains(related)) return
    setSectionDropTarget(null)
  }

  const handleSectionDrop = (section: "library" | "archive" | "deleted") => (event: DragEvent<HTMLElement>) => {
    event.preventDefault()
    event.stopPropagation()
    const id = event.dataTransfer.getData("text/plain")
    if (!id) {
      setSectionDropTarget(null)
      return
    }

    const now = new Date().toISOString()
    const applySection = (p: Project): Project => {
      switch (section) {
        case "library":
          return { ...p, archivedAt: null, deletedAt: null }
        case "archive":
          return { ...p, archivedAt: p.archivedAt ?? now, deletedAt: null }
        case "deleted":
          return { ...p, deletedAt: p.deletedAt ?? now, archivedAt: null }
      }
    }

    const isFolder = folders.some((f) => f.id === id)

    setProjects((cur) => {
      if (isFolder) {
        return cur.map((p) =>
          p.folderId === id ? { ...applySection(p), folderId: null, rootPosition: "top" as const } : p,
        )
      }
      return cur.map((p) => (p.id === id ? applySection(p) : p))
    })

    if (isFolder && section !== "library") {
      setFolders((cur) => cur.filter((f) => f.id !== id))
    }

    setSectionDropTarget(null)
  }

  const getSectionDropClass = (section: "library" | "archive" | "deleted") =>
    sectionDropTarget === section ? "project-browser__section-btn--drop-target" : ""

  return { sectionDropTarget, handleSectionDragOver, handleSectionDragLeave, handleSectionDrop, getSectionDropClass }
}

/** Lightweight drag-start handler for cross-section project moves (used by Archive, Deleted, Recent pages). */
export function handleSectionDragStart(projectId: string, event: React.DragEvent<HTMLElement>) {
  event.dataTransfer.effectAllowed = "move"
  event.dataTransfer.setData("text/plain", projectId)
}
