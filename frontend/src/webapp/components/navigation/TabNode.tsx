import { useEffect, useRef, useState, type CSSProperties, type DragEvent } from "react"
import { ChevronDown, CornerDownRight } from "lucide-react"
import type { DocumentTab, Project } from "../../../core/utils/projects"
import { iconForTabKind } from "../../../core/utils/projectIcons"
import { getDropMode, type DropMode, type DropTarget } from "../shared/hooks/useListDrag"

export type TabNodeProps = {
  tab: DocumentTab
  /** The project this tab belongs to — used to resolve the per-tab
   *  file-type icon (markdown, plaintext, PDF, pinboard, chapter). */
  project: Project
  depth: number
  activeId: string | null
  draggingIds: Set<string>
  marqueeSelectedIds: Set<string>
  dropTarget: DropTarget
  editingId: string | null
  editingTitle: string
  pendingEditTabIds?: Set<string>
  onSelect: (id: string, modifiers?: { shiftKey?: boolean }) => void
  /** Double-click: arm this single tab as the action selection (accent). */
  onSelectForAction: (id: string) => void
  onOpenInNewTab?: (id: string) => void
  onDragStart: (event: DragEvent<HTMLButtonElement>, id: string) => void
  onDragEnd: () => void
  onDropTargetChange: (target: DropTarget) => void
  onDropCommit: (targetId: string, mode: DropMode) => void
  onStartRename: (id: string, currentTitle: string) => void
  onRequestDelete: (id: string) => void
  onContextMenu: (id: string, x: number, y: number) => void
  onEditingTitleChange: (value: string) => void
  onCommitRename: () => void
  onCancelRename: () => void
  onRowRef: (id: string, element: HTMLDivElement | null) => void
  expandedById: Record<string, boolean>
  onToggleExpand: (id: string) => void
}

