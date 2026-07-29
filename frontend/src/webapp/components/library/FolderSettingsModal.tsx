import { useEffect, useState } from "react"
import { Folder } from "lucide-react"
import Modal from "../ui/Modal"
import { extractEmojiTokens, normalizeProjectColor } from "../../../core/utils/libraryUtils"
import type { ProjectFolder } from "../../pages/Library"
import "./FolderSettingsModal.css"

const DEFAULT_FOLDER_COLOR = "#9ab8ff"

type FolderSettingsModalProps = {
  folder: ProjectFolder | null
  isOpen: boolean
  onClose: () => void
  onChange: (patch: { color?: string | null; iconEmoji?: string | null }) => void
}

export default function FolderSettingsModal({ folder, isOpen, onClose, onChange }: FolderSettingsModalProps) {
  const initialColor = normalizeProjectColor(folder?.color ?? "") || DEFAULT_FOLDER_COLOR
  const initialEmoji = extractEmojiTokens(folder?.iconEmoji ?? "", 1)[0] ?? ""

  const [colorDraft, setColorDraft] = useState(initialColor)
  const [emojiDraft, setEmojiDraft] = useState(initialEmoji)

  useEffect(() => {
    setColorDraft(normalizeProjectColor(folder?.color ?? "") || DEFAULT_FOLDER_COLOR)
    setEmojiDraft(extractEmojiTokens(folder?.iconEmoji ?? "", 1)[0] ?? "")
  }, [folder?.id])

  const commitColor = (raw: string) => {
    setColorDraft(raw)
    const normalized = normalizeProjectColor(raw)
    if (normalized) onChange({ color: normalized })
  }

  const commitEmoji = (raw: string) => {
    const next = extractEmojiTokens(raw, 1)[0] ?? ""
    setEmojiDraft(next)
    onChange({ iconEmoji: next || null })
  }

  const previewColor = normalizeProjectColor(colorDraft) || DEFAULT_FOLDER_COLOR

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Folder settings"
      titleIcon={<Folder size={16} aria-hidden="true" style={{ color: previewColor }} />}
      panelClassName="folder-settings-modal__panel"
    >
      {folder ? (
        <div className="folder-settings-modal__body">
          <header className="folder-settings-modal__preview">
            <div className="folder-settings-modal__preview-icon" style={{ color: previewColor }}>
              {emojiDraft ? <span aria-hidden="true">{emojiDraft}</span> : <Folder size={20} aria-hidden="true" />}
            </div>
            <div className="folder-settings-modal__preview-name">{folder.name}</div>
          </header>

          <label className="folder-settings-modal__field">
            <span className="folder-settings-modal__label">Color</span>
            <span className="folder-settings-modal__color-row">
              <input
                className="folder-settings-modal__color-swatch"
                type="color"
                value={previewColor}
                onChange={(event) => commitColor(event.target.value)}
                aria-label="Folder color"
              />
              <input
                className="folder-settings-modal__color-hex"
                value={colorDraft}
                onChange={(event) => setColorDraft(event.target.value)}
                onBlur={(event) => {
                  const normalized = normalizeProjectColor(event.target.value)
                  if (normalized) {
                    setColorDraft(normalized)
                    onChange({ color: normalized })
                  } else {
                    setColorDraft(previewColor)
                  }
                }}
                spellCheck={false}
                aria-label="Folder color hex"
                maxLength={7}
              />
              <button
                type="button"
                className="folder-settings-modal__reset"
                onClick={() => {
                  setColorDraft(DEFAULT_FOLDER_COLOR)
                  onChange({ color: null })
                }}
              >
                Reset
              </button>
            </span>
          </label>

          <label className="folder-settings-modal__field">
            <span className="folder-settings-modal__label">Icon emoji</span>
            <span className="folder-settings-modal__emoji-row">
              <input
                className="folder-settings-modal__emoji-input"
                value={emojiDraft}
                onChange={(event) => commitEmoji(event.target.value)}
                placeholder="🌳"
                aria-label="Folder icon emoji"
                maxLength={8}
              />
              <span className="folder-settings-modal__emoji-hint">
                One emoji replaces the default folder icon; leave blank to use the default.
              </span>
            </span>
          </label>
        </div>
      ) : null}
    </Modal>
  )
}
