import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent } from "react"
import { Copy, ExternalLink, FileCode, FilePlus2, FileType, Pencil, Presentation, Trash2 } from "lucide-react"
import { collectTabIds, getProjectEntryTerms, type DocumentTab, type Project, type ProjectKind } from "../../../core/utils/projects"
import { openInNewItemLabel } from "../../../core/electron/localWorkspace"
import { useListDrag, nearestRowBoundary, type DropMode } from "../shared/hooks/useListDrag"
import ProjectContextMenu, { type ContextMenuAction } from "../library/ProjectContextMenu"
import Button from "../ui/Button"
import Modal from "../ui/Modal"
import MarqueeText from "../ui/MarqueeText"
import TabNode from "./TabNode"
import usePanelMarquee from "./usePanelMarquee"
import {
  findNode,
  collectDescendantTitles,
  collectSelectedRootIds,
  flattenVisibleTabIds,
  renameTab,
  deleteTab,
  findAncestorIds,
  moveNodes,
} from "./tabTreeUtils"
import "./navPanelShared.css"
import "./DocumentTabsPanel.css"


type DocumentTabsProps = {
  projectName: string
  tabs: DocumentTab[]
  projectKind: ProjectKind
  /** Full project, used to resolve per-tab file-type icons (markdown vs.
   *  plaintext vs. PDF vs. pinboard vs. prose chapter). */
  project: Project
  activeId: string | null
  isVisible?: boolean
  pendingEditTabIds?: Set<string>
  onTabsChange: (updater: (current: DocumentTab[]) => DocumentTab[]) => void
  onSelect: (id: string) => void
  /** Create the project's primary entry: a Chapter in a Book, a Pinboard
   *  (slide) in a Presentation. Caller is responsible for the actual call —
   *  this panel just exposes the action via the context menu. */
  onCreateEntry: () => void
  onCreateMarkdown: () => void
  onCreatePlainText: () => void
  onOpenTabInNewTab?: (tabId: string) => void
  onDuplicateTab?: (tabId: string) => void
}

type TabsContextMenuState =
  | { x: number; y: number; kind: "background" }
  | { x: number; y: number; kind: "tab"; tabId: string; selectedTabIds?: string[] }

