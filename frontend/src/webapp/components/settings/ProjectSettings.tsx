import { useEffect, useState } from "react"
import { BookText, Check, Download, FileLock2, History, NotebookText } from "lucide-react"
import type { ProjectKind } from "../../../core/projects"
import Button from "../ui/Button"
import Modal from "../ui/Modal"
import "./ProjectSettings.css"

type ProjectVersionListItem = {
  id: string
  label: string
  saveKind: "manual" | "autosave"
  createdAt: string
  changedCharacters: number
  markdownEditorEnabled?: boolean
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
  projectKind: ProjectKind
  markdownEditorEnabled: boolean
  projectColor: string
  projectWallpaperEmojis: string
  projectVersions?: ProjectVersionListItem[]
  showVersionHistory?: boolean
  onProjectNameChange: (name: string) => void
  onProjectKindChange: (kind: ProjectKind) => void
  onMarkdownEditorEnabledChange: (enabled: boolean) => void
  onProjectColorChange: (color: string) => void
  onProjectWallpaperEmojisChange: (wallpaperEmojis: string) => void
  onShowVersionHistory?: () => void
  onExportProject: () => void
  onMarkdownPromptVisibilityChange?: (visible: boolean) => void
  onMarkdownPromptDismissed?: () => void
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
  projectKind,
  markdownEditorEnabled,
  projectColor,
  projectWallpaperEmojis,
  projectVersions = [],
  showVersionHistory = true,
  onProjectNameChange,
  onProjectKindChange,
  onMarkdownEditorEnabledChange,
  onProjectColorChange,
  onProjectWallpaperEmojisChange,
  onShowVersionHistory,
  onExportProject,
  onMarkdownPromptVisibilityChange,
  onMarkdownPromptDismissed,
}: ProjectPreferencesFieldsProps) {
  type MarkdownPromptKind = "enable-confirm" | "disable-blocked"
  const resolvedProjectColor = normalizeProjectColor(projectColor)
  const [projectColorHexDraft, setProjectColorHexDraft] = useState(resolvedProjectColor)
  const [markdownPrompt, setMarkdownPrompt] = useState<MarkdownPromptKind | null>(null)

  const activeMarkdownPrompt = markdownPrompt

  const openMarkdownPrompt = (kind: MarkdownPromptKind) => {
    setMarkdownPrompt(kind)
  }

  const closeMarkdownPrompt = () => {
    setMarkdownPrompt(null)
    onMarkdownPromptDismissed?.()
  }

  useEffect(() => {
    setProjectColorHexDraft(resolvedProjectColor)
  }, [resolvedProjectColor])

  useEffect(() => {
    onMarkdownPromptVisibilityChange?.(Boolean(markdownPrompt))
  }, [markdownPrompt, onMarkdownPromptVisibilityChange])

  return (
    <div className={`project-preferences-fields ${markdownPrompt ? "project-preferences-fields--prompt-open" : ""}`.trim()}>
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
        <span className="project-preferences-fields__label">Type</span>
        <div
          className={`project-preferences-kind-toggle ${projectKind === "Blog" ? "project-preferences-kind-toggle--blog" : "project-preferences-kind-toggle--book"}`.trim()}
          role="radiogroup"
          aria-label="Project type"
        >
          <span className="project-preferences-kind-toggle__pill" aria-hidden="true" />
          <button
            type="button"
            className={`project-preferences-kind-toggle__option ${projectKind === "Book" ? "project-preferences-kind-toggle__option--active" : ""}`.trim()}
            onClick={() => {
              onProjectKindChange("Book")
            }}
            role="radio"
            aria-checked={projectKind === "Book"}
          >
            <BookText size={19} strokeWidth={1.9} aria-hidden="true" />
            <span>Book</span>
          </button>
          <button
            type="button"
            className={`project-preferences-kind-toggle__option ${projectKind === "Blog" ? "project-preferences-kind-toggle__option--active" : ""}`.trim()}
            onClick={() => {
              onProjectKindChange("Blog")
            }}
            role="radio"
            aria-checked={projectKind === "Blog"}
          >
            <NotebookText size={19} strokeWidth={1.9} aria-hidden="true" />
            <span>Blog</span>
          </button>
        </div>
      </label>

      <label
        className={`${fieldClassName} project-preferences-fields__field project-preferences-fields__field--toggle project-preferences-fields__markdown-row`.trim()}
        htmlFor="project-preferences-markdown-toggle"
      >
        <span className="project-preferences-fields__label project-preferences-fields__markdown-label">Markdown Editor</span>
        <span className="project-preferences-fields__toggle-wrap project-preferences-fields__markdown-toggle-wrap">
          <input
            id="project-preferences-markdown-toggle"
            className="project-preferences-fields__toggle-input"
            type="checkbox"
            checked={markdownEditorEnabled}
            onChange={(event) => {
              const shouldEnable = event.target.checked

              if (markdownEditorEnabled && !shouldEnable) {
                openMarkdownPrompt("disable-blocked")
                return
              }

              if (!markdownEditorEnabled && shouldEnable) {
                openMarkdownPrompt("enable-confirm")
                return
              }

              onMarkdownEditorEnabledChange(shouldEnable)
            }}
          />
          <span className="project-preferences-fields__toggle-track" aria-hidden="true" />
        </span>
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
          <span>{markdownEditorEnabled ? "Download as .md" : "Export as PDF"}</span>
        </button>
      </div>

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

      <Modal
        isOpen={Boolean(activeMarkdownPrompt)}
        onClose={closeMarkdownPrompt}
        title={activeMarkdownPrompt === "enable-confirm" ? "Enable Markdown Editor" : "Markdown Editor Locked"}
        titleIcon={<FileLock2 size={19} strokeWidth={1.9} aria-hidden="true" />}
        closeLabel="Close Prompt"
        footer={
          activeMarkdownPrompt === "enable-confirm" ? (
            <>
              <Button variant="footer" onClick={closeMarkdownPrompt}>
                Cancel
              </Button>
              <Button
                variant="footer-danger"
                onClick={() => {
                  onMarkdownEditorEnabledChange(true)
                  closeMarkdownPrompt()
                }}
              >
                <FileLock2 size={14} strokeWidth={2} aria-hidden="true" />
                <span>Enable</span>
              </Button>
            </>
          ) : (
            <Button variant="footer" onClick={closeMarkdownPrompt}>
              <Check size={14} strokeWidth={2} aria-hidden="true" />
              <span>Got it</span>
            </Button>
          )
        }
      >
        <p className={`project-preferences-fields__prompt-copy ${activeMarkdownPrompt === "disable-blocked" ? "project-preferences-fields__prompt-copy--warning" : ""}`.trim()}>
          {activeMarkdownPrompt === "enable-confirm"
            ? "Turn on Markdown Editor mode for this project? This cannot be undone."
            : "Markdown Editor mode is permanent for this project and cannot be turned off."}
        </p>
      </Modal>

    </div>
  )
}
