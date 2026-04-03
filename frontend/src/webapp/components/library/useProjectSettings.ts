import { useEffect, useState, type Dispatch, type SetStateAction } from "react"
import type { Project } from "../../../core/projects"
import { createLocalId, buildDuplicateProjectName, normalizeProjectColor, normalizeProjectEmojiWallpaper } from "../../../core/libraryUtils"

type UseProjectSettingsOptions = {
  projects: Project[]
  setProjects: Dispatch<SetStateAction<Project[]>>
}

export default function useProjectSettings({ projects, setProjects }: UseProjectSettingsOptions) {
  const [openProjectSettingsId, setOpenProjectSettingsId] = useState<string | null>(null)
  const [projectName, setProjectName] = useState("")
  const [projectColor, setProjectColor] = useState("#7ea8ff")
  const [markdownEditorEnabled, setMarkdownEditorEnabled] = useState(false)
  const [wallpaperEmojis, setWallpaperEmojis] = useState("")
  const [error, setError] = useState("")

  const settingsProject = openProjectSettingsId ? projects.find((project) => project.id === openProjectSettingsId) ?? null : null
  const isOpen = Boolean(settingsProject)

  const open = (project: Project) => {
    setOpenProjectSettingsId(project.id)
    setProjectName(project.name)
    setProjectColor(normalizeProjectColor(project.color))
    setMarkdownEditorEnabled(Boolean(project.markdownEditorEnabled))
    setWallpaperEmojis(project.wallpaperEmojis ?? "")
    setError("")
  }

  const close = () => {
    setOpenProjectSettingsId(null)
    setError("")
  }

  useEffect(() => {
    if (!settingsProject) return

    const trimmedName = projectName.trim()
    if (!trimmedName) {
      setError("Project name cannot be empty.")
      return
    }

    setError((current) => (current ? "" : current))
    const normalizedWallpaper = normalizeProjectEmojiWallpaper(wallpaperEmojis)

    setProjects((current) => {
      let hasChanges = false
      const normalizedColor = normalizeProjectColor(projectColor)

      const nextProjects = current.map((project) => {
        if (project.id !== settingsProject.id) return project
        if (
          project.name === trimmedName &&
          project.color === normalizedColor &&
          Boolean(project.markdownEditorEnabled) === markdownEditorEnabled &&
          (project.wallpaperEmojis ?? "") === normalizedWallpaper
        ) return project

        hasChanges = true
        return { ...project, name: trimmedName, color: normalizedColor, markdownEditorEnabled, wallpaperEmojis: normalizedWallpaper }
      })

      return hasChanges ? nextProjects : current
    })
  }, [projectColor, markdownEditorEnabled, projectName, wallpaperEmojis, setProjects, settingsProject])

  const duplicate = () => {
    if (!settingsProject) return

    setProjects((current) => {
      const sourceIndex = current.findIndex((project) => project.id === settingsProject.id)
      if (sourceIndex === -1) return current
      const source = current[sourceIndex]
      const tabIdMap = new Map<string, string>()

      const cloneTabsWithNewIds = (tabs: Project["tabs"]): Project["tabs"] => {
        return tabs.map((tab) => {
          const nextId = createLocalId()
          tabIdMap.set(tab.id, nextId)
          return { ...tab, id: nextId, children: cloneTabsWithNewIds(tab.children) }
        })
      }

      const nextTabs = cloneTabsWithNewIds(source.tabs)
      const nextContentById: Project["contentById"] = {}
      tabIdMap.forEach((nextId, oldId) => {
        nextContentById[nextId] = source.contentById[oldId] ?? ""
      })

      const duplicate: Project = {
        ...source,
        id: createLocalId(),
        name: buildDuplicateProjectName(source.name, current.map((project) => project.name)),
        createdAt: new Date().toISOString(),
        tabs: nextTabs,
        activeId: source.activeId ? (tabIdMap.get(source.activeId) ?? (nextTabs[0]?.id ?? null)) : (nextTabs[0]?.id ?? null),
        contentById: nextContentById,
      }

      const nextProjects = [...current]
      nextProjects.splice(sourceIndex + 1, 0, duplicate)
      return nextProjects
    })

    close()
  }

  return {
    isOpen,
    settingsProject,
    openProjectSettingsId,
    projectName,
    projectColor,
    markdownEditorEnabled,
    wallpaperEmojis,
    error,
    setProjectName,
    setProjectColor,
    setMarkdownEditorEnabled,
    setWallpaperEmojis,
    setError,
    open,
    close,
    duplicate,
  }
}
