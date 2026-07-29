import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react"
import { Copy, Download, ExternalLink, History, RotateCcw, Trash2 } from "lucide-react"
import Button from "../ui/Button"
import Modal from "../ui/Modal"
import usePanelMarquee from "../navigation/usePanelMarquee"
import { formatVersionTimestamp, parseVersionSnapshot } from "../../../core/state/versioning"
import { collectTabIds, type ProjectVersion } from "../../../core/utils/projects"
import "./VersionHistory.css"

export type VersionHistoryProps = {
  isOpen: boolean
  onClose: () => void
  projectName: string
  versions: ProjectVersion[]
  onRestore: (versionId: string) => void
  onDuplicate: (versionId: string) => void
  onExportPdf: (versionId: string) => void
  onOpenInNewWindow: (versionId: string) => void
  onDelete: (versionIds: string[]) => void
}

type RowMeta = {
  version: ProjectVersion
  titleAtSave: string
  entryCount: number
  entryUnit: "chapter" | "slide"
  wordCount: number
  pageCount: number
}

const WORDS_PER_PAGE = 250

function buildRowMetas(versions: ProjectVersion[], fallbackName: string): RowMeta[] {
  return versions.map((version) => {
    const snapshot = parseVersionSnapshot(version.snapshot)
    const titleAtSave = snapshot?.name?.trim() || fallbackName
    const entryCount = snapshot ? collectTabIds(snapshot.tabs).length : 0
    const entryUnit = snapshot?.kind === "Presentation" ? "slide" : "chapter"
    const wordCount = version.wordCount
    const pageCount = wordCount > 0 ? Math.max(1, Math.ceil(wordCount / WORDS_PER_PAGE)) : 0
    return { version, titleAtSave, entryCount, entryUnit, wordCount, pageCount }
  })
}

function kindLabel(version: ProjectVersion): string {
  return version.kind === "manual"
    ? `Manual ${version.label}`
    : `Auto Save ${version.label}`
}