export default function DocumentTabsPanel({
  projectName,
  tabs,
  projectKind,
  project,
  activeId,
  isVisible = true,
  pendingEditTabIds,
  onTabsChange,
  onSelect,
  onCreateEntry,
  onCreateMarkdown,
  onCreatePlainText,
  onOpenTabInNewTab,
  onDuplicateTab,
}: DocumentTabsProps) {
  const drag = useListDrag()
  const { draggingId, dropTarget, setDraggingId, setDropTarget } = drag
  const { marqueeContainerRef, marqueeSelectedIds, setMarqueeSelectedIds, marquee, liveSelectedIds } = usePanelMarquee()
  const multiDragIdsRef = useRef<string[]>([])
  // Click/keyboard multi-selection: `anchor` is the fixed end of a shift-range,
  // `lead` is the moving end (where the keyboard cursor is). Refs, not state —
  // they steer selection but don't themselves need to paint. The selection set
  // they drive is `marqueeSelectedIds` (shared with the rubber-band marquee).
  const selectionAnchorRef = useRef<string | null>(null)
  const selectionLeadRef = useRef<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState("")
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [expandedById, setExpandedById] = useState<Record<string, boolean>>({})
  const [contextMenu, setContextMenu] = useState<TabsContextMenuState | null>(null)
  const closeContextMenu = useCallback(() => setContextMenu(null), [])

  // Click selection. The selection set (shared with the marquee) is what reads
  // as "selected for an action" — the accent outline, and what Delete acts on.
  //  • Plain click  → navigate only: open the tab (the white "current" pill) and
  //    DROP any action-selection. The anchor is kept so a following Shift+click /
  //    Shift+Arrow ranges from here. Arming a single tab is a double-click
  //    (handleArmTabSelection).
  //  • Shift+click  → range-select from the anchor to the clicked row in visible
  //    order, WITHOUT changing which document is open — so click-then-shift-click
  //    builds a multi-selection the Delete key can act on.
  // (Cmd/Ctrl+click is handled upstream in TabNode as "open in new tab".)
  const handleSelectTab = useCallback(
    (id: string, modifiers?: { shiftKey?: boolean }) => {
      if (modifiers?.shiftKey && selectionAnchorRef.current) {
        const order = flattenVisibleTabIds(tabs, expandedById)
        const anchorIndex = order.indexOf(selectionAnchorRef.current)
        const targetIndex = order.indexOf(id)
        if (anchorIndex !== -1 && targetIndex !== -1) {
          const [lo, hi] = anchorIndex <= targetIndex ? [anchorIndex, targetIndex] : [targetIndex, anchorIndex]
          setMarqueeSelectedIds(new Set(order.slice(lo, hi + 1)))
          selectionLeadRef.current = id
          return
        }
      }

      selectionAnchorRef.current = id
      selectionLeadRef.current = id
      setMarqueeSelectedIds(new Set())
      onSelect(id)
    },
    [expandedById, onSelect, setMarqueeSelectedIds, tabs],
  )

  // Double-click "arms" a single tab for an action: it becomes the sole action
  // selection, so its outline turns accent (the accent pill when it's also the
  // open tab) and the Delete key can act on it. The preceding click already
  // opened it, so this only flips the selection, never the open document.
  const handleArmTabSelection = useCallback(
    (id: string) => {
      selectionAnchorRef.current = id
      selectionLeadRef.current = id
      setMarqueeSelectedIds(new Set([id]))
    },
    [setMarqueeSelectedIds],
  )
  const rootListRef = useRef<HTMLUListElement | null>(null)
  const rowRefs = useRef<Record<string, HTMLDivElement>>({})
  const [activeIndicatorStyle, setActiveIndicatorStyle] = useState<{ top: number; height: number; visible: boolean }>({
    top: 0,
    height: 0,
    visible: false,
  })
  const { singular, plural } = getProjectEntryTerms(projectKind)
  const deleteEntryNoun = singular.toLowerCase()
  const subEntryLabel = `sub ${plural.toLowerCase()}`
  const tabIds = useMemo(() => collectTabIds(tabs), [tabs])
  const pendingDeleteNode = pendingDeleteId ? findNode(tabs, pendingDeleteId) : null
  const pendingDeleteDescendantTitles = pendingDeleteNode ? collectDescendantTitles(pendingDeleteNode) : []

  const selectedRootIds = useMemo(() => collectSelectedRootIds(tabs, marqueeSelectedIds), [tabs, marqueeSelectedIds])
  const draggingIds = useMemo(() => {
    if (!draggingId) {
      return new Set<string>()
    }

    if (multiDragIdsRef.current.length > 1 && multiDragIdsRef.current.includes(draggingId)) {
      return new Set(multiDragIdsRef.current)
    }

    return new Set<string>([draggingId])
  }, [draggingId])

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
    const validIds = new Set(tabIds)

    setMarqueeSelectedIds((current) => {
      if (current.size === 0) return current

      let changed = false
      const next = new Set<string>()

      for (const id of current) {
        if (validIds.has(id)) {
          next.add(id)
        } else {
          changed = true
        }
      }

      return changed ? next : current
    })
  }, [tabIds, setMarqueeSelectedIds])

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

  // Move keyboard focus to a row's label button (arrow nav, post-marquee) without
  // scrolling the panel around it.
  const focusTabLabel = useCallback((id: string) => {
    const button = rowRefs.current[id]?.querySelector<HTMLButtonElement>("button.doc-tabs__label")
    button?.focus({ preventScroll: true })
  }, [])

  // Sliding-pill indicator behind the active tab. Same mechanism as the global
  // settings sidebar (GlobalSettings.tsx): measure the active row's rect
  // relative to the list and drive an absolutely-positioned pill via top/height.
  // useLayoutEffect (not useEffect) so the first measurement lands before paint,
  // avoiding a flash of the pill at top:0 when a tab first becomes active.
  useLayoutEffect(() => {
    if (!isVisible) {
      setActiveIndicatorStyle((current) => (current.visible ? { top: 0, height: 0, visible: false } : current))
      return
    }

    const rootList = rootListRef.current
    const activeRow = activeId ? rowRefs.current[activeId] : null
    if (!rootList || !activeRow) {
      // No active tab (or its row isn't mounted, e.g. collapsed ancestor): hide
      // the pill rather than stranding it at a stale position.
      setActiveIndicatorStyle((current) => (current.visible ? { top: 0, height: 0, visible: false } : current))
      return
    }

    const syncActiveIndicator = () => {
      const listRect = rootList.getBoundingClientRect()
      const rowRect = activeRow.getBoundingClientRect()
      // getBoundingClientRect is viewport-relative, so subtracting the two rects
      // already nets out any scroll offset of an ancestor.
      const top = rowRect.top - listRect.top
      const height = rowRect.height

      setActiveIndicatorStyle((current) => {
        if (current.top === top && current.height === height && current.visible) {
          return current
        }

        return { top, height, visible: true }
      })
    }

    syncActiveIndicator()
    window.addEventListener("resize", syncActiveIndicator)

    // Re-measure when the list reflows (tab added/removed/reordered changes the
    // active row's offset) or the active row itself resizes (rename/marquee).
    const resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(syncActiveIndicator) : null
    resizeObserver?.observe(rootList)
    resizeObserver?.observe(activeRow)

    // Keep the pill glued to the row when the surrounding panel scrolls. Listen
    // in capture phase so we catch whichever ancestor actually scrolls.
    window.addEventListener("scroll", syncActiveIndicator, true)

    return () => {
      window.removeEventListener("resize", syncActiveIndicator)
      window.removeEventListener("scroll", syncActiveIndicator, true)
      resizeObserver?.disconnect()
    }
  }, [activeId, isVisible, tabs, expandedById])

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

  const deleteTabsAndSyncSelection = useCallback((targetIds: string[]) => {
    if (targetIds.length === 0) {
      return
    }

    const normalizedRootIds = collectSelectedRootIds(tabs, new Set(targetIds))
    if (normalizedRootIds.length === 0) {
      return
    }

    const deletedIdSet = new Set(normalizedRootIds)
    const nextTabs = normalizedRootIds.reduce((current, targetId) => deleteTab(current, targetId), tabs)
    const remainingIds = collectTabIds(nextTabs)

    onTabsChange(() => nextTabs)
    setMarqueeSelectedIds(new Set())
    selectionAnchorRef.current = null
    selectionLeadRef.current = null
    multiDragIdsRef.current = []
    setDropTarget(null)
    setDraggingId(null)

    if (!activeId || deletedIdSet.has(activeId) || !remainingIds.includes(activeId)) {
      const nextActiveId = remainingIds[0] ?? null
      if (nextActiveId) {
        onSelect(nextActiveId)
      }
    }
  }, [activeId, onSelect, onTabsChange, setDropTarget, setDraggingId, setMarqueeSelectedIds, tabs])

  const confirmDelete = () => {
    if (!pendingDeleteId) {
      return
    }

    deleteTabAndSyncSelection(pendingDeleteId)
    closeDeleteModal()
  }

  const getDragSourceIds = useCallback(() => {
    if (!draggingId) {
      return [] as string[]
    }

    if (multiDragIdsRef.current.length > 1 && multiDragIdsRef.current.includes(draggingId)) {
      return [...multiDragIdsRef.current]
    }

    return [draggingId]
  }, [draggingId])

  const handleTabDragStart = useCallback((event: DragEvent<HTMLButtonElement>, id: string) => {
    const selectedRootIds = collectSelectedRootIds(tabs, marqueeSelectedIds)
    if (selectedRootIds.length > 1 && selectedRootIds.includes(id)) {
      multiDragIdsRef.current = selectedRootIds
      drag.handleDragStart(event, id, editingId)
      event.dataTransfer.setData("text/plain", selectedRootIds.join(","))
      return
    }

    multiDragIdsRef.current = []
    drag.handleDragStart(event, id, editingId)
  }, [drag, editingId, marqueeSelectedIds, tabs])

  const handleTabDragEnd = useCallback(() => {
    multiDragIdsRef.current = []
    drag.handleDragEnd()
  }, [drag])

  const commitTabDrop = useCallback((targetId: string, mode: DropMode) => {
    const sourceIds = getDragSourceIds()
    if (sourceIds.length === 0) {
      return
    }

    onTabsChange((current) => moveNodes(current, sourceIds, targetId, mode))
    setDraggingId(null)
    setDropTarget(null)
  }, [getDragSourceIds, onTabsChange, setDraggingId, setDropTarget])

  // Keyboard control for the tab list. Handled on the list shell (tabIndex -1),
  // so it only fires while focus is on a tab button or the shell itself — these
  // keys can never reach the editor or another panel (in particular, Delete can
  // never trash the tab you're typing in). Plain click focuses the button; a
  // finished marquee focuses the shell (effect below):
  //   • Up/Down           move the single selection + focus to the adjacent
  //                       visible tab (does NOT open it — Enter/click opens)
  //   • Shift+Up/Down     extend the selection from the anchor to the new lead
  //   • Enter             open the focused tab
  //   • Delete/Backspace  trash the current selection
  const handleShellKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    // Let the rename input own its keys (Delete, arrows, Enter, Escape).
    if (target.closest("input, textarea")) {
      return
    }

    if (event.key === "Delete" || event.key === "Backspace") {
      if (selectedRootIds.length === 0) {
        return
      }
      event.preventDefault()
      cancelRename()
      closeDeleteModal()
      closeContextMenu()
      deleteTabsAndSyncSelection(selectedRootIds)
      return
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      const order = flattenVisibleTabIds(tabs, expandedById)
      if (order.length === 0) {
        return
      }
      event.preventDefault()

      const lead = selectionLeadRef.current ?? activeId
      const leadIndex = lead ? order.indexOf(lead) : -1
      const step = event.key === "ArrowDown" ? 1 : -1
      const nextIndex =
        leadIndex === -1
          ? event.key === "ArrowDown"
            ? 0
            : order.length - 1
          : Math.min(order.length - 1, Math.max(0, leadIndex + step))
      const nextId = order[nextIndex]
      if (!nextId) {
        return
      }

      if (event.shiftKey) {
        // Extend the range from the fixed anchor to the new lead.
        let anchorIndex = selectionAnchorRef.current ? order.indexOf(selectionAnchorRef.current) : -1
        if (anchorIndex === -1) {
          anchorIndex = leadIndex === -1 ? nextIndex : leadIndex
          selectionAnchorRef.current = order[anchorIndex] ?? nextId
        }
        const [lo, hi] = anchorIndex <= nextIndex ? [anchorIndex, nextIndex] : [nextIndex, anchorIndex]
        setMarqueeSelectedIds(new Set(order.slice(lo, hi + 1)))
      } else {
        // Plain move = navigate: open the adjacent tab (white "current" pill)
        // and drop any action-selection, the same as single-clicking it.
        selectionAnchorRef.current = nextId
        setMarqueeSelectedIds(new Set())
        onSelect(nextId)
      }

      selectionLeadRef.current = nextId
      focusTabLabel(nextId)
      return
    }

    if (event.key === "Enter") {
      const lead = selectionLeadRef.current
      if (!lead) {
        return
      }
      event.preventDefault()
      selectionAnchorRef.current = lead
      setMarqueeSelectedIds(new Set())
      onSelect(lead)
    }
  }

  // After a marquee (rubber-band) selection settles, pull focus into the panel
  // and seed the anchor/lead from the selection so the keyboard (Delete,
  // Shift+Arrow) picks up where the drag left off.
  const wasMarqueeActiveRef = useRef(false)
  useEffect(() => {
    const wasActive = wasMarqueeActiveRef.current
    wasMarqueeActiveRef.current = marquee.isActive
    if (!wasActive || marquee.isActive || marqueeSelectedIds.size === 0) {
      return
    }

    const order = flattenVisibleTabIds(tabs, expandedById)
    const selectedInOrder = order.filter((id) => marqueeSelectedIds.has(id))
    if (selectedInOrder.length === 0) {
      return
    }

    selectionAnchorRef.current = selectedInOrder[0]
    selectionLeadRef.current = selectedInOrder[selectedInOrder.length - 1]
    marqueeContainerRef.current?.focus({ preventScroll: true })
  }, [marquee.isActive, marqueeSelectedIds, tabs, expandedById, marqueeContainerRef])

  const handleRootListDragOver = (event: DragEvent<HTMLUListElement>) => {
    if (!draggingId || tabs.length === 0) {
      return
    }

    event.preventDefault()

    // Rows stopPropagation, so we only reach here over the dead space between
    // rows (the flex gap + the invisible drop-line strips) or the empty area
    // below the list. Resolve the cursor to the nearest row boundary so the
    // between-rows indicator stays lit across that whole band, rather than
    // snapping to the first/last tab.
    const boundary = nearestRowBoundary(event.currentTarget, event.clientY)
    if (boundary) setDropTarget(boundary)
  }

  const handleRootListDrop = (event: DragEvent<HTMLUListElement>) => {
    if (!dropTarget) {
      return
    }

    event.preventDefault()
    commitTabDrop(dropTarget.targetId, dropTarget.mode)
  }

  const handleBackgroundContextMenu = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null
    if (!target) return

    if (target.closest(".doc-tabs__item")) return
    if (target.closest("input, textarea, [contenteditable='true']")) return

    event.preventDefault()
    setContextMenu({ x: event.clientX, y: event.clientY, kind: "background" })
  }, [])

  return (
    <div className="doc-tabs" onContextMenu={handleBackgroundContextMenu}>
      <div className="doc-tabs__section-divider-wrap" aria-hidden="true">
        <div className="doc-tabs__section-divider" />
      </div>

      <header className="doc-tabs__header">
        <p className="doc-tabs__project-name" data-marquee-parent><MarqueeText text={projectName} /></p>
        {/* Phase 7: per-kind plural heading. Books say "Chapters", Presentations
            "Slides". Single-document kinds never reach this component (the
            list is suppressed entirely by NavigationPanel). */}
        <p className="doc-tabs__entry-heading" aria-hidden="true">{plural}</p>
      </header>

      <div
        ref={marqueeContainerRef}
        className={`doc-tabs__list-shell ${marquee.isActive ? "doc-tabs__list-shell--marquee" : ""}`.trim()}
        tabIndex={-1}
        onMouseDown={marquee.handleMouseDown}
        onKeyDown={handleShellKeyDown}
      >
        {marquee.isActive && marquee.rect ? (
          <div
            className="doc-tabs__marquee-selection"
            style={{
              left: marquee.rect.x,
              top: marquee.rect.y,
              width: marquee.rect.width,
              height: marquee.rect.height,
            }}
          />
        ) : null}

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
              project={project}
              depth={0}
              activeId={activeId}
              draggingIds={draggingIds}
              marqueeSelectedIds={liveSelectedIds}
              dropTarget={dropTarget}
              editingId={editingId}
              editingTitle={editingTitle}
              pendingEditTabIds={pendingEditTabIds}
              onSelect={handleSelectTab}
              onSelectForAction={handleArmTabSelection}
              onOpenInNewTab={onOpenTabInNewTab}
              onDragStart={(event, id) => {
                handleTabDragStart(event, id)
              }}
              onDragEnd={() => {
                handleTabDragEnd()
              }}
              onDropTargetChange={(target) => {
                setDropTarget(target)
              }}
              onDropCommit={(targetId, mode) => {
                commitTabDrop(targetId, mode)
              }}
              onStartRename={startRename}
              onRequestDelete={(id) => {
                if (editingId === id) {
                  cancelRename()
                }
                setPendingDeleteId(id)
              }}
              onContextMenu={(id, x, y) => {
                const liveRootIds = collectSelectedRootIds(tabs, liveSelectedIds)
                if (liveSelectedIds.size > 1 && liveSelectedIds.has(id) && liveRootIds.length > 1) {
                  setContextMenu({ x, y, kind: "tab", tabId: id, selectedTabIds: liveRootIds })
                } else {
                  setContextMenu({ x, y, kind: "tab", tabId: id })
                }
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
        title={`Trash ${singular}`}
        titleIcon={<Trash2 size={19} strokeWidth={1.9} aria-hidden="true" />}
        panelClassName="doc-tabs__trash-modal-panel"
        closeLabel="Cancel"
        footer={(
          <Button variant="footer-danger" onClick={confirmDelete}>
            <Trash2 size={14} strokeWidth={2} aria-hidden="true" />
            Trash
          </Button>
        )}
      >
        <p className="doc-tabs__trash-copy">Are you sure you want to trash this {deleteEntryNoun}?</p>
        {pendingDeleteDescendantTitles.length > 0 ? (
          <>
            <p className="doc-tabs__trash-copy doc-tabs__delete-subtree-note">This will also trash all {subEntryLabel}.</p>
            <ul className="doc-tabs__delete-subtree-list" aria-label={`Sub ${plural.toLowerCase()} that will be trashed`}>
              {pendingDeleteDescendantTitles.map((title, index) => (
                <li key={`${title}-${index}`}>{title}</li>
              ))}
            </ul>
          </>
        ) : null}
      </Modal>

      {contextMenu ? (
        <ProjectContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={closeContextMenu}
          actions={(() => {
            if (contextMenu.kind === "background") {
              // Background create options follow the slide-2 header rules:
              //   • Book: Create Chapter / Markdown / Plain Text
              //   • Presentation: Create Pinboard
              //   • single-doc: unreachable (panel is hidden)
              if (projectKind === "Book") {
                return [
                  {
                    label: `Create ${singular}`,
                    icon: <FilePlus2 size={15} strokeWidth={1.9} aria-hidden="true" />,
                    action: onCreateEntry,
                  },
                  {
                    label: "Create Markdown",
                    icon: <FileCode size={15} strokeWidth={1.9} aria-hidden="true" />,
                    action: onCreateMarkdown,
                  },
                  {
                    label: "Create Plain Text",
                    icon: <FileType size={15} strokeWidth={1.9} aria-hidden="true" />,
                    action: onCreatePlainText,
                  },
                ]
              }
              if (projectKind === "Presentation") {
                return [
                  {
                    label: "Create Pinboard",
                    icon: <Presentation size={15} strokeWidth={1.9} aria-hidden="true" />,
                    action: onCreateEntry,
                  },
                ]
              }
              return []
            }

            const contextMenuSelectedIds = contextMenu.selectedTabIds ?? []

            if (contextMenuSelectedIds.length > 1) {
              const selectedCount = contextMenuSelectedIds.length
              const actions: ContextMenuAction[] = [
                {
                  label: `Trash ${selectedCount} ${selectedCount === 1 ? singular : plural}`,
                  icon: <Trash2 size={15} strokeWidth={1.9} aria-hidden="true" />,
                  action: () => {
                    if (editingId && contextMenuSelectedIds.includes(editingId)) {
                      cancelRename()
                    }
                    deleteTabsAndSyncSelection(contextMenuSelectedIds)
                    closeContextMenu()
                  },
                  danger: true,
                },
              ]
              return actions
            }

            const tab = findNode(tabs, contextMenu.tabId)
            if (!tab) return []
            const actions: ContextMenuAction[] = [
              ...(onOpenTabInNewTab ? [{
                label: openInNewItemLabel(),
                icon: <ExternalLink size={15} strokeWidth={1.9} aria-hidden="true" />,
                action: () => {
                  onOpenTabInNewTab(contextMenu.tabId)
                  closeContextMenu()
                },
              }] : []),
              {
                label: "Rename",
                icon: <Pencil size={15} strokeWidth={1.9} aria-hidden="true" />,
                action: () => startRename(contextMenu.tabId, tab.title),
              },
              ...(onDuplicateTab ? [{
                label: "Duplicate",
                icon: <Copy size={15} strokeWidth={1.9} aria-hidden="true" />,
                action: () => {
                  onDuplicateTab(contextMenu.tabId)
                  closeContextMenu()
                },
              }] : []),
              {
                label: "Trash",
                icon: <Trash2 size={15} strokeWidth={1.9} aria-hidden="true" />,
                action: () => {
                  if (editingId === contextMenu.tabId) cancelRename()
                  setPendingDeleteId(contextMenu.tabId)
                },
                danger: true,
              },
            ]
            return actions
          })()}
        />
      ) : null}
    </div>
  )
}
