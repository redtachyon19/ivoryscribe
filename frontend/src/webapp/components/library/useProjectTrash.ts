import { useRef, useState, type Dispatch, type SetStateAction } from "react"
import type { Project } from "../../../core/utils/projects"
import { splitGraphemes } from "../../../core/utils/libraryUtils"

type UseProjectTrashOptions = {
  projects: Project[]
  setProjects: Dispatch<SetStateAction<Project[]>>
  setActiveProjectId: Dispatch<SetStateAction<string | null>>
}

export default function useProjectTrash({ projects, setProjects, setActiveProjectId }: UseProjectTrashOptions) {
  const [pendingTrashProjectId, setPendingTrashProjectId] = useState<string | null>(null)
  const [trashModalProjectName, setTrashModalProjectName] = useState("")
  const [confirmationText, setConfirmationText] = useState("")
  const [error, setError] = useState("")
  const confirmationInputRef = useRef<HTMLInputElement | null>(null)

  const pendingProject = pendingTrashProjectId ? projects.find((project) => project.id === pendingTrashProjectId) ?? null : null
  const isOpen = Boolean(pendingProject)
  const projectName = pendingProject?.name ?? trashModalProjectName

  const requiredPhrase = projectName ? `I wish to trash ${projectName}` : ""
  const requiredCharacters = splitGraphemes(requiredPhrase)
  const enteredCharacters = splitGraphemes(confirmationText)

  const openConfirmation = (projectId: string) => {
    const project = projects.find((entry) => entry.id === projectId)
    setPendingTrashProjectId(projectId)
    setTrashModalProjectName(project?.name ?? "")
    setConfirmationText("")
    setError("")
  }

  const closeConfirmation = () => {
    setPendingTrashProjectId(null)
    setConfirmationText("")
    setError("")
  }

  const trashProject = (projectId: string) => {
    setProjects((current) => {
      const nextProjects = current.map((project) =>
        project.id === projectId ? { ...project, deletedAt: new Date().toISOString() } : project,
      )
      setActiveProjectId((currentSelectedId) => {
        if (currentSelectedId !== projectId) return currentSelectedId
        const available = nextProjects.filter((p) => !p.deletedAt && !p.archivedAt)
        return available[0]?.id ?? null
      })
      return nextProjects
    })
  }

  const confirm = () => {
    if (!pendingProject) return
    if (confirmationText !== requiredPhrase) {
      setError("The confirmation text must match exactly.")
      return
    }
    trashProject(pendingProject.id)
    closeConfirmation()
  }

  return {
    isOpen,
    projectName,
    confirmationText,
    error,
    confirmationInputRef,
    requiredCharacters,
    enteredCharacters,
    setConfirmationText,
    setError,
    openConfirmation,
    closeConfirmation,
    confirm,
  }
}