export default function VersionHistory({
  isOpen,
  onClose,
  projectName,
  versions,
  onRestore,
  onDuplicate,
  onExportPdf,
  onOpenInNewWindow,
  onDelete,
}: VersionHistoryProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const lastClickedIdRef = useRef<string | null>(null)
  const wasMarqueeDragRef = useRef(false)

  const {
    marqueeContainerRef,
    marqueeSelectedIds,
    setMarqueeSelectedIds,
    marquee,
    liveSelectedIds,
  } = usePanelMarquee()

  const marqueeIsActiveRef = useRef(false)
  marqueeIsActiveRef.current = marquee.isActive

  const handleContainerMouseDown = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      wasMarqueeDragRef.current = false
      marquee.handleMouseDown(event)
    },
    [marquee.handleMouseDown],
  )

  const handleContainerMouseUp = useCallback(() => {
    if (marqueeIsActiveRef.current) {
      wasMarqueeDragRef.current = true
    }
  }, [])

  useEffect(() => {
    if (marquee.isActive) return
    if (marqueeSelectedIds.size === 0) return
    setSelectedIds(new Set(marqueeSelectedIds))
    setMarqueeSelectedIds(new Set())
  }, [marquee.isActive, marqueeSelectedIds, setMarqueeSelectedIds])

  useEffect(() => {
    if (!isOpen) {
      setSelectedIds(new Set())
      lastClickedIdRef.current = null
    }
  }, [isOpen])

  const rowMetas = useMemo(() => buildRowMetas(versions, projectName), [versions, projectName])

  const displayedSelection = useMemo(() => {
    if (!marquee.isActive) return selectedIds
    const merged = new Set(selectedIds)
    for (const id of liveSelectedIds) merged.add(id)
    return merged
  }, [marquee.isActive, selectedIds, liveSelectedIds])

  const handleRowClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>, versionId: string) => {
      event.stopPropagation()

      if (wasMarqueeDragRef.current) {
        wasMarqueeDragRef.current = false
        return
      }

      const isModifier = event.metaKey || event.ctrlKey
      const isRange = event.shiftKey

      setSelectedIds((current) => {
        if (isModifier) {
          const next = new Set(current)
          if (next.has(versionId)) next.delete(versionId)
          else next.add(versionId)
          lastClickedIdRef.current = versionId
          return next
        }
        if (isRange && lastClickedIdRef.current) {
          const ids = versions.map((v) => v.id)
          const anchorIndex = ids.indexOf(lastClickedIdRef.current)
          const targetIndex = ids.indexOf(versionId)
          if (anchorIndex === -1 || targetIndex === -1) {
            return new Set([versionId])
          }
          const [start, end] = anchorIndex <= targetIndex
            ? [anchorIndex, targetIndex]
            : [targetIndex, anchorIndex]
          return new Set(ids.slice(start, end + 1))
        }
        lastClickedIdRef.current = versionId
        return new Set([versionId])
      })
    },
    [versions],
  )

  const selectionCount = displayedSelection.size
  const singleSelectionId = selectionCount === 1
    ? [...displayedSelection][0]
    : null
  const hasSelection = selectionCount > 0
  const hasSingle = singleSelectionId !== null

  const runOnSingle = useCallback(
    (handler: (versionId: string) => void) => () => {
      if (!singleSelectionId) return
      handler(singleSelectionId)
    },
    [singleSelectionId],
  )

  const handleDeleteClick = useCallback(() => {
    if (selectionCount === 0) return
    const ids = [...displayedSelection]
    const noun = ids.length === 1 ? "version" : "versions"
    const proceed = typeof window === "undefined"
      ? true
      : window.confirm(`Permanently delete ${ids.length} ${noun}? This cannot be undone.`)
    if (!proceed) return
    onDelete(ids)
    setSelectedIds(new Set())
    lastClickedIdRef.current = null
  }, [displayedSelection, selectionCount, onDelete])

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`${projectName} — Version History`}
      titleIcon={<History size={20} strokeWidth={1.5} aria-hidden="true" />}
      frameClassName="version-history__frame"
      panelClassName="version-history__panel"
    >
      <div
        ref={marqueeContainerRef}
        className={`version-history${marquee.isActive ? " version-history--marqueeing" : ""}`}
        onMouseDown={handleContainerMouseDown}
        onMouseUp={handleContainerMouseUp}
      >
        <div className="version-history__toolbar" role="toolbar" aria-label="Version actions">
          <Button
            type="button"
            onClick={runOnSingle(onRestore)}
            disabled={!hasSingle}
            aria-label="Restore selected version"
          >
            <RotateCcw size={15} strokeWidth={1.8} aria-hidden="true" />
            <span>Restore</span>
          </Button>
          <Button
            type="button"
            onClick={runOnSingle(onDuplicate)}
            disabled={!hasSingle}
            aria-label="Add a copy to the library"
          >
            <Copy size={15} strokeWidth={1.8} aria-hidden="true" />
            <span>Add Copy to Library</span>
          </Button>
          <Button
            type="button"
            onClick={runOnSingle(onExportPdf)}
            disabled={!hasSingle}
            aria-label="Export selected version as PDF"
          >
            <Download size={15} strokeWidth={1.8} aria-hidden="true" />
            <span>Export</span>
          </Button>
          <Button
            type="button"
            onClick={runOnSingle(onOpenInNewWindow)}
            disabled={!hasSingle}
            aria-label="Open selected version in a new window"
          >
            <ExternalLink size={15} strokeWidth={1.8} aria-hidden="true" />
            <span>Open in New Window</span>
          </Button>
          <Button
            type="button"
            variant="footer-danger"
            onClick={handleDeleteClick}
            disabled={!hasSelection}
            aria-label="Delete selected versions"
          >
            <Trash2 size={15} strokeWidth={1.8} aria-hidden="true" />
            <span>Delete</span>
          </Button>
        </div>

        <p className="version-history__subtitle">
          {versions.length === 0
            ? "Manual saves get roman numerals (I, II, III…); auto-saves are arabic (1, 2, 3…). Use File → Save Version to record a milestone — every ~500 words written triggers an auto-save snapshot."
            : selectionCount === 0
              ? `${versions.length === 1 ? "1 saved version" : `${versions.length} saved versions`}. Click a row to select it, drag to select several.`
              : `${selectionCount} of ${versions.length} selected`}
        </p>

        <div className="version-history__list">
          {versions.length === 0 ? null : (
            <div className="version-history__rows" role="listbox" aria-label="Saved versions" aria-multiselectable="true">
              {rowMetas.map(({ version, titleAtSave, entryCount, entryUnit, pageCount, wordCount }) => {
                const isSelected = displayedSelection.has(version.id)
                return (
                  <div
                    key={version.id}
                    data-selectable-id={version.id}
                    className={`version-history__row${isSelected ? " version-history__row--selected" : ""}`}
                    onClick={(event) => handleRowClick(event, version.id)}
                    onDoubleClick={() => onOpenInNewWindow(version.id)}
                    aria-selected={isSelected}
                    role="option"
                    tabIndex={0}
                  >
                    <div className="version-history__row-main">
                      <div className="version-history__row-title-line">
                        <strong className="version-history__row-title">{titleAtSave}</strong>
                        <span className={`version-history__row-pill version-history__row-pill--${version.kind}`}>
                          {kindLabel(version)}
                        </span>
                      </div>
                      <span className="version-history__row-time">
                        {formatVersionTimestamp(version.savedAt)}
                      </span>
                    </div>
                    <div className="version-history__row-stats">
                      <span className="version-history__row-stat">
                        {entryCount === 1 ? `1 ${entryUnit}` : `${entryCount} ${entryUnit}s`}
                      </span>
                      <span className="version-history__row-stat">
                        {pageCount === 1 ? "1 page" : `${pageCount} pages`}
                      </span>
                      <span className="version-history__row-stat">
                        {wordCount === 1 ? "1 word" : `${wordCount.toLocaleString()} words`}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {marquee.isActive && marquee.rect ? (
          <div
            className="version-history__marquee-selection"
            style={{
              left: marquee.rect.x,
              top: marquee.rect.y,
              width: marquee.rect.width,
              height: marquee.rect.height,
            }}
          />
        ) : null}
      </div>
    </Modal>
  )
}
