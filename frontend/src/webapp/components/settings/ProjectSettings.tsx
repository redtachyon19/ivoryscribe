import { useEffect, useRef, useState } from "react"
import { Download, History, UserRoundPlus } from "lucide-react"
import type { ProjectKind } from "../../../core/utils/projects"
import { extractEmojiTokens } from "../../../core/utils/libraryUtils"
import { SharePanel } from "./ShareDialog"
import Button from "../ui/Button"
import { ColorPickerButton } from "../editor/components/ColorPickerButton"
import "./ProjectSettings.css"

type ProjectVersionListItem = {
  id: string
  label: string
  saveKind: "manual" | "autosave"
  createdAt: string
  wordCount: number
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
  onExportProject: (format: "pdf" | "docx" | "md" | "txt") => void
  sessionToken?: string
  documentId?: string
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

  const emojiRefs = useRef<Array<HTMLInputElement | null>>([null, null, null])

  const emojiTokens = extractEmojiTokens(projectWallpaperEmojis, 3)
  const emojiSlots: [string, string, string] = [
    emojiTokens[0] ?? "",
    emojiTokens[1] ?? "",
    emojiTokens[2] ?? "",
  ]

  function handleEmojiSlotChange(index: 0 | 1 | 2, raw: string) {
    const token = extractEmojiTokens(raw, 1)[0] ?? ""
    const next: [string, string, string] = [...emojiSlots]
    next[index] = token
    onProjectWallpaperEmojisChange(next.filter(Boolean).join(" "))
    if (token && index < 2) {
      emojiRefs.current[index + 1]?.focus()
    }
  }

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

      <div className={`${fieldClassName} project-preferences-fields__field`.trim()}>
        <span className="project-preferences-fields__label">Project Card Wallpaper</span>
        <div className="project-preferences-fields__wallpaper-row">
          <ColorPickerButton
            ariaLabel="Project card wallpaper color"
            value={resolvedProjectColor}
            onChange={(hex) => {
              const nextValue = hex.toUpperCase()
              onProjectColorChange(nextValue)
              setProjectColorHexDraft(nextValue)
            }}
          />
          <input
            className="project-preferences-fields__color-value-input project-preferences-fields__color-value-input--compact"
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
            placeholder="#HEXCLR"
            aria-label="Project color hex"
          />
          {([0, 1, 2] as const).map((i) => (
            <input
              key={i}
              ref={(el) => { emojiRefs.current[i] = el }}
              className="project-preferences-fields__input project-preferences-fields__input--emoji project-preferences-fields__emoji-slot"
              type="text"
              inputMode="text"
              autoComplete="off"
              spellCheck={false}
              value={emojiSlots[i]}
              onChange={(event) => handleEmojiSlotChange(i, event.target.value)}
              onFocus={(event) => event.target.select()}
              onKeyDown={(event) => {
                if (event.key === "Backspace" || event.key === "Delete") {
                  event.preventDefault()
                  if (emojiSlots[i]) {
                    handleEmojiSlotChange(i, "")
                  } else if (i > 0) {
                    emojiRefs.current[i - 1]?.focus()
                  }
                }
              }}
              placeholder="😀"
              aria-label={`Emoji ${i + 1}`}
            />
          ))}
        </div>
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

      <div className={`${fieldClassName} project-preferences-fields__field project-preferences-fields__field--toggle`.trim()}>
        <span className="project-preferences-fields__label project-preferences-fields__export-label">
          <Download size={17} strokeWidth={2} aria-hidden="true" />
          <span>Export as</span>
        </span>
        <div className="project-preferences-fields__export-formats">
          {(["pdf", "docx", "md", "txt"] as const).map((fmt) => (
            <button
              key={fmt}
              type="button"
              className="project-preferences-fields__export-format-btn"
              onClick={() => onExportProject(fmt)}
            >
              .{fmt}
            </button>
          ))}
        </div>
      </div>

      {showVersionHistory ? (
        <div className={`${fieldClassName} project-preferences-fields__field project-preferences-fields__history`.trim()}>
          <div className="project-preferences-fields__history-header">
            <span className="project-preferences-fields__label project-preferences-fields__history-title">
              <History size={17} strokeWidth={2} aria-hidden="true" />
              <span>Version History</span>
            </span>
            <Button
              variant="default"
              className="project-preferences-fields__history-open-btn"
              onClick={() => {
                onShowVersionHistory?.()
              }}
            >
              {projectVersions.length === 1 ? "1 saved version" : `${projectVersions.length} saved versions`}
            </Button>
          </div>
        </div>
      ) : null}

    </div>
  )
}
