import { useEffect, useState } from "react"
import { BookText, Download, NotebookText } from "lucide-react"
import type { ProjectKind } from "../../core/projects"
import "./ProjectPreferencesFields.css"

type ProjectPreferencesFieldsProps = {
  fieldClassName: string
  projectName: string
  projectKind: ProjectKind
  projectColor: string
  projectWallpaperEmojis: string
  onProjectNameChange: (name: string) => void
  onProjectKindChange: (kind: ProjectKind) => void
  onProjectColorChange: (color: string) => void
  onProjectWallpaperEmojisChange: (wallpaperEmojis: string) => void
  onExportAsPdf: () => void
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

export default function ProjectPreferencesFields({
  fieldClassName,
  projectName,
  projectKind,
  projectColor,
  projectWallpaperEmojis,
  onProjectNameChange,
  onProjectKindChange,
  onProjectColorChange,
  onProjectWallpaperEmojisChange,
  onExportAsPdf,
}: ProjectPreferencesFieldsProps) {
  const [projectColorHexDraft, setProjectColorHexDraft] = useState(projectColor.toUpperCase())

  useEffect(() => {
    setProjectColorHexDraft(projectColor.toUpperCase())
  }, [projectColor])

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
        <span className="project-preferences-fields__label">Type</span>
        <div className="project-preferences-kind-toggle" role="radiogroup" aria-label="Project type">
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

      <label className={`${fieldClassName} project-preferences-fields__field`.trim()}>
        <span className="project-preferences-fields__label">Color</span>
        <div className="project-preferences-fields__color-input-wrap">
          <input
            className="project-preferences-fields__input project-preferences-fields__input--color"
            type="color"
            value={projectColor}
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
                setProjectColorHexDraft(projectColor.toUpperCase())
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
          onClick={onExportAsPdf}
        >
          <Download size={17} strokeWidth={2} aria-hidden="true" />
          <span>Export as PDF</span>
        </button>
      </div>
    </div>
  )
}
