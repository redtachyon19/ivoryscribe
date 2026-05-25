import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type MouseEvent as ReactMouseEvent } from "react"
import { Cloud, Users } from "lucide-react"
import { iconForProjectKind } from "../../../core/utils/projectIcons"
import { collectTabIds, getProjectEntryTerms, type Project } from "../../../core/utils/projects"
import { extractEmojiTokens } from "../../../core/utils/libraryUtils"
import MarqueeText from "../ui/MarqueeText"

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

const tintedEmojiCache = new Map<string, string>()

function getTintedEmojiDataUrl(emoji: string, color: string) {
  const cacheKey = `${emoji}|${color}`
  const cached = tintedEmojiCache.get(cacheKey)
  if (cached) {
    return cached
  }

  if (typeof document === "undefined") {
    return ""
  }

  const canvasSize = 64
  const canvas = document.createElement("canvas")
  canvas.width = canvasSize
  canvas.height = canvasSize

  const context = canvas.getContext("2d")
  if (!context) {
    return ""
  }

  context.clearRect(0, 0, canvasSize, canvasSize)
  context.textAlign = "center"
  context.textBaseline = "middle"
  context.font = '56px "Apple Color Emoji", "Segoe UI Emoji", "Noto Emoji", sans-serif'
  context.fillText(emoji, canvasSize / 2, canvasSize / 2 + 1)

  context.globalCompositeOperation = "source-in"
  context.fillStyle = color
  context.fillRect(0, 0, canvasSize, canvasSize)

  const dataUrl = canvas.toDataURL("image/png")
  tintedEmojiCache.set(cacheKey, dataUrl)
  return dataUrl
}

function formatRelativeTime(dateValue: string) {
  const parsed = new Date(dateValue)
  if (Number.isNaN(parsed.getTime())) {
    return "—"
  }

  const now = Date.now()
  const diffMs = now - parsed.getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return "Just now"
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay === 1) return "Yesterday"
  if (diffDay < 7) return `${diffDay}d ago`
  const diffWk = Math.floor(diffDay / 7)
  if (diffWk < 5) return `${diffWk}w ago`
  const diffMo = Math.floor(diffDay / 30)
  if (diffMo < 12) return `${diffMo}mo ago`
  return `${Math.floor(diffDay / 365)}y ago`
}

type EmojiWallpaperGlyph = {
  key: string
  emoji: string
  top: string
  left: string
}

function buildEmojiWallpaperGlyphs(wallpaperEmojis: string): EmojiWallpaperGlyph[] {
  const tokens = Array.from(new Set(extractEmojiTokens(wallpaperEmojis, 6)))
  if (tokens.length === 0) {
    return []
  }

  const rows = 8
  const columns = 10
  const glyphs: EmojiWallpaperGlyph[] = []

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const top = row * 23 + column * 2 - 20
      const left = column * 36 + row * 18 - 88
      const evenEmoji = tokens[row % tokens.length] ?? tokens[0]
      const oddEmoji = tokens[(row + 1) % tokens.length] ?? tokens[0]
      const emoji = (row + column) % 2 === 0 ? evenEmoji : oddEmoji

      glyphs.push({
        key: `${row}-${column}`,
        emoji,
        top: `${top}px`,
        left: `${left}px`,
      })
    }
  }

  return glyphs
}

export type ProjectCardProps = {
  project: Project
  isDragging: boolean
  dropClassName: string
  onOpenProject: (projectId: string) => void
  onOpenInNewTab?: (projectId: string) => void
  onDragStart: (projectId: string, event: DragEvent<HTMLElement>) => void
  onDragEnd: () => void
  onDragEnter: (event: DragEvent<HTMLElement>) => void
  onDragOver: (event: DragEvent<HTMLElement>) => void
  onDrop: (event: DragEvent<HTMLElement>) => void
  setEditingProjectId: (id: string | null) => void
  editingProjectId: string | null
  setProjects: React.Dispatch<React.SetStateAction<Project[]>>
  onContextMenu?: (projectId: string, x: number, y: number) => void
  marqueeSelected?: boolean
  /** True when this project is currently shared. Implies cloud — shared
   *  projects in the new model are by definition cloud projects. Shows
   *  a Users icon in place of the Cloud icon. */
  isShared?: boolean
}

