import { Download, FileText, FileType2, FileType, Files } from "lucide-react"
import { useEffect, useMemo, useState, type ComponentType } from "react"
import type { ExportProjectFormat } from "../../../core/editorEvents"
import type { ExportMode } from "./exportSelection"
import Button from "../ui/Button"
import Modal from "../ui/Modal"
import "./ProjectExportModal.css"

type ExportTabDescriptor = {
  id: string
  title: string
}

type ProjectExportModalProps = {
  isOpen: boolean
  format: ExportProjectFormat | null
  tabs: ExportTabDescriptor[]
  onClose: () => void
  onConfirm: (selection: { mode: ExportMode; selectedTabIds: string[] }) => void
}

const formatLabelById: Record<ExportProjectFormat, string> = {
  pdf: "PDF (.pdf)",
  docx: "Word (.docx)",
  md: "Markdown (.md)",
  txt: "Text (.txt)",
}

const formatIconById: Record<ExportProjectFormat, ComponentType<{ size?: number; strokeWidth?: number; "aria-hidden"?: boolean }>> = {
  pdf: FileType,
  docx: FileType2,
  md: FileText,
  txt: FileText,
}

const combinedLabelById: Record<ExportProjectFormat, string> = {
  pdf: "One combined PDF file",
  docx: "One combined DOCX file",
  md: "One combined Markdown file",
  txt: "One combined Text file",
}

export default function ProjectExportModal({
  isOpen,
  format,
  tabs,
  onClose,
  onConfirm,
}: ProjectExportModalProps) {
  const [mode, setMode] = useState<ExportMode>("single-document")
  const [selectedTabIds, setSelectedTabIds] = useState<string[]>([])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    setMode("single-document")
    setSelectedTabIds(tabs.map((tab) => tab.id))
  }, [isOpen, tabs])

  const selectedCount = selectedTabIds.length
  const totalCount = tabs.length

  const selectedIdSet = useMemo(() => new Set(selectedTabIds), [selectedTabIds])

  const formatLabel = format ? formatLabelById[format] : "Document"
  const FormatIcon = format ? formatIconById[format] : FileText

  const canExport = mode === "separate-files" || totalCount === 0 || selectedCount > 0

  const toggleTabSelection = (tabId: string) => {
    setSelectedTabIds((current) => {
      if (current.includes(tabId)) {
        return current.filter((id) => id !== tabId)
      }

      return [...current, tabId]
    })
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Export To ${formatLabel}`}
      titleIcon={<Download size={19} strokeWidth={1.9} aria-hidden={true} />}
      panelClassName="project-export-modal__panel"
      closeLabel="Close Export Modal"
      footer={(
        <>
          <Button variant="footer" onClick={onClose}>Cancel</Button>
          <Button
            variant="footer-primary"
            onClick={() => {
              onConfirm({
                mode,
                selectedTabIds,
              })
            }}
            disabled={!canExport}
          >
            <Download size={14} strokeWidth={2} aria-hidden={true} />
            Export
          </Button>
        </>
      )}
    >
      <p className="project-export-modal__copy">
        Choose how to export your documents.
      </p>

      <div className="project-export-modal__mode-grid" role="radiogroup" aria-label="Export mode">
        <button
          type="button"
          className={`project-export-modal__mode-card ${mode === "single-document" ? "project-export-modal__mode-card--active" : ""}`.trim()}
          onClick={() => {
            setMode("single-document")
          }}
          aria-pressed={mode === "single-document"}
        >
          <FormatIcon size={16} strokeWidth={2} aria-hidden={true} />
          <span>{format ? combinedLabelById[format] : "One combined file"}</span>
        </button>

        <button
          type="button"
          className={`project-export-modal__mode-card ${mode === "separate-files" ? "project-export-modal__mode-card--active" : ""}`.trim()}
          onClick={() => {
            setMode("separate-files")
          }}
          aria-pressed={mode === "separate-files"}
        >
          <Files size={16} strokeWidth={2} aria-hidden={true} />
          <span>Each tab as its own file (ZIP folder)</span>
        </button>
      </div>

      {mode === "single-document" ? (
        <section className="project-export-modal__selection" aria-label="Tab selection">
          <div className="project-export-modal__selection-head">
            <p>
              Include tabs: <strong>{selectedCount}</strong>/{totalCount}
            </p>
            <div className="project-export-modal__selection-actions">
              <button
                type="button"
                onClick={() => {
                  setSelectedTabIds(tabs.map((tab) => tab.id))
                }}
                disabled={tabs.length === 0 || selectedCount === totalCount}
              >
                Select all
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedTabIds([])
                }}
                disabled={tabs.length === 0 || selectedCount === 0}
              >
                Clear
              </button>
            </div>
          </div>

          <ul className="project-export-modal__selection-list">
            {tabs.map((tab) => {
              const isSelected = selectedIdSet.has(tab.id)

              return (
                <li key={tab.id} className="project-export-modal__selection-item">
                  <label>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {
                        toggleTabSelection(tab.id)
                      }}
                    />
                    <span>{tab.title}</span>
                  </label>
                </li>
              )
            })}

            {tabs.length === 0 ? (
              <li className="project-export-modal__selection-empty">No document tabs found.</li>
            ) : null}
          </ul>
        </section>
      ) : (
        <p className="project-export-modal__zip-note">
          A ZIP file will be downloaded with one {formatLabel} file per document tab.
        </p>
      )}
    </Modal>
  )
}
