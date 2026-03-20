import { appMenu, type MenuItem } from "../../../core/menu"
import {
  BookText,
  Bold,
  CheckCheck,
  Copy,
  Folder,
  Italic,
  NotebookText,
  Redo2,
  Scissors,
  Trash2,
  Underline,
  Undo2,
  Clipboard,
} from "lucide-react"
import { useMenuState } from "../../../core/useMenuState"
import "./WebMenu.css"

const menuIcons: Record<string, React.ComponentType<{ size?: number; strokeWidth?: number; "aria-hidden"?: boolean }>> = {
  folder: Folder,
  book: BookText,
  notebook: NotebookText,
  undo: Undo2,
  redo: Redo2,
  "select-all": CheckCheck,
  copy: Copy,
  paste: Clipboard,
  cut: Scissors,
  delete: Trash2,
  bold: Bold,
  italic: Italic,
  underline: Underline,
}

type MenuListProps = {
  items: MenuItem[]
  parentPath?: number[]
  isRoot?: boolean
  depth?: number
  isMenuOpen: (path: number[]) => boolean
  openMenuPath: (path: number[]) => void
  closeAllMenus: () => void
}

function MenuList({
  items,
  parentPath = [],
  isRoot = false,
  depth = 0,
  isMenuOpen,
  openMenuPath,
  closeAllMenus,
}: MenuListProps) {
  return (
    <ul className={isRoot ? "web-menu__list" : "web-menu__dropdown"}>
      {items.map((item, index) => {
        const itemPath = [...parentPath, index]
        const hasSubmenu = Boolean(item.submenu?.length)
        const isDisabled = Boolean(item.disabled)
        const submenuOpen = hasSubmenu ? isMenuOpen(itemPath) : false
        const Icon = item.icon ? menuIcons[item.icon] : null
        const showSubmenuCaret = hasSubmenu && !isDisabled && depth > 0
        const showTrailing = Boolean(item.shortcut) || showSubmenuCaret

        return (
          <li
            key={`${itemPath.join("-")}-${item.label}`}
            className="web-menu__item"
            onMouseEnter={() => {
              if (hasSubmenu && !isDisabled) {
                openMenuPath(itemPath)
              }
            }}
          >
            <button
              type="button"
              className={`web-menu__button ${submenuOpen ? "web-menu__button--open" : ""} ${isDisabled ? "web-menu__button--disabled" : ""}`.trim()}
              disabled={isDisabled}
              onClick={() => {
                if (isDisabled) {
                  return
                }

                if (hasSubmenu) {
                  openMenuPath(itemPath)
                  return
                }

                item.action?.()
                closeAllMenus()
              }}
            >
              <span className="web-menu__button-content">
                <span className="web-menu__button-label">
                  {Icon ? <Icon size={14} strokeWidth={2} aria-hidden={true} /> : null}
                  <span>{item.label}</span>
                </span>
                {showTrailing ? (
                  <span className="web-menu__button-trailing">
                    {item.shortcut ? <span className="web-menu__shortcut">{item.shortcut}</span> : null}
                    {showSubmenuCaret ? <span className="web-menu__submenu-caret">›</span> : null}
                  </span>
                ) : null}
              </span>
            </button>

            {hasSubmenu && !isDisabled ? (
              <div
                className={`web-menu__submenu ${depth === 0 ? "web-menu__submenu--below" : "web-menu__submenu--side"} ${submenuOpen ? "web-menu__submenu--open" : ""}`.trim()}
              >
                <MenuList
                  items={item.submenu!}
                  parentPath={itemPath}
                  depth={depth + 1}
                  isMenuOpen={isMenuOpen}
                  openMenuPath={openMenuPath}
                  closeAllMenus={closeAllMenus}
                />
              </div>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

type WebMenuProps = {
  items?: MenuItem[]
}

export default function WebMenu({ items = appMenu }: WebMenuProps) {
  const { isMenuOpen, openMenuPath, closeAllMenus, cancelCloseTimer, scheduleCloseAll } = useMenuState()

  return (
    <nav
      className="web-menu"
      aria-label="Application menu"
      onMouseEnter={cancelCloseTimer}
      onMouseLeave={scheduleCloseAll}
    >
      <MenuList
        items={items}
        isRoot
        isMenuOpen={isMenuOpen}
        openMenuPath={openMenuPath}
        closeAllMenus={closeAllMenus}
      />
    </nav>
  )
}