export default function ProjectCard({
  project,
  isDragging,
  dropClassName,
  onOpenProject,
  onOpenInNewTab,
  onDragStart,
  onDragEnd,
  onDragEnter,
  onDragOver,
  onDrop,
  setEditingProjectId,
  editingProjectId,
  setProjects,
  onContextMenu,
  marqueeSelected,
  isShared = false,
}: ProjectCardProps) {
  const [editingName, setEditingName] = useState("")
  const renameTextareaRef = useRef<HTMLTextAreaElement | null>(null)

  const isEditing = editingProjectId === project.id

  const cancelRename = () => {
    setEditingProjectId(null)
    setEditingName("")
  }

  const commitRename = () => {
    if (!isEditing) return

    const trimmed = editingName.trim()
    if (trimmed) {
      setProjects((current) =>
        current.map((p) =>
          p.id === project.id ? { ...p, name: trimmed } : p,
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
    const maxHeight = lineHeight * 2 + verticalPadding
    const nextHeight = Math.min(element.scrollHeight, maxHeight)
    element.style.height = `${nextHeight}px`
    element.style.overflowY = element.scrollHeight > maxHeight ? "auto" : "hidden"
  }

  useEffect(() => {
    if (!isEditing || !renameTextareaRef.current) return
    resizeRenameTextarea(renameTextareaRef.current)
  }, [isEditing, editingName])

  const entryCount = collectTabIds(project.tabs).length
  const { singular, plural } = getProjectEntryTerms(project.kind)
  const entryLabel = entryCount === 1 ? singular.toLowerCase() : plural.toLowerCase()
  const emojiWallpaperGlyphs = useMemo(
    () => buildEmojiWallpaperGlyphs(project.wallpaperEmojis ?? ""),
    [project.wallpaperEmojis],
  )
  const thumbEmojis = useMemo(
    () => extractEmojiTokens(project.wallpaperEmojis ?? "", 3),
    [project.wallpaperEmojis],
  )
  const tintedEmojiByToken = useMemo(() => {
    const tokens = Array.from(new Set(emojiWallpaperGlyphs.map((glyph) => glyph.emoji)))
    const byToken = new Map<string, string>()

    for (const token of tokens) {
      const tintedEmoji = getTintedEmojiDataUrl(token, project.color)
      if (tintedEmoji) {
        byToken.set(token, tintedEmoji)
      }
    }

    return byToken
  }, [emojiWallpaperGlyphs, project.color])

  const handleProjectCardClick = (event: ReactMouseEvent<HTMLElement>) => {
    if (isEditing) return
    const target = event.target
    if (target instanceof Element && target.closest("button, input, textarea, select, label")) return
    if ((event.metaKey || event.ctrlKey) && onOpenInNewTab) {
      onOpenInNewTab(project.id)
    } else {
      onOpenProject(project.id)
    }
  }

  return (
    <li
      data-selectable-id={project.id}
      className={`project-card ${dropClassName} ${isDragging ? "project-card--dragging" : ""} ${marqueeSelected ? "project-card--marquee-selected" : ""}`.trim()}
      style={
        {
          "--project-accent": project.color,
          "--project-accent-soft": hexToRgba(project.color, 0.05),
        } as CSSProperties
      }
      draggable
      onDragStart={(event) => onDragStart(project.id, event)}
      onDragEnd={() => onDragEnd()}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onClick={handleProjectCardClick}
      onContextMenu={(event) => {
        if (onContextMenu) {
          event.preventDefault()
          onContextMenu(project.id, event.clientX, event.clientY)
        }
      }}
    >
      <div className="project-card__thumb" aria-hidden="true">
        {emojiWallpaperGlyphs.length > 0 ? (
          <div className="project-card__emoji-wallpaper">
            {emojiWallpaperGlyphs.map((glyph) => {
              const tintedEmoji = tintedEmojiByToken.get(glyph.emoji)

              return (
                <span
                  key={glyph.key}
                  className="project-card__emoji-glyph"
                  style={
                    {
                      top: glyph.top,
                      left: glyph.left,
                    } as CSSProperties
                  }
                >
                  {tintedEmoji ? (
                    <img className="project-card__emoji-glyph-image" src={tintedEmoji} alt="" draggable={false} />
                  ) : (
                    glyph.emoji
                  )}
                </span>
              )
            })}
          </div>
        ) : null}
        {thumbEmojis.length > 0 ? (
          <div className="project-card__thumb-emojis">
            {thumbEmojis.map((emoji, index) => (
              <span key={`${emoji}-${index}`} className="project-card__thumb-emoji">{emoji}</span>
            ))}
          </div>
        ) : (
          (() => {
            // Branch on kind so each project type carries its own icon —
            // see core/utils/projectIcons.ts for the resolver.
            const Icon = iconForProjectKind(project.kind)
            return <Icon className="project-card__thumb-icon" size={28} strokeWidth={1.6} />
          })()
        )}
      </div>

      <div className="project-card__info">
        {isEditing ? (
          <div className="project-card__rename-wrap">
            <textarea
              className="project-card__rename-input"
              value={editingName}
              autoFocus
              rows={1}
              ref={(element) => {
                renameTextareaRef.current = element
                if (element) resizeRenameTextarea(element)
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
              onBlur={() => commitRename()}
            />
          </div>
        ) : (
          <strong className="project-card__title" data-marquee-parent>
            <MarqueeText text={project.name} />
          </strong>
        )}
        <span>
          {entryCount} {entryLabel} &middot; {formatRelativeTime(project.createdAt)}
          {/* Cloud / shared chip. Driven by the project's `source`
              field (the only "is this in the cloud?" signal in the
              new model — no more cache/cloud-id sniffing). Shared
              takes precedence since every shared project is by
              definition a cloud project. */}
          {project.source === "cloud" ? (
            isShared ? (
              <>
                {" · "}
                <Users size={12} strokeWidth={2} aria-hidden="true" className="project-card__meta-icon" />
                <span className="project-card__meta-sr">Shared</span>
              </>
            ) : (
              <>
                {" · "}
                <Cloud size={12} strokeWidth={2} aria-hidden="true" className="project-card__meta-icon" />
                <span className="project-card__meta-sr">Cloud</span>
              </>
            )
          ) : null}
        </span>
      </div>
    </li>
  )
}
