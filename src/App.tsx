import { useEffect, useMemo, useState, type CSSProperties } from "react"
import "./App.css"
import GlobalSettings from "./components/GlobalSettings"
import GlobalCaretOverlay from "./components/GlobalCaretOverlay"
import WebMenu from "./components/WebMenu"
import { FONT_OPTIONS, PALETTE_OPTIONS, type Palette } from "./core/appearance"
import {
  APP_COLOR_PALETTE_CHANGE_EVENT,
  EDITOR_FONT_FAMILY_CHANGE_EVENT,
  EDITOR_FONT_SIZE_CHANGE_EVENT,
  EDITOR_FONT_SIZE_SET_EVENT,
  requestAppColorPaletteChange,
  requestEditorFontFamilyChange,
  requestEditorFontSizeSet,
} from "./core/editorEvents"
import { projectWorkspaceMenu } from "./core/menu"
import { exportProjectAsPdf } from "./core/pdfExport"
import { DEFAULT_DOCUMENT_CONTENT, createProject, type Project, type ProjectKind } from "./core/projects"
import EditorWorkspace from "./pages/EditorWorkspace"
import ProjectDashboard, { type ProjectFolder } from "./pages/ProjectDashboard"

const MIN_FONT_SIZE = 20
const MAX_FONT_SIZE = 84
const VIEW_FADE_DURATION_MS = 240
const DEFAULT_CUSTOM_BACKGROUND = "#0f0f0f"
const DEFAULT_CUSTOM_ACCENT = "#9ab8ff"

function hexToRgb(value: string) {
  const normalized = value.trim().replace("#", "")
  if (normalized.length !== 6) {
    return null
  }

  const parsed = Number.parseInt(normalized, 16)
  if (Number.isNaN(parsed)) {
    return null
  }

  return {
    r: (parsed >> 16) & 255,
    g: (parsed >> 8) & 255,
    b: parsed & 255,
  }
}

