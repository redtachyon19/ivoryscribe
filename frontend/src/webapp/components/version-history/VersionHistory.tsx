// Version history modal — in-app React view that replaces the standalone
// blob-HTML popup the orchestration used to open. Living inside the React
// tree means the app's CSS variables (palette, fonts) flow in automatically
// and every theme change picks up the next render without us rebuilding a
// detached HTML page.
//
// Selection model:
//   • Click a row → select only that row.
//   • Cmd/Ctrl + click → toggle that row in the selection.
//   • Shift + click → range select from the most recent anchor.
//   • Drag in empty space → marquee select (powered by usePanelMarquee,
//     same hook the library and tab panels use, so the visual selection
//     box matches everywhere).
//
// Toolbar actions act on the current selection. They're disabled when no
// row is selected and (where appropriate) when the action wouldn't make
// sense on more than one row (e.g. Open in New Window, Make a Copy,
// Restore — those operate on a single version).
//
// Snapshot saving is *not* affected by this view — it just reads the
// embedded `project.versions` array and surfaces buttons that route into
// the same restore / duplicate / export / delete callbacks that
// useProjectVersioning + useAppOrchestration already own. This view is
// pure presentation + selection state.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react"
// useMarqueeSelection (the shared hook this view sits on top of) early-
// bails on mousedown if the target sits inside `li, article, button, …`.
// That filter exists so panels with reorder-drag handles don't accidentally
// double-fire on drag-to-reorder; for this view we want the opposite —
// dragging anywhere should start a marquee. We side-step the filter by
// rendering rows as `<div role="option">` instead of `<li>`. Same a11y
// semantics, but the hook sees a div and lets mousedown through.
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
  /** Fallback for the modal title when there's no project context. The
   *  per-row title still pulls the project name out of each snapshot, so
   *  this only shows up at the modal header. */
  projectName: string
  /** Newest-first list of versions for the current project. The component
   *  re-sorts defensively — callers don't have to. */
  versions: ProjectVersion[]
  /** Restore the given version into the active project. */
  onRestore: (versionId: string) => void
  /** Duplicate the given version into a fresh project in the library. */
  onDuplicate: (versionId: string) => void
  /** Export the given version's snapshot as a PDF. */
  onExportPdf: (versionId: string) => void
  /** Open a per-version preview as a new browser window/tab. */
  onOpenInNewWindow: (versionId: string) => void
  /** Permanently delete the listed versions. Bulk-aware. */
  onDelete: (versionIds: string[]) => void
}

type RowMeta = {
  version: ProjectVersion
  /** Project name as captured in the snapshot. Falls back to current
   *  project name when the snapshot is unreadable. */
  titleAtSave: string
  /** Number of document tabs in the snapshot. */
  entryCount: number
  /** Unit word for `entryCount` — "chapter" for Books, "slide" for
   *  Presentations (tusks). */
  entryUnit: "chapter" | "slide"
  /** Word count captured at save time. */
  wordCount: number
  /** Estimated page count from the word count. Exact pagination would mean
   *  running the PDF layout engine per version — far too heavy for a list
   *  render — so we approximate with a manuscript-standard words-per-page. */
  pageCount: number
}

