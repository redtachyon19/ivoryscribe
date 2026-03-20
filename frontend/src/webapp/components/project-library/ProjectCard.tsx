import { useEffect, useRef, useState, type CSSProperties, type DragEvent, type MouseEvent as ReactMouseEvent } from "react"
import { BookText, GripVertical, NotebookText, Settings2, SquareArrowOutUpRight, X } from "lucide-react"
import { collectTabIds, getProjectEntryTerms, type Project } from "../../../core/projects"
import { extractEmojiTokens } from "../../../core/projectLibraryUtils"
import GhostButton from "../ui/GhostButton"

function hexToRgba(hex: string, alpha: number) {
  const normalized = hex.replace("#", "")
  if (normalized.length !== 6) {
    return `rgba(126, 168, 255, ${alpha})`
  }

  const red = Number.parseInt(normalized.slice(0, 2), 16)
  const green = Number.parseInt(normalized.slice(2, 4), 16)
  const blue = Number.parseInt(normalized.slice(4, 6), 16)
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}

function formatProjectDate(dateValue: string) {
  const parsed = new Date(dateValue)
  if (Number.isNaN(parsed.getTime())) {
    return "--.--.----"
  }

  const month = String(parsed.getMonth() + 1).padStart(2, "0")
  const day = String(parsed.getDate()).padStart(2, "0")
  const year = parsed.getFullYear()
  return `${month}.${day}.${year}`
}

function buildProjectEmojiWallpaperRows(value: string) {
  const emojis = extractEmojiTokens(value, 3)
  if (!emojis.length) {
    return [] as string[]
  }

  const rowCount = 22
  const symbolsPerRow = 30
  const seedSource = emojis.join("|")
  let seed = 0

  for (let i = 0; i < seedSource.length; i += 1) {
    seed = (seed * 31 + seedSource.charCodeAt(i)) >>> 0
  }

  // Deterministic PRNG so the pattern remains stable for a given emoji set.
  const nextRandom = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 4294967296
  }

  return Array.from({ length: rowCount }, () => {
    let previousIndex = -1

    return Array.from({ length: symbolsPerRow }, () => {
      let index = Math.floor(nextRandom() * emojis.length)

      // Prevent long runs of the same emoji when multiple choices exist.
      if (emojis.length > 1 && index === previousIndex) {
        index = (index + 1 + Math.floor(nextRandom() * (emojis.length - 1))) % emojis.length
      }

      previousIndex = index
      return emojis[index]
    }).join(" ")
  })
}

export type ProjectCardProps = {
  project: Project
  isDragging: boolean
  dropClassName: string
  openProjectSettingsId: string | null
  onOpenProject: (projectId: string) => void
  onOpenProjectInNewTab: (projectId: string) => void
  onOpenProjectSettings: (project: Project) => void
  onCloseProjectSettings: () => void
  onDragStart: (projectId: string, event: DragEvent<HTMLButtonElement>) => void
  onDragEnd: () => void
  onDragEnter: (event: DragEvent<HTMLElement>) => void
  onDragOver: (event: DragEvent<HTMLElement>) => void
  onDrop: (event: DragEvent<HTMLElement>) => void
  setEditingProjectId: (id: string | null) => void
  editingProjectId: string | null
  setProjects: React.Dispatch<React.SetStateAction<Project[]>>
}