export default function TabNode({
  tab,
  project,
  depth,
  activeId,
  draggingIds,
  marqueeSelectedIds,
  dropTarget,
  editingId,
  editingTitle,
  pendingEditTabIds,
  onSelect,
  onSelectForAction,
  onOpenInNewTab,
  onDragStart,
  onDragEnd,
  onDropTargetChange,
  onDropCommit,
  onStartRename,
  onRequestDelete,
  onContextMenu: onCtxMenu,
  onEditingTitleChange,
  onCommitRename,
  onCancelRename,
  onRowRef,
  expandedById,
  onToggleExpand,
}: TabNodeProps) {
  const marqueeViewportRef = useRef<HTMLSpanElement | null>(null)
  const marqueeTextRef = useRef<HTMLSpanElement | null>(null)
  const [marquee, setMarquee] = useState({ isOverflowing: false, loopDistance: 0 })
  const isActive = activeId === tab.id
  const isDragging = draggingIds.has(tab.id)
  const isMarqueeSelected = marqueeSelectedIds.has(tab.id)
  const isEditing = editingId === tab.id
  const isDropBefore = dropTarget?.targetId === tab.id && dropTarget.mode === "before"
  const isDropAfter = dropTarget?.targetId === tab.id && dropTarget.mode === "after"
  const isDropInside = dropTarget?.targetId === tab.id && dropTarget.mode === "inside"
  const hasChildren = tab.children.length > 0
  const isExpanded = expandedById[tab.id] !== false
  const hasPendingEdit = pendingEditTabIds?.has(tab.id) ?? false
  const TabIcon = iconForTabKind(tab.id, project)

  useEffect(() => {
    const viewport = marqueeViewportRef.current
    const text = marqueeTextRef.current

    if (!viewport || !text) {
      return
    }

    const measureMarquee = () => {
      const viewportWidth = viewport.clientWidth
      const textWidth = text.scrollWidth
      const nextIsOverflowing = textWidth > viewportWidth + 1
      const nextLoopDistance = nextIsOverflowing ? textWidth + 28 : 0

      setMarquee((current) => {
        if (current.isOverflowing === nextIsOverflowing && current.loopDistance === nextLoopDistance) {
          return current
        }

        return {
          isOverflowing: nextIsOverflowing,
          loopDistance: nextLoopDistance,
        }
      })
    }

    measureMarquee()

    const resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measureMarquee) : null
    resizeObserver?.observe(viewport)
    resizeObserver?.observe(text)
    window.addEventListener("resize", measureMarquee)

    return () => {
      resizeObserver?.disconnect()
      window.removeEventListener("resize", measureMarquee)
    }
  }, [tab.title, depth, isEditing])

  return (
    <li
      className={`doc-tabs__item ${isDropInside ? "doc-tabs__item--drop-inside" : ""}`.trim()}
    >
      <div
        className={`doc-tabs__drop-line doc-tabs__drop-line--top ${isDropBefore ? "doc-tabs__drop-line--visible" : ""}`.trim()}
        style={{ marginLeft: `${12 + depth * 18}px` }}
      />

      <div
        ref={(element) => {
          onRowRef(tab.id, element)
        }}
        data-selectable-id={tab.id}
        className={`doc-tabs__row ${isActive ? "doc-tabs__row--active" : ""} ${isMarqueeSelected ? "doc-tabs__row--marquee-selected" : ""} ${hasPendingEdit ? "doc-tabs__row--pending-edit" : ""}`.trim()}
        onDragOver={(event) => {
          event.preventDefault()
          event.stopPropagation()
          const mode = getDropMode(event)
          onDropTargetChange({ targetId: tab.id, mode })
        }}
        onDrop={(event) => {
          event.preventDefault()
          event.stopPropagation()
          const mode = dropTarget?.targetId === tab.id ? dropTarget.mode : getDropMode(event)
          onDropCommit(tab.id, mode)
        }}
      >
        {isEditing ? (
          <input
            className="doc-tabs__rename-input"
            value={editingTitle}
            autoFocus
            style={{ paddingLeft: `${12 + depth * 18}px` }}
            onChange={(event) => {
              onEditingTitleChange(event.target.value)
            }}
            onClick={(event) => {
              event.stopPropagation()
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                onCommitRename()
              }

              if (event.key === "Escape") {
                event.preventDefault()
                onCancelRename()
              }
            }}
            onBlur={() => {
              onCommitRename()
            }}
          />
        ) : (
          <>
            <button
              type="button"
              draggable
              className={`doc-tabs__label ${isDragging ? "doc-tabs__row--dragging" : ""}`.trim()}
              style={{ paddingLeft: `${8 + depth * 16}px` }}
              onClick={(event) => {
                if ((event.metaKey || event.ctrlKey) && onOpenInNewTab) {
                  event.preventDefault()
                  onOpenInNewTab(tab.id)
                } else {
                  // Shift+click range-selects — stop the browser from also
                  // selecting the label text across the rows it spans.
                  if (event.shiftKey) event.preventDefault()
                  onSelect(tab.id, { shiftKey: event.shiftKey })
                }
              }}
              onDoubleClick={(event) => {
                // Arm this single tab for an action (accent outline) without
                // opening anything new — the click(s) already opened it.
                event.preventDefault()
                onSelectForAction(tab.id)
              }}
              onDragStart={(event) => {
                onDragStart(event, tab.id)
              }}
              onDragEnd={() => {
                onDragEnd()
              }}
              onContextMenu={(event) => {
                event.preventDefault()
                onCtxMenu(tab.id, event.clientX, event.clientY)
              }}
            >
              {depth > 0 ? (
                <span
                  className="doc-tabs__indent-icon"
                  style={{ left: `${8 + (depth - 1) * 16}px` }}
                  aria-hidden="true"
                >
                  <CornerDownRight size={14} strokeWidth={1.9} />
                </span>
              ) : null}

              <span className="doc-tabs__type-icon" aria-hidden="true">
                <TabIcon size={14} strokeWidth={1.9} />
              </span>

              <span
                ref={marqueeViewportRef}
                className={`doc-tabs__label-marquee ${marquee.isOverflowing ? "doc-tabs__label-marquee--overflowing" : ""}`.trim()}
                style={
                  marquee.isOverflowing
                    ? ({ "--marquee-distance": `${marquee.loopDistance}px` } as CSSProperties)
                    : undefined
                }
              >
                <span className="doc-tabs__label-marquee-track">
                  <span ref={marqueeTextRef} className="doc-tabs__label-marquee-text">
                    {tab.title}
                  </span>
                  {marquee.isOverflowing ? <span className="doc-tabs__label-marquee-gap" aria-hidden="true" /> : null}
                  {marquee.isOverflowing ? (
                    <span className="doc-tabs__label-marquee-text" aria-hidden="true">
                      {tab.title}
                    </span>
                  ) : null}
                </span>
              </span>
            </button>

            {hasChildren ? (
              <button
                type="button"
                className={`doc-tabs__collapse-btn ${isExpanded ? "doc-tabs__collapse-btn--open" : ""}`.trim()}
                aria-label={isExpanded ? `Collapse ${tab.title}` : `Expand ${tab.title}`}
                aria-expanded={isExpanded}
                onMouseDown={(event) => {
                  event.stopPropagation()
                }}
                onClick={(event) => {
                  event.stopPropagation()
                  onToggleExpand(tab.id)
                }}
              >
                <ChevronDown size={15} strokeWidth={2} aria-hidden="true" />
              </button>
            ) : null}
          </>
        )}
      </div>

      <div
        className={`doc-tabs__drop-line doc-tabs__drop-line--bottom ${isDropAfter ? "doc-tabs__drop-line--visible" : ""}`.trim()}
        style={{ marginLeft: `${12 + depth * 18}px` }}
      />

      {hasChildren && isExpanded ? (
        <ul className="doc-tabs__list doc-tabs__list--nested">
          {tab.children.map((child) => (
            <TabNode
              key={child.id}
              tab={child}
              project={project}
              depth={depth + 1}
              activeId={activeId}
              draggingIds={draggingIds}
              marqueeSelectedIds={marqueeSelectedIds}
              dropTarget={dropTarget}
              editingId={editingId}
              editingTitle={editingTitle}
              pendingEditTabIds={pendingEditTabIds}
              onSelect={onSelect}
              onSelectForAction={onSelectForAction}
              onOpenInNewTab={onOpenInNewTab}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onDropTargetChange={onDropTargetChange}
              onDropCommit={onDropCommit}
              onStartRename={onStartRename}
              onRequestDelete={onRequestDelete}
              onContextMenu={onCtxMenu}
              onEditingTitleChange={onEditingTitleChange}
              onCommitRename={onCommitRename}
              onCancelRename={onCancelRename}
              onRowRef={onRowRef}
              expandedById={expandedById}
              onToggleExpand={onToggleExpand}
            />
          ))}
        </ul>
      ) : null}
    </li>
  )
}
