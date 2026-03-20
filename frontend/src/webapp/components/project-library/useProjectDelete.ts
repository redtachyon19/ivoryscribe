import { useRef, useState, type Dispatch, type SetStateAction } from "react"
import type { Project } from "../../../core/projects"
import { splitGraphemes } from "../../../core/projectLibraryUtils"

type UseProjectDeleteOptions = {
  projects: Project[]
  setProjects: Dispatch<SetStateAction<Project[]>>
  setActiveProjectId: Dispatch<SetStateAction<string | null>>
}

export default function useProjectDelete({ projects, setProjects, setActiveProjectId }: UseProjectDeleteOptions) {
  const [pendingDeleteProjectId, setPendingDeleteProjectId] = useState<string | null>(null)
  const [deleteModalProjectName, setDeleteModalProjectName] = useState("")
  const [confirmationText, setConfirmationText] = useState("")
  const [error, setError] = useState("")
  const confirmationInputRef = useRef<HTMLInputElement | null>(null)

  const pendingProject = pendingDeleteProjectId ? projects.find((project) => project.id === pendingDeleteProjectId) ?? null : null
  const isOpen = Boolean(pendingProject)
  const projectName = pendingProject?.name ?? deleteModalProjectName

  const requiredPhrase = projectName ? `I wish to delete ${projectName}` : ""
  const requiredCharacters = splitGraphemes(requiredPhrase)
  const enteredCharacters = splitGraphemes(confirmationText)

  const openConfirmation = (projectId: string) => {
    const project = projects.find((entry) => entry.id === projectId)
    setPendingDeleteProjectId(projectId)
    setDeleteModalProjectName(project?.name ?? "")
    setConfirmationText("")
    setError("")
  }

  const closeConfirmation = () => {
    setPendingDeleteProjectId(null)
    setConfirmationText("")
    setError("")
  }

  const deleteProject = (projectId: string) => {
    setProjects((current) => {
      const nextProjects = current.filter((project) => project.id !== projectId)
      setActiveProjectId((currentSelectedId) => {
        if (currentSelectedId !== projectId) return currentSelectedId
        return nextProjects[0]?.id ?? null
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
    deleteProject(pendingProject.id)
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
