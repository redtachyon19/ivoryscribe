import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Archive, BookCopy, BookText, ChevronRight, Cloud, ClipboardCopy, FileCode, FileType, FolderOpen, MoreHorizontal, Pencil, Presentation, Settings2, SquareArrowOutUpRight, Trash2, UserRoundPlus } from "lucide-react"
import type { ProjectKind } from "../../../core/utils/projects"
import { openInNewItemLabel } from "../../../core/electron/localWorkspace"

export type ContextMenuAction = {
  label: string
  icon: React.ReactNode
  action?: () => void
  children?: ContextMenuAction[]
  danger?: boolean
}

type ProjectContextMenuProps = {
  x: number
  y: number
  actions: ContextMenuAction[]
  onClose: () => void
}

function MenuItems({
  actions,
  onClose,
  openSubmenuLabel,
  setOpenSubmenuLabel,
}: {
  actions: ContextMenuAction[]
  onClose: () => void
  openSubmenuLabel: string | null
  setOpenSubmenuLabel: (label: string | null) => void
}) {
  const itemRefs = useRef<Map<string, HTMLButtonElement | null>>(new Map())

  return (
    <>
      {actions.map((item) => {
        const hasChildren = !!item.children && item.children.length > 0
        const isSubmenuOpen = hasChildren && openSubmenuLabel === item.label
        const itemRect = isSubmenuOpen ? itemRefs.current.get(item.label)?.getBoundingClientRect() : undefined
        return (
          <div
            key={item.label}
            className="project-context-menu__row"
            onMouseEnter={() => {
              if (hasChildren) setOpenSubmenuLabel(item.label)
              else setOpenSubmenuLabel(null)
            }}
          >
            <button
              ref={(el) => {
                itemRefs.current.set(item.label, el)
              }}
              type="button"
              role="menuitem"
              aria-haspopup={hasChildren ? "menu" : undefined}
              aria-expanded={hasChildren ? isSubmenuOpen : undefined}
              className={[
                "project-context-menu__item",
                item.danger ? "project-context-menu__item--danger" : "",
                hasChildren ? "project-context-menu__item--has-submenu" : "",
              ].filter(Boolean).join(" ")}
              onClick={() => {
                if (hasChildren) {
                  setOpenSubmenuLabel(isSubmenuOpen ? null : item.label)
                  return
                }
                item.action?.()
                onClose()
              }}
            >
              {item.icon}
              <span className="project-context-menu__item-label">{item.label}</span>
              {hasChildren && (
                <ChevronRight size={14} strokeWidth={2} aria-hidden={true} className="project-context-menu__chevron" />
              )}
            </button>
            {hasChildren && isSubmenuOpen && itemRect && (
              <SubmenuPanel
                anchorRect={itemRect}
                actions={item.children!}
                onClose={onClose}
              />
            )}
          </div>
        )
      })}
    </>
  )
}

function SubmenuPanel({
  anchorRect,
  actions,
  onClose,
}: {
  anchorRect: DOMRect
  actions: ContextMenuAction[]
  onClose: () => void
}) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  const [openSubmenuLabel, setOpenSubmenuLabel] = useState<string | null>(null)

  useEffect(() => {
    const el = panelRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight

    let left = anchorRect.right - 4
    let top = anchorRect.top - 4

    if (left + rect.width > viewportWidth) {
      left = Math.max(8, anchorRect.left - rect.width + 4)
    }
    if (top + rect.height > viewportHeight) {
      top = Math.max(8, viewportHeight - rect.height - 8)
    }

    el.style.left = `${left}px`
    el.style.top = `${top}px`
    el.style.visibility = "visible"
  }, [anchorRect])

  return (
    <div
      ref={panelRef}
      className="project-context-menu project-context-menu--submenu"
      role="menu"
      style={{ visibility: "hidden" }}
    >
      <MenuItems
        actions={actions}
        onClose={onClose}
        openSubmenuLabel={openSubmenuLabel}
        setOpenSubmenuLabel={setOpenSubmenuLabel}
      />
    </div>
  )
}