/** Words per page used to estimate a version's page count. 250 is the
 *  classic double-spaced manuscript page. */
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
  // Local selection state — a set of version ids. The marquee hook
  // computes its own transient set during drag; on mouseup it commits
  // into here via the panel hook's `marqueeSelectedIds`.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const lastClickedIdRef = useRef<string | null>(null)
  // When a marquee drag starts and ends on the same row, the browser
  // fires a trailing synthetic `click` on that row after mouseup. Without
  // intervention that click runs handleRowClick and collapses the marquee
  // selection back down to a single row — the exact opposite of what the
  // user just drew. This ref records "the last mouseup ended a real
  // drag", and the row click handler short-circuits when it's set.
  // Reset on every fresh mousedown so a previous drag that didn't end on
  // a row can't suppress a later, genuine click.
  const wasMarqueeDragRef = useRef(false)

  const {
    marqueeContainerRef,
    marqueeSelectedIds,
    setMarqueeSelectedIds,
    marquee,
    liveSelectedIds,
  } = usePanelMarquee()

  // Mirror marquee.isActive into a ref so the mouseup handler below can
  // read the value React rendered with *before* the hook's window-level
  // mouseup listener flips it back to false. This is stable across
  // renders so the wrapping callbacks don't have to be rebuilt.
  const marqueeIsActiveRef = useRef(false)
  marqueeIsActiveRef.current = marquee.isActive

  // Wrapped mousedown — clears the drag-suppression flag, then forwards
  // to the marquee hook. Without the reset, a previous drag's flag could
  // leak into the next click.
  const handleContainerMouseDown = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      wasMarqueeDragRef.current = false
      marquee.handleMouseDown(event)
    },
    [marquee.handleMouseDown],
  )

  // React's onMouseUp fires during the bubble phase *before* the hook's
  // window-level mouseup listener — at this point marquee.isActive (via
  // the ref) is still true if the user was dragging. We record that so
  // the synthetic click event the browser fires next gets ignored.
  const handleContainerMouseUp = useCallback(() => {
    if (marqueeIsActiveRef.current) {
      wasMarqueeDragRef.current = true
    }
  }, [])

  // Keep the displayed selection in sync with the marquee. After a drag
  // ends, `marqueeSelectedIds` holds whatever the rectangle covered; we
  // promote that into the canonical click-driven `selectedIds` so the
  // toolbar buttons can act on the same set. The conditional
  // (marquee.isActive) prevents writes during the drag itself — the
  // hook is already publishing `liveSelectedIds` for that case.
  useEffect(() => {
    if (marquee.isActive) return
    if (marqueeSelectedIds.size === 0) return
    setSelectedIds(new Set(marqueeSelectedIds))
    // Reset the marquee hook's own committed set so a subsequent click
    // (not a drag) doesn't pick this up again.
    setMarqueeSelectedIds(new Set())
  }, [marquee.isActive, marqueeSelectedIds, setMarqueeSelectedIds])

  // Reset selection whenever the modal closes — opening it again should
  // start with nothing selected rather than whatever was selected last
  // time (versions may have been deleted in between).
  useEffect(() => {
    if (!isOpen) {
      setSelectedIds(new Set())
      lastClickedIdRef.current = null
    }
  }, [isOpen])

  const rowMetas = useMemo(() => buildRowMetas(versions, projectName), [versions, projectName])

  /** Display selection = canonical clicks ∪ live marquee preview.
   *  During a drag, `marquee.isActive` is true and `liveSelectedIds`
   *  holds the rectangle's contents. Outside drags it's just
   *  `selectedIds`. */
  const displayedSelection = useMemo(() => {
    if (!marquee.isActive) return selectedIds
    // Union the two so the user sees both their pre-drag picks AND
    // whatever the marquee is currently covering.
    const merged = new Set(selectedIds)
    for (const id of liveSelectedIds) merged.add(id)
    return merged
  }, [marquee.isActive, selectedIds, liveSelectedIds])

  const handleRowClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>, versionId: string) => {
      // Stop propagation so the click doesn't get treated as a marquee
      // mousedown on the container.
      event.stopPropagation()

      // If a marquee drag just ended on this row, the browser fires a
      // click event we never asked for. Swallow it — the marquee already
      // committed the right selection and the genuine click on this row
      // would replace it with a single-row selection.
      if (wasMarqueeDragRef.current) {
        wasMarqueeDragRef.current = false
        return
      }

      const isModifier = event.metaKey || event.ctrlKey
      const isRange = event.shiftKey

      setSelectedIds((current) => {
        if (isModifier) {
          // Toggle just this row.
          const next = new Set(current)
          if (next.has(versionId)) next.delete(versionId)
          else next.add(versionId)
          lastClickedIdRef.current = versionId
          return next
        }
        if (isRange && lastClickedIdRef.current) {
          // Range select between anchor and this row, additive.
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
        // Plain click — single-row selection.
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

  // Toolbar handlers — each pulls fresh ids from `displayedSelection` at
  // click time. Bulk actions iterate; single-target actions early-return
  // when the selection size doesn't match (defensive — the buttons
  // themselves are disabled in that case).
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
