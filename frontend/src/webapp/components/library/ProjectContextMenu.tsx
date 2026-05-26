import { useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import { Archive, BookCopy, BookText, Cloud, ClipboardCopy, FileCode, FileType, FolderOpen, Pencil, Presentation, Settings2, SquareArrowOutUpRight, SquarePlus, Trash2, UserRoundPlus } from "lucide-react"
import type { ProjectKind } from "../../../core/utils/projects"
import { openInNewItemLabel } from "../../../core/electron/localWorkspace"

export type ContextMenuAction = {
  label: string
  icon: React.ReactNode
  action: () => void
  danger?: boolean
}

type ProjectContextMenuProps = {
  x: number
  y: number
  actions: ContextMenuAction[]
  onClose: () => void
}

export default function ProjectContextMenu({ x, y, actions, onClose }: ProjectContextMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null)

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
      {actions.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          className={`project-context-menu__item ${item.danger ? "project-context-menu__item--danger" : ""}`.trim()}
          onClick={() => {
            item.action()
            onClose()
          }}
        >
          {item.icon}
          <span>{item.label}</span>
        </button>
      ))}
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
  onOpenInNewTab: (id: string) => void
  onRename: (id: string) => void
  onOpenSettings?: (id: string) => void
  onDuplicate?: (id: string) => void
  onShare?: (id: string) => void
  /** Only passed for local projects. Promotes the project to cloud
   *  (upload + trash the local file) so it can be shared / synced. */
  onMoveToCloud?: (id: string) => void
  /** Only passed for local projects in Electron — copies the absolute
   *  on-disk path to the clipboard. */
  onCopyPath?: (id: string) => void
  /** Only passed for local projects in Electron — reveals the file in
   *  the OS file manager (Finder/Explorer). */
  onShowInFinder?: (id: string) => void
  onArchive: (id: string) => void
  onTrash: (id: string) => void
}): ContextMenuAction[] {
  const actions: ContextMenuAction[] = [
    { label: openInNewItemLabel(), icon: <SquareArrowOutUpRight size={14} strokeWidth={2} aria-hidden={true} />, action: () => onOpenInNewTab(projectId) },
    { label: "Rename", icon: <Pencil size={14} strokeWidth={2} aria-hidden={true} />, action: () => onRename(projectId) },
  ]

  if (onOpenSettings) {
    actions.push({ label: "Open Project Settings", icon: <Settings2 size={14} strokeWidth={2} aria-hidden={true} />, action: () => onOpenSettings(projectId) })
  }

  if (onDuplicate) {
    actions.push({ label: "Duplicate", icon: <BookCopy size={14} strokeWidth={2} aria-hidden={true} />, action: () => onDuplicate(projectId) })
  }

  if (onCopyPath) {
    actions.push({ label: "Copy as Path", icon: <ClipboardCopy size={14} strokeWidth={2} aria-hidden={true} />, action: () => onCopyPath(projectId) })
  }

  if (onShowInFinder) {
    actions.push({ label: showInFileManagerLabel(), icon: <FolderOpen size={14} strokeWidth={2} aria-hidden={true} />, action: () => onShowInFinder(projectId) })
  }

  if (onMoveToCloud) {
    actions.push({ label: "Move to Cloud", icon: <Cloud size={14} strokeWidth={2} aria-hidden={true} />, action: () => onMoveToCloud(projectId) })
  }

  if (onShare) {
    actions.push({ label: "Share", icon: <UserRoundPlus size={14} strokeWidth={2} aria-hidden={true} />, action: () => onShare(projectId) })
  }

  actions.push(
    { label: "Archive", icon: <Archive size={14} strokeWidth={2} aria-hidden={true} />, action: () => onArchive(projectId) },
    { label: "Trash", icon: <Trash2 size={14} strokeWidth={2} aria-hidden={true} />, action: () => onTrash(projectId), danger: true },
  )

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
  /** Optional — only passed in by the local-FS orchestration. Cloud-only
   *  folders have no on-disk directory, so the action is hidden when
   *  this is undefined. */
  onOpenInNewWindow?: (id: string) => void
  onRename: (id: string) => void
  /** Open the per-folder settings modal (color / icon emoji). */
  onOpenSettings?: (id: string) => void
  onShare?: (id: string) => void
  onArchive: (id: string) => void
  onTrash: (id: string) => void
}): ContextMenuAction[] {
  const actions: ContextMenuAction[] = []

  if (onOpenInNewWindow) {
    actions.push({
      label: "Open in New Window",
      icon: <SquarePlus size={14} strokeWidth={2} aria-hidden={true} />,
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

  actions.push(
    { label: "Archive", icon: <Archive size={14} strokeWidth={2} aria-hidden={true} />, action: () => onArchive(folderId) },
    { label: "Trash", icon: <Trash2 size={14} strokeWidth={2} aria-hidden={true} />, action: () => onTrash(folderId), danger: true },
  )

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

/** Shared 4-kind create menu used by every "Create Project" entry point —
 *  NavigationPanel, Library create-card, Library and ProjectBrowserPanel
 *  context menus, FolderDetailView. Keeps the kind list (and its order +
 *  icons) consistent everywhere; adding a new ProjectKind just means
 *  extending this one builder. */
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
