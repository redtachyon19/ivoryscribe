import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent } from "react"
import { ChevronDown, CornerDownRight, Pencil, Trash2 } from "lucide-react"
import { collectTabIds, getProjectEntryTerms, type DocumentTab, type ProjectKind } from "../../../core/projects"
import { useListDrag, getDropMode, type DropMode, type DropTarget } from "../editor/hooks/useListDrag"
import Button from "../ui/Button"
import Modal from "../ui/Modal"
import "./DocumentTabsPanel.css"

// Guards against dropping a node inside its own subtree.
function containsId(node: DocumentTab, targetId: string): boolean {
  if (node.id === targetId) {
    return true
  }

  return node.children.some((child) => containsId(child, targetId))
}

// Finds a node anywhere in the tree.
function findNode(nodes: DocumentTab[], targetId: string): DocumentTab | null {
  for (const node of nodes) {
    if (node.id === targetId) {
      return node
    }

    const nested = findNode(node.children, targetId)
    if (nested) {
      return nested
    }
  }

  return null
}

// Removes a node from any depth and returns both the new tree and removed node.
function removeNode(
  nodes: DocumentTab[],
  targetId: string,
): { nextNodes: DocumentTab[]; removed: DocumentTab | null } {
  let removed: DocumentTab | null = null

  const nextNodes = nodes
    .filter((node) => {
      if (node.id === targetId) {
        removed = node
        return false
      }
      return true
    })
    .map((node) => {
      const nested = removeNode(node.children, targetId)
      if (nested.removed) {
        removed = nested.removed
      }

      return {
        ...node,
        children: nested.nextNodes,
      }
    })

  return { nextNodes, removed }
}

// Inserts relative to a target node (before/after), preserving nested structure.
function insertRelative(
  nodes: DocumentTab[],
  targetId: string,
  newNode: DocumentTab,
  mode: "before" | "after",
): { nextNodes: DocumentTab[]; inserted: boolean } {
  let inserted = false
  const nextNodes: DocumentTab[] = []

  for (const node of nodes) {
    if (node.id === targetId) {
      inserted = true
      if (mode === "before") {
        nextNodes.push(newNode, node)
      } else {
        nextNodes.push(node, newNode)
      }
      continue
    }

    const nested = insertRelative(node.children, targetId, newNode, mode)
    if (nested.inserted) {
      inserted = true
      nextNodes.push({
        ...node,
        children: nested.nextNodes,
      })
      continue
    }

    nextNodes.push(node)
  }

  return { nextNodes, inserted }
}

// Inserts a node as a child of target.
function insertInside(
  nodes: DocumentTab[],
  targetId: string,
  newNode: DocumentTab,
): { nextNodes: DocumentTab[]; inserted: boolean } {
  let inserted = false

  const nextNodes = nodes.map((node) => {
    if (node.id === targetId) {
      inserted = true
      return {
        ...node,
        children: [...node.children, newNode],
      }
    }

    const nested = insertInside(node.children, targetId, newNode)
    if (nested.inserted) {
      inserted = true
      return {
        ...node,
        children: nested.nextNodes,
      }
    }

    return node
  })

  return { nextNodes, inserted }
}

// Canonical move operation used by all drag/drop commit paths.
function moveNode(tabs: DocumentTab[], sourceId: string, targetId: string, mode: DropMode): DocumentTab[] {
  if (sourceId === targetId) {
    return tabs
  }

  const sourceNode = findNode(tabs, sourceId)
  if (!sourceNode) {
    return tabs
  }

  if (containsId(sourceNode, targetId)) {
    return tabs
  }

  const removedResult = removeNode(tabs, sourceId)
  if (!removedResult.removed) {
    return tabs
  }

  if (mode === "inside") {
    const insertedResult = insertInside(removedResult.nextNodes, targetId, removedResult.removed)
    return insertedResult.inserted ? insertedResult.nextNodes : tabs
  }

  const insertedResult = insertRelative(removedResult.nextNodes, targetId, removedResult.removed, mode)
  return insertedResult.inserted ? insertedResult.nextNodes : tabs
}

// Applies in-place title edits by ID.
function renameTab(nodes: DocumentTab[], targetId: string, nextTitle: string): DocumentTab[] {
  return nodes.map((node) => {
    if (node.id === targetId) {
      return {
        ...node,
        title: nextTitle,
      }
    }

    return {
      ...node,
      children: renameTab(node.children, targetId, nextTitle),
    }
  })
}