export default function ProjectContextMenu({ x, y, actions, onClose }: ProjectContextMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [openSubmenuLabel, setOpenSubmenuLabel] = useState<string | null>(null)

  useEffect(() => {
    const el = menuRef.current
    if (!el) return

    const rect = el.getBoundingClientRect()
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight

    let adjustedX = x
    let adjustedY = y

    if (x + rect.width > viewportWidth) {
      adjustedX = viewportWidth - rect.width - 8
    }
    if (y + rect.height > viewportHeight) {
      adjustedY = viewportHeight - rect.height - 8
    }

    el.style.left = `${adjustedX}px`
    el.style.top = `${adjustedY}px`
    el.style.visibility = "visible"
  }, [x, y])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose()
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }

    const handleScroll = () => onClose()

    document.addEventListener("mousedown", handleClickOutside)
    document.addEventListener("keydown", handleEscape)
    document.addEventListener("scroll", handleScroll, true)

    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
      document.removeEventListener("keydown", handleEscape)
      document.removeEventListener("scroll", handleScroll, true)
    }
  }, [onClose])

  return createPortal(
    <div
      ref={menuRef}
      className="project-context-menu"
      role="menu"
      style={{ left: x, top: y, visibility: "hidden" }}
    >
      <MenuItems
        actions={actions}
        onClose={onClose}
        openSubmenuLabel={openSubmenuLabel}
        setOpenSubmenuLabel={setOpenSubmenuLabel}
      />
    </div>,
    document.querySelector('.app') ?? document.body,
  )
}

export type ProjectContextMenuState = {
  x: number
  y: number
  projectId: string
  isFolder?: boolean
  isMultiSelect?: boolean
} | null

function showInFileManagerLabel(): string {
  const platform = typeof window !== "undefined" ? window.electronAPI?.platform : undefined
  if (platform === "darwin") return "Show in Finder"
  if (platform === "win32") return "Show in File Explorer"
  return "Show in File Manager"
}

export function buildProjectActions({
  projectId,
  isUnknownKind = false,
  onOpenInNewTab,
  onRename,
  onOpenSettings,
  onDuplicate,
  onShare,
  onMoveToCloud,
  onCopyPath,
  onShowInFinder,
  onArchive,
  onTrash,
}: {
  projectId: string
  isUnknownKind?: boolean
  onOpenInNewTab: (id: string) => void
  onRename: (id: string) => void
  onOpenSettings?: (id: string) => void
  onDuplicate?: (id: string) => void
  onShare?: (id: string) => void
  onMoveToCloud?: (id: string) => void
  onCopyPath?: (id: string) => void
  onShowInFinder?: (id: string) => void
  onArchive: (id: string) => void
  onTrash: (id: string) => void
}): ContextMenuAction[] {
  const actions: ContextMenuAction[] = []
  if (!isUnknownKind) {
    actions.push(
      { label: openInNewItemLabel(), icon: <SquareArrowOutUpRight size={14} strokeWidth={2} aria-hidden={true} />, action: () => onOpenInNewTab(projectId) },
      { label: "Rename", icon: <Pencil size={14} strokeWidth={2} aria-hidden={true} />, action: () => onRename(projectId) },
    )
  }

  if (onOpenSettings && !isUnknownKind) {
    actions.push({ label: "Open Project Settings", icon: <Settings2 size={14} strokeWidth={2} aria-hidden={true} />, action: () => onOpenSettings(projectId) })
  }

  if (onDuplicate && !isUnknownKind) {
    actions.push({ label: "Duplicate", icon: <BookCopy size={14} strokeWidth={2} aria-hidden={true} />, action: () => onDuplicate(projectId) })
  }

  if (onShare && !isUnknownKind) {
    actions.push({ label: "Share", icon: <UserRoundPlus size={14} strokeWidth={2} aria-hidden={true} />, action: () => onShare(projectId) })
  }

  const moreOptions: ContextMenuAction[] = []

  if (onCopyPath) {
    moreOptions.push({ label: "Copy as Path", icon: <ClipboardCopy size={14} strokeWidth={2} aria-hidden={true} />, action: () => onCopyPath(projectId) })
  }

  if (onShowInFinder) {
    moreOptions.push({ label: showInFileManagerLabel(), icon: <FolderOpen size={14} strokeWidth={2} aria-hidden={true} />, action: () => onShowInFinder(projectId) })
  }

  if (onMoveToCloud && !isUnknownKind) {
    moreOptions.push({ label: "Move to Cloud", icon: <Cloud size={14} strokeWidth={2} aria-hidden={true} />, action: () => onMoveToCloud(projectId) })
  }

  moreOptions.push(
    { label: "Archive", icon: <Archive size={14} strokeWidth={2} aria-hidden={true} />, action: () => onArchive(projectId) },
    { label: "Trash", icon: <Trash2 size={14} strokeWidth={2} aria-hidden={true} />, action: () => onTrash(projectId), danger: true },
  )

  actions.push({
    label: "More Options",
    icon: <MoreHorizontal size={14} strokeWidth={2} aria-hidden={true} />,
    children: moreOptions,
  })

  return actions
}

