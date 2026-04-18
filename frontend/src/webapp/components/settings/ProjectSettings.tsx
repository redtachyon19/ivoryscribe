import { useEffect, useState } from "react"
import { Download, History, UserRoundPlus } from "lucide-react"
import type { ProjectKind } from "../../../core/projects"
import { SharePanel } from "./ShareDialog"
import Button from "../ui/Button"
import "./ProjectSettings.css"

type ProjectVersionListItem = {
  id: string
  label: string
  saveKind: "manual" | "autosave"
  createdAt: string
  changedCharacters: number
  preview?: {
    projectName: string
    projectKind: ProjectKind
    entryCount: number
    activeDocumentTitle: string
    activeDocumentPreview: string
  }
}

type ProjectPreferencesFieldsProps = {
  fieldClassName: string
  projectName: string
  projectColor: string
  projectWallpaperEmojis: string
  projectVersions?: ProjectVersionListItem[]
  showVersionHistory?: boolean
  onProjectNameChange: (name: string) => void
  onProjectColorChange: (color: string) => void
  onProjectWallpaperEmojisChange: (wallpaperEmojis: string) => void
  onShowVersionHistory?: () => void
  onExportProject: () => void
  sessionToken?: string
  documentId?: string
}

function splitGraphemes(value: string) {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" })
    return Array.from(segmenter.segment(value), (segment) => segment.segment)
  }

  return Array.from(value)
}

function extractEmojiTokens(value: string, maxCount = 3) {
  const emojiPattern = /\p{Extended_Pictographic}/u
  const tokens: string[] = []

  for (const grapheme of splitGraphemes(value)) {
    if (!emojiPattern.test(grapheme)) {
      continue
    }

    tokens.push(grapheme)
    if (tokens.length >= maxCount) {
      break
    }
  }

  return tokens
}

function normalizeProjectEmojiWallpaper(value: string) {
  return extractEmojiTokens(value, 3).join(" ")
}

function normalizeHexInput(value: string) {
  const trimmed = value.trim()
  if (!trimmed) {
    return ""
  }

  const prefixed = trimmed.startsWith("#") ? trimmed : `#${trimmed}`
  const cleaned = prefixed.slice(1).replace(/[^0-9a-fA-F]/g, "").slice(0, 6)
  return `#${cleaned}`.toUpperCase()
}

function isCompleteHexColor(value: string) {
  return /^#[0-9A-F]{6}$/.test(value)
}

function normalizeProjectColor(value: string | null | undefined) {
  const normalized = normalizeHexInput(value ?? "")
  if (!isCompleteHexColor(normalized)) {
    return "#7EA8FF"
  }

  return normalized
}

export default function ProjectSettings({
  fieldClassName,
  projectName,
  projectColor,
  projectWallpaperEmojis,
  projectVersions = [],
  showVersionHistory = true,
  onProjectNameChange,
  onProjectColorChange,
  onProjectWallpaperEmojisChange,
  onShowVersionHistory,
  onExportProject,
  sessionToken,
  documentId,
}: ProjectPreferencesFieldsProps) {
  const resolvedProjectColor = normalizeProjectColor(projectColor)
  const [projectColorHexDraft, setProjectColorHexDraft] = useState(resolvedProjectColor)

  const canShare = Boolean(sessionToken && documentId)

  useEffect(() => {
    setProjectColorHexDraft(resolvedProjectColor)
  }, [resolvedProjectColor])

  return (
    <div className="project-preferences-fields">
      <label className={`${fieldClassName} project-preferences-fields__field`.trim()}>
        <span className="project-preferences-fields__label">Name</span>
        <input
          className="project-preferences-fields__input"
          type="text"
          value={projectName}
          onChange={(event) => {
            onProjectNameChange(event.target.value)
          }}
        />
      </label>

      <label className={`${fieldClassName} project-preferences-fields__field`.trim()}>
        <span className="project-preferences-fields__label">Color</span>
        <div className="project-preferences-fields__color-input-wrap">
          <input
            className="project-preferences-fields__input project-preferences-fields__input--color"
            type="color"
            value={resolvedProjectColor}
            onChange={(event) => {
              const nextValue = event.target.value.toUpperCase()
              onProjectColorChange(nextValue)
              setProjectColorHexDraft(nextValue)
            }}
          />
          <input
            className="project-preferences-fields__color-value-input"
            type="text"
            inputMode="text"
            autoComplete="off"
            spellCheck={false}
            value={projectColorHexDraft}
            onChange={(event) => {
              const nextDraft = normalizeHexInput(event.target.value)
              setProjectColorHexDraft(nextDraft)
              if (isCompleteHexColor(nextDraft)) {
                onProjectColorChange(nextDraft)
              }
            }}
            onBlur={() => {
              if (!isCompleteHexColor(projectColorHexDraft)) {
                setProjectColorHexDraft(resolvedProjectColor)
              }
            }}
            placeholder="#000000"
            aria-label="Project color hex"
          />
        </div>
      </label>

      <label className={`${fieldClassName} project-preferences-fields__field`.trim()}>
        <span className="project-preferences-fields__label">Card Emoji Wallpaper (up to 3)</span>
        <input
          className="project-preferences-fields__input project-preferences-fields__input--emoji"
          type="text"
          inputMode="text"
          autoComplete="off"
          spellCheck={false}
          value={projectWallpaperEmojis}
          onChange={(event) => {
            onProjectWallpaperEmojisChange(normalizeProjectEmojiWallpaper(event.target.value))
          }}
          placeholder="e.g. 📚 🐘 ✍️"
          aria-label="Card emoji wallpaper"
        />
      </label>

      <div className={`${fieldClassName} project-preferences-fields__field`.trim()}>
        <span className="project-preferences-fields__label">Export</span>
        <button
          type="button"
          className="project-preferences-fields__export-btn"
          onClick={onExportProject}
        >
          <Download size={17} strokeWidth={2} aria-hidden="true" />
          <span>Export as PDF</span>
        </button>
      </div>

      {canShare ? (
        <div className={`${fieldClassName} project-preferences-fields__field project-preferences-fields__sharing`.trim()}>
          <span className="project-preferences-fields__label">
            <UserRoundPlus size={17} strokeWidth={2} aria-hidden="true" />
            <span>Sharing</span>
          </span>
          <SharePanel sessionToken={sessionToken!} documentId={documentId!} />
        </div>
      ) : null}

      {showVersionHistory ? (
        <div className={`${fieldClassName} project-preferences-fields__field project-preferences-fields__history`.trim()}>
          <div className="project-preferences-fields__history-header">
            <span className="project-preferences-fields__label project-preferences-fields__history-title">
              <History size={17} strokeWidth={2} aria-hidden="true" />
              <span>Version History</span>
            </span>
            <span className="project-preferences-fields__history-count">
              {projectVersions.length === 1 ? "1 saved version" : `${projectVersions.length} saved versions`}
            </span>
          </div>

          <Button
            variant="footer"
            className="project-preferences-fields__history-open-btn"
            onClick={() => {
              onShowVersionHistory?.()
            }}
          >
            <History size={14} strokeWidth={2} aria-hidden="true" />
            <span>Show Version History</span>
          </Button>
        </div>
      ) : null}

    </div>
  )
}