function deleteTab(nodes: DocumentTab[], targetId: string): DocumentTab[] {
  return removeNode(nodes, targetId).nextNodes
}

function collectDescendantTitles(node: DocumentTab): string[] {
  return node.children.flatMap((child) => [child.title, ...collectDescendantTitles(child)])
}

function findAncestorIds(nodes: DocumentTab[], targetId: string, ancestors: string[] = []): string[] | null {
  for (const node of nodes) {
    if (node.id === targetId) {
      return ancestors
    }

    const nested = findAncestorIds(node.children, targetId, [...ancestors, node.id])
    if (nested) {
      return nested
    }
  }

  return null
}

type TabNodeProps = {
  tab: DocumentTab
  depth: number
  activeId: string | null
  draggingId: string | null
  dropTarget: DropTarget
  editingId: string | null
  editingTitle: string
  onSelect: (id: string) => void
  onDragStart: (event: DragEvent<HTMLButtonElement>, id: string) => void
  onDragEnd: () => void
  onDropTargetChange: (target: DropTarget) => void
  onDropCommit: (targetId: string, mode: DropMode) => void
  onStartRename: (id: string, currentTitle: string) => void
  onRequestDelete: (id: string) => void
  onEditingTitleChange: (value: string) => void
  onCommitRename: () => void
  onCancelRename: () => void
  onRowRef: (id: string, element: HTMLDivElement | null) => void
  expandedById: Record<string, boolean>
  onToggleExpand: (id: string) => void
}