export function buildFolderActions({
  folderId,
  onOpenInNewWindow,
  onRename,
  onOpenSettings,
  onShare,
  onArchive,
  onTrash,
}: {
  folderId: string
  onOpenInNewWindow?: (id: string) => void
  onRename: (id: string) => void
  onOpenSettings?: (id: string) => void
  onShare?: (id: string) => void
  onArchive: (id: string) => void
  onTrash: (id: string) => void
}): ContextMenuAction[] {
  const actions: ContextMenuAction[] = []

  if (onOpenInNewWindow) {
    actions.push({
      label: "Open in New Window",
      icon: <SquareArrowOutUpRight size={14} strokeWidth={2} aria-hidden={true} />,
      action: () => onOpenInNewWindow(folderId),
    })
  }

  actions.push({ label: "Rename", icon: <Pencil size={14} strokeWidth={2} aria-hidden={true} />, action: () => onRename(folderId) })

  if (onOpenSettings) {
    actions.push({
      label: "Folder Settings",
      icon: <Settings2 size={14} strokeWidth={2} aria-hidden={true} />,
      action: () => onOpenSettings(folderId),
    })
  }

  if (onShare) {
    actions.push({ label: "Share", icon: <UserRoundPlus size={14} strokeWidth={2} aria-hidden={true} />, action: () => onShare(folderId) })
  }

  actions.push({
    label: "More Options",
    icon: <MoreHorizontal size={14} strokeWidth={2} aria-hidden={true} />,
    children: [
      { label: "Archive", icon: <Archive size={14} strokeWidth={2} aria-hidden={true} />, action: () => onArchive(folderId) },
      { label: "Trash", icon: <Trash2 size={14} strokeWidth={2} aria-hidden={true} />, action: () => onTrash(folderId), danger: true },
    ],
  })

  return actions
}

export function buildMultiSelectActions({
  ids,
  onDuplicate,
  onShare,
  onArchive,
  onTrash,
}: {
  ids: Set<string>
  onDuplicate: (ids: Set<string>) => void
  onShare?: (ids: Set<string>) => void
  onArchive: (ids: Set<string>) => void
  onTrash: (ids: Set<string>) => void
}): ContextMenuAction[] {
  const actions: ContextMenuAction[] = [
    { label: `Duplicate ${ids.size} items`, icon: <BookCopy size={14} strokeWidth={2} aria-hidden={true} />, action: () => onDuplicate(ids) },
  ]

  if (onShare) {
    actions.push({ label: `Share ${ids.size} items`, icon: <UserRoundPlus size={14} strokeWidth={2} aria-hidden={true} />, action: () => onShare(ids) })
  }

  actions.push(
    { label: `Archive ${ids.size} items`, icon: <Archive size={14} strokeWidth={2} aria-hidden={true} />, action: () => onArchive(ids) },
    { label: `Trash ${ids.size} items`, icon: <Trash2 size={14} strokeWidth={2} aria-hidden={true} />, action: () => onTrash(ids), danger: true },
  )

  return actions
}

export function buildCreateProjectActions(
  onCreate: (kind: ProjectKind) => void,
): ContextMenuAction[] {
  return [
    {
      label: "Create Book",
      icon: <BookText size={14} strokeWidth={2} aria-hidden={true} />,
      action: () => onCreate("Book"),
    },
    {
      label: "Create Presentation",
      icon: <Presentation size={14} strokeWidth={2} aria-hidden={true} />,
      action: () => onCreate("Presentation"),
    },
    {
      label: "Create Markdown",
      icon: <FileCode size={14} strokeWidth={2} aria-hidden={true} />,
      action: () => onCreate("Markdown"),
    },
    {
      label: "Create Plain Text",
      icon: <FileType size={14} strokeWidth={2} aria-hidden={true} />,
      action: () => onCreate("PlainText"),
    },
  ]
}
