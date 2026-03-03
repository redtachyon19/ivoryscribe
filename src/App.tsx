import { useEffect, useMemo, useState } from "react"
import "./App.css"
import WebMenu from "./components/WebMenu"
import { projectWorkspaceMenu } from "./core/menu"
import { DEFAULT_DOCUMENT_CONTENT, createProject, type Project, type ProjectKind } from "./core/projects"
import EditorWorkspace from "./pages/EditorWorkspace"
import ProjectDashboard from "./pages/ProjectDashboard"

export default function App() {
  // The app has two high-level screens: project dashboard and editor workspace.
  const [view, setView] = useState<"projects" | "editor">("editor")
  // All project data (tabs + content) lives at the App level so child pages stay stateless.
  const [projects, setProjects] = useState<Project[]>(() => [createProject("Book 1", "Book")])
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [bookCounter, setBookCounter] = useState(2)
  const [blogCounter, setBlogCounter] = useState(1)

  // Resolve the active project ID to a real project object with a fallback.
  const activeProject = useMemo(() => {
    if (!activeProjectId) {
      return projects[0] ?? null
    }

    return projects.find((project) => project.id === activeProjectId) ?? projects[0] ?? null
  }, [projects, activeProjectId])

  const activeContent = useMemo(() => {
    if (!activeProject || !activeProject.activeId) {
      return DEFAULT_DOCUMENT_CONTENT
    }

    return activeProject.contentById[activeProject.activeId] ?? DEFAULT_DOCUMENT_CONTENT
  }, [activeProject])

  useEffect(() => {
    // Keep an active project selected whenever projects are present.
    if (!activeProjectId && projects[0]) {
      setActiveProjectId(projects[0].id)
    }
  }, [projects, activeProjectId])

  // Central helper used by editor page children to mutate only the active project.
  const updateActiveProject = (updater: (project: Project) => Project) => {
    const currentActiveId = activeProjectId ?? activeProject?.id
    if (!currentActiveId) {
      return
    }

    setProjects((current) =>
      current.map((project) => {
        if (project.id !== currentActiveId) {
          return project
        }

        return updater(project)
      }),
    )
  }

  const createNewProject = (kind: ProjectKind, folderId?: string) => {
    // Auto-name projects by kind to mirror docs-style quick creation.
    const nextName = kind === "Book" ? `Book ${bookCounter}` : `Blog ${blogCounter}`
    const nextProject = createProject(nextName, kind)

    setProjects((current) => [
      {
        ...nextProject,
        folderId: folderId ?? null,
        rootPosition: folderId ? nextProject.rootPosition : "top",
      },
      ...current,
    ])
    setActiveProjectId(nextProject.id)

    if (kind === "Book") {
      setBookCounter((current) => current + 1)
    } else {
      setBlogCounter((current) => current + 1)
    }
  }

  const openProject = (projectId: string) => {
    // Opening a project always transitions to the editor workspace.
    setActiveProjectId(projectId)
    setView("editor")
  }

  return (
    <div className="app">
      <main className="app-main">
        <WebMenu items={view === "projects" ? projectWorkspaceMenu : undefined} />
        <button
          type="button"
          className={`app-brand ${view === "editor" || view === "projects" ? "app-brand--with-menu" : ""}`.trim()}
          aria-label="Go to projects"
          onClick={() => {
            setView("projects")
          }}
        >
          <span className="app-brand__name">ivoryscribe</span>
          <span className="app-brand__tagline">write an epic. save a species.</span>
        </button>

        {/* Dashboard if requested (or if nothing is active), otherwise the editor workspace. */}
        {view === "projects" || !activeProject ? (
          <ProjectDashboard
            projects={projects}
            activeProjectId={activeProjectId}
            onCreateProject={createNewProject}
            onOpenProject={openProject}
            setProjects={setProjects}
            setActiveProjectId={setActiveProjectId}
          />
        ) : (
          <EditorWorkspace
            project={activeProject}
            activeContent={activeContent}
            onProjectChange={updateActiveProject}
          />
        )}
      </main>
    </div>
  )
}