function TabNode({
  tab,
  depth,
  activeId,
  draggingId,
  dropTarget,
  editingId,
  editingTitle,
  onSelect,
  onDragStart,
  onDragEnd,
  onDropTargetChange,
  onDropCommit,
  onStartRename,
  onRequestDelete,
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
  const isDragging = draggingId === tab.id
  const isEditing = editingId === tab.id
  const isDropBefore = dropTarget?.targetId === tab.id && dropTarget.mode === "before"
  const isDropAfter = dropTarget?.targetId === tab.id && dropTarget.mode === "after"
  const isDropInside = dropTarget?.targetId === tab.id && dropTarget.mode === "inside"
  const hasChildren = tab.children.length > 0
  const isExpanded = expandedById[tab.id] !== false

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
        className={`doc-tabs__row ${isActive ? "doc-tabs__row--active" : ""}`.trim()}
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
              onClick={() => {
                onSelect(tab.id)
              }}
              onDragStart={(event) => {
                onDragStart(event, tab.id)
              }}
              onDragEnd={() => {
                onDragEnd()
              }}
              onContextMenu={(event) => {
                event.preventDefault()
                onStartRename(tab.id, tab.title)
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

              <span
                ref={marqueeViewportRef}
                className={`doc-tabs__label-marquee ${marquee.isOverflowing ? "doc-tabs__label-marquee--overflowing" : ""}`.trim()}
                style={
                  marquee.isOverflowing
                    ? ({ "--doc-tabs-marquee-distance": `${marquee.loopDistance}px` } as CSSProperties)
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

            <button
              type="button"
              className="doc-tabs__edit-btn"
              aria-label={`Rename ${tab.title}`}
              onClick={(event) => {
                event.stopPropagation()
                onStartRename(tab.id, tab.title)
              }}
            >
              <Pencil size={13} strokeWidth={2} aria-hidden="true" />
            </button>

            <button
              type="button"
              className="doc-tabs__delete-btn"
              aria-label={`Delete ${tab.title}`}
              onClick={(event) => {
                event.stopPropagation()
                onRequestDelete(tab.id)
              }}
            >
              <Trash2 size={13} strokeWidth={2} aria-hidden="true" />
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
              depth={depth + 1}
              activeId={activeId}
              draggingId={draggingId}
              dropTarget={dropTarget}
              editingId={editingId}
              editingTitle={editingTitle}
              onSelect={onSelect}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onDropTargetChange={onDropTargetChange}
              onDropCommit={onDropCommit}
              onStartRename={onStartRename}
              onRequestDelete={onRequestDelete}
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

type DocumentTabsProps = {
  projectName: string
  tabs: DocumentTab[]
  projectKind: ProjectKind
  activeId: string | null
  isVisible?: boolean
  onTabsChange: (updater: (current: DocumentTab[]) => DocumentTab[]) => void
  onSelect: (id: string) => void
}

export default function DocumentTabsPanel({
  projectName,
  tabs,
  projectKind,
  activeId,
  isVisible = true,
  onTabsChange,
  onSelect,
}: DocumentTabsProps) {
  const drag = useListDrag()
  const { draggingId, dropTarget, setDraggingId, setDropTarget } = drag
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState("")
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [expandedById, setExpandedById] = useState<Record<string, boolean>>({})
  const rootListRef = useRef<HTMLUListElement | null>(null)
  const rowRefs = useRef<Record<string, HTMLDivElement>>({})
  const [activeIndicatorStyle, setActiveIndicatorStyle] = useState<{ top: number; height: number; visible: boolean }>({
    top: 0,
    height: 0,
    visible: false,
  })
  const { singular, plural } = getProjectEntryTerms(projectKind)
  const deleteEntryNoun = projectKind === "Book" ? "chapter" : "post"
  const subEntryLabel = projectKind === "Book" ? "sub chapters" : "sub posts"
  const tabIds = useMemo(() => collectTabIds(tabs), [tabs])
  const pendingDeleteNode = pendingDeleteId ? findNode(tabs, pendingDeleteId) : null
  const pendingDeleteDescendantTitles = pendingDeleteNode ? collectDescendantTitles(pendingDeleteNode) : []

  useEffect(() => {
    setExpandedById((current) => {
      const next: Record<string, boolean> = {}
      for (const id of tabIds) {
        next[id] = current[id] ?? true
      }
      return next
    })
  }, [tabIds])

  useEffect(() => {
    if (!activeId) {
      return
    }

    const ancestorIds = findAncestorIds(tabs, activeId)
    if (!ancestorIds || ancestorIds.length === 0) {
      return
    }

    setExpandedById((current) => {
      let changed = false
      const next = { ...current }

      for (const id of ancestorIds) {
        if (next[id] !== true) {
          next[id] = true
          changed = true
        }
      }

      return changed ? next : current
    })
  }, [activeId, tabs])

  const registerRowRef = (id: string, element: HTMLDivElement | null) => {
    if (element) {
      rowRefs.current[id] = element
      return
    }

    delete rowRefs.current[id]
  }

  useEffect(() => {
    if (!isVisible) {
      setActiveIndicatorStyle((current) => (current.visible ? { top: 0, height: 0, visible: false } : current))
      return
    }

    const rootList = rootListRef.current
    const activeRow = activeId ? rowRefs.current[activeId] : null
    if (!rootList || !activeRow) {
      setActiveIndicatorStyle((current) => (current.visible ? { top: 0, height: 0, visible: false } : current))
      return
    }

    const syncActiveIndicator = () => {
      const listRect = rootList.getBoundingClientRect()
      const rowRect = activeRow.getBoundingClientRect()
      const top = rowRect.top - listRect.top
      const height = rowRect.height

      setActiveIndicatorStyle((current) => {
        if (current.top === top && current.height === height && current.visible) {
          return current
        }

        return {
          top,
          height,
          visible: true,
        }
      })
    }

    syncActiveIndicator()
    window.addEventListener("resize", syncActiveIndicator)

    const resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(syncActiveIndicator) : null
    resizeObserver?.observe(rootList)
    resizeObserver?.observe(activeRow)

    return () => {
      window.removeEventListener("resize", syncActiveIndicator)
      resizeObserver?.disconnect()
    }
  }, [activeId, isVisible, tabs])

  const startRename = (id: string, currentTitle: string) => {
    setEditingId(id)
    setEditingTitle(currentTitle)
  }

  const cancelRename = () => {
    setEditingId(null)
    setEditingTitle("")
  }

  const commitRename = () => {
    if (!editingId) {
      return
    }

    const trimmedTitle = editingTitle.trim()

    if (trimmedTitle) {
      onTabsChange((current) => renameTab(current, editingId, trimmedTitle))
    }

    cancelRename()
  }

  const closeDeleteModal = () => {
    setPendingDeleteId(null)
  }

  const deleteTabAndSyncSelection = (targetId: string) => {
    const nextTabs = deleteTab(tabs, targetId)
    const remainingIds = collectTabIds(nextTabs)

    onTabsChange(() => nextTabs)

    if (!activeId || !remainingIds.includes(activeId)) {
      const nextActiveId = remainingIds[0] ?? null
      if (nextActiveId) {
        onSelect(nextActiveId)
      }
    }
  }

  const confirmDelete = () => {
    if (!pendingDeleteId) {
      return
    }

    deleteTabAndSyncSelection(pendingDeleteId)
    closeDeleteModal()
  }

  const handleRootListDragOver = (event: DragEvent<HTMLUListElement>) => {
    // Supports dropping into empty list spaces by snapping to first/last tab edges.
    if (!draggingId || tabs.length === 0) {
      return
    }

    event.preventDefault()

    const targetElement = event.target as HTMLElement | null
    if (targetElement?.closest(".doc-tabs__item")) {
      return
    }

    const firstTabId = tabs[0]?.id
    const lastTabId = tabs[tabs.length - 1]?.id
    if (!firstTabId || !lastTabId) {
      return
    }

    const listRect = event.currentTarget.getBoundingClientRect()
    const relativeY = event.clientY - listRect.top
    const isTopZone = relativeY < listRect.height * 0.5

    setDropTarget({
      targetId: isTopZone ? firstTabId : lastTabId,
      mode: isTopZone ? "before" : "after",
    })
  }

  const handleRootListDrop = (event: DragEvent<HTMLUListElement>) => {
    if (!draggingId || !dropTarget) {
      return
    }

    event.preventDefault()
    onTabsChange((current) => moveNode(current, draggingId, dropTarget.targetId, dropTarget.mode))
    setDraggingId(null)
    setDropTarget(null)
  }

  return (
    <div className="doc-tabs">
      <header className="doc-tabs__header">
        <p className="doc-tabs__project-name">{projectName}</p>
      </header>

      <div className="doc-tabs__list-shell">
        <div
          className="doc-tabs__active-indicator"
          style={{
            top: `${activeIndicatorStyle.top}px`,
            height: `${activeIndicatorStyle.height}px`,
            opacity: activeIndicatorStyle.visible ? 1 : 0,
          }}
          aria-hidden="true"
        />

        <ul ref={rootListRef} className="doc-tabs__list" onDragOver={handleRootListDragOver} onDrop={handleRootListDrop}>
          {tabs.map((tab) => (
            <TabNode
              key={tab.id}
              tab={tab}
              depth={0}
              activeId={activeId}
              draggingId={draggingId}
              dropTarget={dropTarget}
              editingId={editingId}
              editingTitle={editingTitle}
              onSelect={onSelect}
              onDragStart={(event, id) => {
                drag.handleDragStart(event, id, editingId)
              }}
              onDragEnd={() => {
                drag.handleDragEnd()
              }}
              onDropTargetChange={(target) => {
                setDropTarget(target)
              }}
              onDropCommit={(targetId, mode) => {
                if (!draggingId) {
                  return
                }

                onTabsChange((current) => moveNode(current, draggingId, targetId, mode))
                setDraggingId(null)
                setDropTarget(null)
              }}
              onStartRename={startRename}
              onRequestDelete={(id) => {
                if (editingId === id) {
                  cancelRename()
                }
                setPendingDeleteId(id)
              }}
              onEditingTitleChange={setEditingTitle}
              onCommitRename={commitRename}
              onCancelRename={cancelRename}
              onRowRef={registerRowRef}
              expandedById={expandedById}
              onToggleExpand={(id) => {
                setExpandedById((current) => ({
                  ...current,
                  [id]: current[id] === false,
                }))
              }}
            />
          ))}
        </ul>
      </div>

      <Modal
        isOpen={Boolean(pendingDeleteId)}
        onClose={closeDeleteModal}
        title={`Delete ${singular}`}
        titleIcon={<Trash2 size={19} strokeWidth={1.9} aria-hidden="true" />}
        closeLabel="Cancel"
        footer={(
          <Button variant="footer-danger" onClick={confirmDelete}>
            <Trash2 size={14} strokeWidth={2} aria-hidden="true" />
            Delete
          </Button>
        )}
      >
        <p>Are you sure you are ready to stomp this {deleteEntryNoun} for good?</p>
        {pendingDeleteDescendantTitles.length > 0 ? (
          <>
            <p className="doc-tabs__delete-subtree-note">This will also delete all {subEntryLabel}.</p>
            <ul className="doc-tabs__delete-subtree-list" aria-label={`Sub ${plural.toLowerCase()} that will be deleted`}>
              {pendingDeleteDescendantTitles.map((title, index) => (
                <li key={`${title}-${index}`}>{title}</li>
              ))}
            </ul>
          </>
        ) : null}
      </Modal>
    </div>
  )
}