function mixHexColors(base: string, target: string, ratio: number) {
  const from = hexToRgb(base)
  const to = hexToRgb(target)

  if (!from || !to) {
    return base
  }

  const clampRatio = Math.min(1, Math.max(0, ratio))
  const r = Math.round(from.r + (to.r - from.r) * clampRatio)
  const g = Math.round(from.g + (to.g - from.g) * clampRatio)
  const b = Math.round(from.b + (to.b - from.b) * clampRatio)

  return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`
}

function pickReadableTextColor(background: string) {
  const rgb = hexToRgb(background)
  if (!rgb) {
    return "#f5f5f5"
  }

  const brightness = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000
  return brightness >= 150 ? "#111111" : "#f5f5f5"
}

function clampFontSize(value: number) {
  return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, value))
}

function getSystemPalette(isDarkMode: boolean): Palette {
  return isDarkMode ? "elephant" : "ivory"
}

function getInitialPalette(): Palette {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "ivory"
  }

  return getSystemPalette(window.matchMedia("(prefers-color-scheme: dark)").matches)
}

export default function App() {
  // The app has two high-level screens: project dashboard and editor workspace.
  const [view, setView] = useState<"projects" | "editor">("editor")
  // All project data (tabs + content) lives at the App level so child pages stay stateless.
  const [projects, setProjects] = useState<Project[]>(() => [createProject("Book 1", "Book")])
  const [folders, setFolders] = useState<ProjectFolder[]>([])
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [bookCounter, setBookCounter] = useState(2)
  const [blogCounter, setBlogCounter] = useState(1)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isMenuBarEnabled, setIsMenuBarEnabled] = useState(false)
  const [isFlagsEnabled, setIsFlagsEnabled] = useState(false)
  const [isEditorTyping, setIsEditorTyping] = useState(false)
  const [selectedFont, setSelectedFont] = useState<string>(FONT_OPTIONS[0]!.value)
  const [customFontName, setCustomFontName] = useState("")
  const [isCustomFontSelected, setIsCustomFontSelected] = useState(false)
  const [isGlobalTextEnabled, setIsGlobalTextEnabled] = useState(false)
  const [fontSize, setFontSize] = useState(32)
  const [palette, setPalette] = useState<Palette>(() => getInitialPalette())
  const [customPaletteBackground, setCustomPaletteBackground] = useState(DEFAULT_CUSTOM_BACKGROUND)
  const [customPaletteAccent, setCustomPaletteAccent] = useState(DEFAULT_CUSTOM_ACCENT)
  const [viewFadePhase, setViewFadePhase] = useState<"idle" | "fading-out" | "fading-in">("idle")

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

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return
    }

    const colorSchemeQuery = window.matchMedia("(prefers-color-scheme: dark)")

    const onColorSchemeChange = (event: MediaQueryListEvent) => {
      setPalette(getSystemPalette(event.matches))
    }

    const legacyColorSchemeQuery = colorSchemeQuery as MediaQueryList & {
      addListener?: (listener: (event: MediaQueryListEvent) => void) => void
      removeListener?: (listener: (event: MediaQueryListEvent) => void) => void
    }

    if ("addEventListener" in colorSchemeQuery) {
      colorSchemeQuery.addEventListener("change", onColorSchemeChange)
    } else if (legacyColorSchemeQuery.addListener) {
      legacyColorSchemeQuery.addListener(onColorSchemeChange)
    }

    return () => {
      if ("removeEventListener" in colorSchemeQuery) {
        colorSchemeQuery.removeEventListener("change", onColorSchemeChange)
      } else if (legacyColorSchemeQuery.removeListener) {
        legacyColorSchemeQuery.removeListener(onColorSchemeChange)
      }
    }
  }, [])

  useEffect(() => {
    const onFontFamilyChange = (event: Event) => {
      const customEvent = event as CustomEvent<{ fontFamily: string }>
      const nextFontFamily = customEvent.detail?.fontFamily
      if (!nextFontFamily) {
        return
      }

      setSelectedFont(nextFontFamily)
    }

    const onFontSizeChange = (event: Event) => {
      const customEvent = event as CustomEvent<{ delta: number }>
      const delta = customEvent.detail?.delta ?? 0

      if (!delta) {
        return
      }

      setFontSize((current) => clampFontSize(current + delta))
    }

    const onFontSizeSet = (event: Event) => {
      const customEvent = event as CustomEvent<{ value: number }>
      const value = customEvent.detail?.value
      if (typeof value !== "number" || Number.isNaN(value)) {
        return
      }

      setFontSize(clampFontSize(value))
    }

    const onPaletteChange = (event: Event) => {
      const customEvent = event as CustomEvent<{ palette: string }>
      const nextPalette = customEvent.detail?.palette
      if (!nextPalette) {
        return
      }

      const isSupported = PALETTE_OPTIONS.some((option) => option.value === nextPalette)
      if (!isSupported) {
        return
      }

      setPalette(nextPalette as Palette)
    }

    window.addEventListener(EDITOR_FONT_FAMILY_CHANGE_EVENT, onFontFamilyChange as EventListener)
    window.addEventListener(EDITOR_FONT_SIZE_CHANGE_EVENT, onFontSizeChange as EventListener)
    window.addEventListener(EDITOR_FONT_SIZE_SET_EVENT, onFontSizeSet as EventListener)
    window.addEventListener(APP_COLOR_PALETTE_CHANGE_EVENT, onPaletteChange as EventListener)

    return () => {
      window.removeEventListener(EDITOR_FONT_FAMILY_CHANGE_EVENT, onFontFamilyChange as EventListener)
      window.removeEventListener(EDITOR_FONT_SIZE_CHANGE_EVENT, onFontSizeChange as EventListener)
      window.removeEventListener(EDITOR_FONT_SIZE_SET_EVENT, onFontSizeSet as EventListener)
      window.removeEventListener(APP_COLOR_PALETTE_CHANGE_EVENT, onPaletteChange as EventListener)
    }
  }, [])

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

  const returnToProjectDashboard = () => {
    // Smoothly transition back to the dashboard instead of snapping between screens.
    if (viewFadePhase !== "idle") {
      return
    }

    setViewFadePhase("fading-out")
  }

  useEffect(() => {
    if (viewFadePhase !== "fading-out") {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setView("projects")
      setViewFadePhase("fading-in")
    }, VIEW_FADE_DURATION_MS)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [viewFadePhase])

  useEffect(() => {
    if (viewFadePhase !== "fading-in") {
      return
    }

    const frameId = window.requestAnimationFrame(() => {
      setViewFadePhase("idle")
    })

    return () => {
      window.cancelAnimationFrame(frameId)
    }
  }, [viewFadePhase])

  const applyFontFamily = (fontFamily: string) => {
    setSelectedFont(fontFamily)
    setCustomFontName("")
    setIsCustomFontSelected(false)
    requestEditorFontFamilyChange(fontFamily)
  }

  const applyCustomFontName = (fontName: string) => {
    const trimmedName = fontName.trim()
    setCustomFontName(trimmedName)
    setIsCustomFontSelected(true)

    if (!trimmedName) {
      return
    }

    const nextFontFamily = `"${trimmedName}", "Times", "Times New Roman", serif`
    setSelectedFont(nextFontFamily)
    requestEditorFontFamilyChange(nextFontFamily)
  }

  const applyFontSize = (nextFontSize: number) => {
    requestEditorFontSizeSet(clampFontSize(nextFontSize))
  }

  const shouldApplyGlobalFont = isGlobalTextEnabled
  const appStyleVariables = useMemo(() => {
    const variables: Record<string, string> = {
      "--app-font-family": selectedFont,
    }

    if (palette !== "custom") {
      return variables as CSSProperties
    }

    const textColor = pickReadableTextColor(customPaletteBackground)
    const menuBackground = mixHexColors(customPaletteBackground, textColor === "#111111" ? "#ffffff" : "#000000", 0.06)
    const menuHover = mixHexColors(customPaletteBackground, textColor === "#111111" ? "#ffffff" : "#000000", 0.12)
    const dropdownBackground = mixHexColors(customPaletteBackground, textColor === "#111111" ? "#ffffff" : "#000000", 0.09)
    const borderColor = mixHexColors(customPaletteBackground, textColor, 0.18)
    const placeholderColor = textColor === "#111111" ? "rgba(17, 17, 17, 0.44)" : "rgba(245, 245, 245, 0.46)"
    const isLightTextMode = textColor === "#111111"

    variables["--app-bg"] = customPaletteBackground
    variables["--app-accent"] = customPaletteAccent
    variables["--brand-color"] = textColor
    variables["--menu-bg"] = menuBackground
    variables["--menu-border"] = borderColor
    variables["--menu-button"] = textColor
    variables["--menu-button-hover-bg"] = menuHover
    variables["--menu-dropdown-bg"] = dropdownBackground
    variables["--menu-dropdown-border"] = borderColor
    variables["--editor-text"] = textColor
    variables["--editor-title"] = textColor
    variables["--editor-placeholder"] = placeholderColor
    variables["--project-wallpaper-opacity"] = isLightTextMode ? "0.2" : "0.12"
    variables["--project-wallpaper-filter"] = isLightTextMode ? "grayscale(1) brightness(0.22) contrast(1.2)" : "none"

    return variables as CSSProperties
  }, [customPaletteAccent, customPaletteBackground, palette, selectedFont])

  return (
    <div
      className={`app app--palette-${palette} ${shouldApplyGlobalFont ? "app--custom-font" : ""}`.trim()}
      style={appStyleVariables}
    >
      <main className="app-main">
        {isMenuBarEnabled ? <WebMenu items={view === "projects" ? projectWorkspaceMenu : undefined} /> : null}
        <button
          type="button"
          className={`app-brand ${isMenuBarEnabled && (view === "editor" || view === "projects") ? "app-brand--with-menu" : ""}`.trim()}
          aria-label="Go to projects"
          onClick={() => {
            setView("projects")
          }}
        >
          <span className="app-brand__name">ivoryscribe</span>
          <span className="app-brand__tagline">write an epic. save a species.</span>
        </button>

        {/* Dashboard if requested (or if nothing is active), otherwise the editor workspace. */}
        <div className={`app-view ${viewFadePhase === "fading-out" ? "app-view--fade-out" : ""} ${viewFadePhase === "fading-in" ? "app-view--fade-in" : ""}`.trim()}>
          {view === "projects" || !activeProject ? (
            <ProjectDashboard
              projects={projects}
              folders={folders}
              activeProjectId={activeProjectId}
              onCreateProject={createNewProject}
              onOpenProject={openProject}
              setProjects={setProjects}
              setFolders={setFolders}
              setActiveProjectId={setActiveProjectId}
            />
          ) : (
            <EditorWorkspace
              project={activeProject}
              activeContent={activeContent}
              menuBarEnabled={isMenuBarEnabled}
              flagsEnabled={isFlagsEnabled}
              isEditorTyping={isEditorTyping}
              onReturnToDashboard={returnToProjectDashboard}
              onProjectChange={updateActiveProject}
              onEditorTypingStateChange={setIsEditorTyping}
            />
          )}
        </div>

        <GlobalSettings
          isOpen={isSettingsOpen}
          showProjectPreferences={view === "editor"}
          menuBarEnabled={isMenuBarEnabled}
          flagsEnabled={isFlagsEnabled}
          hideTrigger={isEditorTyping}
          selectedFont={selectedFont}
          globalTextEnabled={isGlobalTextEnabled}
          fontSize={fontSize}
          palette={palette}
          paletteOptions={PALETTE_OPTIONS}
          fontOptions={[...FONT_OPTIONS]}
          customFontName={customFontName}
          customFontSelected={isCustomFontSelected}
          onToggleOpen={() => {
            setIsSettingsOpen((current) => !current)
          }}
          onClose={() => {
            setIsSettingsOpen(false)
          }}
          onMenuBarEnabledChange={setIsMenuBarEnabled}
          onFlagsEnabledChange={setIsFlagsEnabled}
          onFontChange={applyFontFamily}
          onCustomFontNameChange={applyCustomFontName}
          onCustomFontSelectedChange={setIsCustomFontSelected}
          onGlobalTextEnabledChange={setIsGlobalTextEnabled}
          onFontSizeChange={applyFontSize}
          onPaletteChange={(nextPalette) => {
            requestAppColorPaletteChange(nextPalette)
          }}
          customPaletteBackground={customPaletteBackground}
          customPaletteAccent={customPaletteAccent}
          onCustomPaletteBackgroundChange={setCustomPaletteBackground}
          onCustomPaletteAccentChange={setCustomPaletteAccent}
          activeProjectName={activeProject?.name ?? ""}
          activeProjectKind={activeProject?.kind ?? "Book"}
          activeProjectColor={activeProject?.color ?? "#7ea8ff"}
          activeProjectWallpaperEmojis={activeProject?.wallpaperEmojis ?? ""}
          onActiveProjectNameChange={(nextName) => {
            updateActiveProject((currentProject) => ({
              ...currentProject,
              name: nextName,
            }))
          }}
          onActiveProjectKindChange={(nextKind) => {
            updateActiveProject((currentProject) => ({
              ...currentProject,
              kind: nextKind,
            }))
          }}
          onActiveProjectColorChange={(nextColor) => {
            updateActiveProject((currentProject) => ({
              ...currentProject,
              color: nextColor,
            }))
          }}
          onActiveProjectWallpaperEmojisChange={(nextWallpaperEmojis) => {
            updateActiveProject((currentProject) => ({
              ...currentProject,
              wallpaperEmojis: nextWallpaperEmojis,
            }))
          }}
          onExportProjectAsPdf={() => {
            if (!activeProject) {
              return
            }

            exportProjectAsPdf(activeProject)
          }}
        />
      </main>
      <GlobalCaretOverlay />
    </div>
  )
}