export default function ProjectCard({
  project,
  isDragging,
  dropClassName,
  openProjectSettingsId,
  onOpenProject,
  onOpenProjectInNewTab,
  onOpenProjectSettings,
  onCloseProjectSettings,
  onDragStart,
  onDragEnd,
  onDragEnter,
  onDragOver,
  onDrop,
  setEditingProjectId,
  editingProjectId,
  setProjects,
}: ProjectCardProps) {
  const [editingName, setEditingName] = useState("")
  const renameTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  const titleScrollFrameRef = useRef<number | null>(null)
  const titleScrollDirectionRef = useRef<1 | -1>(1)

  const isEditing = editingProjectId === project.id

  const stopTitleAutoScroll = (resetElement?: HTMLHeadingElement) => {
    if (titleScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(titleScrollFrameRef.current)
      titleScrollFrameRef.current = null
    }

    titleScrollDirectionRef.current = 1

    if (resetElement) {
      resetElement.scrollTop = 0
    }
  }

  const startTitleAutoScroll = (element: HTMLHeadingElement) => {
    stopTitleAutoScroll()

    const maxScroll = element.scrollHeight - element.clientHeight
    if (maxScroll <= 0) {
      return
    }

    let previousTime = performance.now()
    const speed = 18
    let currentTop = element.scrollTop

    const step = (time: number) => {
      const elapsedSeconds = (time - previousTime) / 1000
      previousTime = time

      const maxTop = element.scrollHeight - element.clientHeight
      if (maxTop <= 0) {
        stopTitleAutoScroll(element)
        return
      }

      const nextTop = Math.min(maxTop, currentTop + speed * elapsedSeconds)

      currentTop = nextTop
      element.scrollTop = currentTop

      if (currentTop >= maxTop) {
        titleScrollFrameRef.current = null
        return
      }

      titleScrollFrameRef.current = window.requestAnimationFrame(step)
    }

    titleScrollFrameRef.current = window.requestAnimationFrame(step)
  }

  useEffect(() => {
    return () => {
      stopTitleAutoScroll()
    }
  }, [])

  const cancelRename = () => {
    setEditingProjectId(null)
    setEditingName("")
  }

  const commitRename = () => {
    if (!isEditing) {
      return
    }

    const trimmed = editingName.trim()
    if (trimmed) {
      setProjects((current) =>
        current.map((p) =>
          p.id === project.id
            ? {
                ...p,
                name: trimmed,
              }
            : p,
        ),
      )
    }

    cancelRename()
  }

  const resizeRenameTextarea = (element: HTMLTextAreaElement) => {
    element.style.height = "0px"
    const computed = window.getComputedStyle(element)
    const lineHeight = Number.parseFloat(computed.lineHeight) || 20
    const verticalPadding = Number.parseFloat(computed.paddingTop) + Number.parseFloat(computed.paddingBottom)
    const maxHeight = lineHeight * 3 + verticalPadding
    const nextHeight = Math.min(element.scrollHeight, maxHeight)
    element.style.height = `${nextHeight}px`
    element.style.overflowY = element.scrollHeight > maxHeight ? "auto" : "hidden"
  }

  useEffect(() => {
    if (!isEditing || !renameTextareaRef.current) {
      return
    }

    resizeRenameTextarea(renameTextareaRef.current)
  }, [isEditing, editingName])

  const renderProjectRenameEditor = () => {
    return (
      <div className="project-card__rename-wrap">
        <textarea
          className="project-card__rename-input"
          value={editingName}
          autoFocus
          rows={1}
          ref={(element) => {
            renameTextareaRef.current = element
            if (element) {
              resizeRenameTextarea(element)
            }
          }}
          onFocus={(event) => {
            event.target.select()
            resizeRenameTextarea(event.target)
          }}
          onChange={(event) => {
            setEditingName(event.target.value)
            resizeRenameTextarea(event.target)
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault()
              commitRename()
            }

            if (event.key === "Escape") {
              event.preventDefault()
              cancelRename()
            }
          }}
          onBlur={() => {
            commitRename()
          }}
        />
      </div>
    )
  }

  const entryCount = collectTabIds(project.tabs).length
  const { singular, plural } = getProjectEntryTerms(project.kind)
  const entryLabel = entryCount === 1 ? singular.toLowerCase() : plural.toLowerCase()
  const wallpaperRows = buildProjectEmojiWallpaperRows(project.wallpaperEmojis ?? "")

  const handleProjectCardClick = (event: ReactMouseEvent<HTMLElement>) => {
    if (isEditing) {
      return
    }

    const target = event.target
    if (target instanceof Element && target.closest("button, input, textarea, select, label")) {
      return
    }

    onOpenProject(project.id)
  }

  return (
    <li
      className={`project-card ${dropClassName} ${isDragging ? "project-card--dragging" : ""}`.trim()}
      style={
        {
          "--project-accent": project.color,
          "--project-accent-soft": hexToRgba(project.color, 0.14),
        } as CSSProperties
      }
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onClick={handleProjectCardClick}
    >
      {wallpaperRows.length ? (
        <div className="project-card__emoji-wallpaper" aria-hidden="true">
          <div className="project-card__emoji-wallpaper-grid">
            {wallpaperRows.map((row, index) => (
              <span key={`${project.id}-wallpaper-row-${index}`} className="project-card__emoji-wallpaper-row">
                {row}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <button
        type="button"
        className="project-card__drag-handle"
        aria-label={`Drag ${project.name}`}
        draggable
        onDragStart={(event) => {
          onDragStart(project.id, event)
        }}
        onDragEnd={() => {
          onDragEnd()
        }}
      >
        <GripVertical size={14} strokeWidth={2} aria-hidden="true" />
      </button>

      <div className="project-card__content">
        <div className="project-card__top-row">
          <div className="project-card__actions">
            <GhostButton
              small
              className="project-card__icon-btn"
              aria-label={`Open ${project.name} in new tab`}
              label="Open in New Tab"
              onClick={() => {
                onOpenProjectInNewTab(project.id)
              }}
            >
              <SquareArrowOutUpRight size={14} strokeWidth={2} aria-hidden={true} />
            </GhostButton>

            <GhostButton
              small
              className="project-card__icon-btn"
              aria-label={openProjectSettingsId === project.id ? "Cancel" : `Edit ${project.name}`}
              label={openProjectSettingsId === project.id ? "Cancel" : "Edit Project"}
              onClick={() => {
                if (openProjectSettingsId === project.id) {
                  onCloseProjectSettings()
                  return
                }

                onOpenProjectSettings(project)
              }}
            >
              {openProjectSettingsId === project.id ? <X size={14} strokeWidth={2} aria-hidden={true} /> : <Settings2 size={14} strokeWidth={2} aria-hidden={true} />}
            </GhostButton>
          </div>
        </div>

        {isEditing ? (
          renderProjectRenameEditor()
        ) : (
          <h2
            onMouseEnter={(event) => {
              startTitleAutoScroll(event.currentTarget)
            }}
            onWheel={() => {
              stopTitleAutoScroll()
            }}
            onMouseLeave={(event) => {
              stopTitleAutoScroll(event.currentTarget)
            }}
          >
            {project.name}
          </h2>
        )}

        <div className="project-card__details" aria-label={`Type ${project.kind}, ${entryCount} ${entryLabel}, last edited ${formatProjectDate(project.createdAt)}`}>
          <div className="project-card__meta">
            <span className="project-card__meta-kind">
              {project.kind === "Book" ? (
                <BookText size={13} strokeWidth={1.9} aria-hidden="true" />
              ) : (
                <NotebookText size={13} strokeWidth={1.9} aria-hidden="true" />
              )}
              <span>{project.kind}</span>
            </span>
            <span className="project-card__meta-separator" aria-hidden="true">&middot;</span>
            <span className="project-card__meta-count">{`${entryCount} ${entryLabel}`}</span>
          </div>
          <span className="project-card__last-edited">{`Last edited ${formatProjectDate(project.createdAt)}`}</span>
        </div>

      </div>
    </li>
  )
}
