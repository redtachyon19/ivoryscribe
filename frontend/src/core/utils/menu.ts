import {
  requestAppProjectSearch,
  requestAppSaveProject,
  requestAppSaveProjectVersion,
  requestAppSpellCheck,
  requestExportProject,
  requestEditorCommand,
  requestMarkdownEditorCommand,
  requestCreateBookProject,
  requestCreateProjectFolder,
  requestAppColorPaletteChange,
  requestEditorFontFamilyChange,
  requestEditorFontSizeChange,
} from "../events/editorEvents"
import { FONT_OPTIONS, PALETTE_OPTIONS } from "./appearance"

export type MenuItem = {
  label: string
  action?: () => void
  submenu?: MenuItem[]
  disabled?: boolean
  shortcut?: string
  icon?: string
  electronRole?: "paste" | "pasteAndMatchStyle" | "copy" | "cut" | "undo" | "redo" | "selectAll"
}

const editMenuItem: MenuItem = {
  label: "Edit",
  submenu: [
    {
      label: "Undo",
      icon: "undo",
      shortcut: "⌘Z",
      action: () => {
        requestEditorCommand("undo")
      },
    },
    {
      label: "Redo",
      icon: "redo",
      shortcut: "⇧⌘Z",
      action: () => {
        requestEditorCommand("redo")
      },
    },
    {
      label: "Find and Replace",
      shortcut: "⌘F",
      action: () => {
        requestAppProjectSearch()
      },
    },
    {
      label: "Select All",
      icon: "select-all",
      shortcut: "⌘A",
      action: () => {
        requestEditorCommand("select-all")
      },
    },
    {
      label: "Copy",
      icon: "copy",
      shortcut: "⌘C",
      action: () => {
        requestEditorCommand("copy")
      },
    },
    {
      label: "Paste",
      icon: "paste",
      shortcut: "⌘V",
      electronRole: "paste",
      action: () => {
        requestEditorCommand("paste")
      },
    },
    {
      label: "Paste Without Formatting",
      icon: "paste",
      shortcut: "⇧⌘V",
      electronRole: "pasteAndMatchStyle",
      action: () => {
        requestEditorCommand("paste-plain")
      },
    },
    {
      label: "Cut",
      icon: "cut",
      shortcut: "⌘X",
      action: () => {
        requestEditorCommand("cut")
      },
    },
    {
      label: "Delete",
      icon: "delete",
      action: () => {
        requestEditorCommand("delete")
      },
    },
    {
      label: "Bold",
      icon: "bold",
      shortcut: "⌘B",
      action: () => {
        requestEditorCommand("bold")
      },
    },
    {
      label: "Italics",
      icon: "italic",
      shortcut: "⌘I",
      action: () => {
        requestEditorCommand("italic")
      },
    },
    {
      label: "Underline",
      icon: "underline",
      shortcut: "⌘U",
      action: () => {
        requestEditorCommand("underline")
      },
    },
    {
      label: "Spell Check",
      shortcut: "⌥⌘X",
      action: () => {
        requestAppSpellCheck()
      },
    },
  ],
}

const viewMenuItem: MenuItem = {
  label: "View",
  submenu: [
    {
      label: "Change Font",
      submenu: FONT_OPTIONS.map((option) => ({
        label: option.label,
        action: () => {
          requestEditorFontFamilyChange(option.value)
        },
      })),
    },
    {
      label: "Increase Font Size",
      action: () => {
        requestEditorFontSizeChange(2)
      },
    },
    {
      label: "Decrease Font Size",
      action: () => {
        requestEditorFontSizeChange(-2)
      },
    },
    {
      label: "Change Color Palette",
      submenu: PALETTE_OPTIONS.map((option) => ({
        label: option.label,
        action: () => {
          requestAppColorPaletteChange(option.value)
        },
      })),
    },
  ],
}

const windowMenuItem: MenuItem = {
  label: "Window",
  submenu: [
    {
      label: "Reload Window",
      shortcut: "⌘R",
      action: () => {
        if (typeof window !== "undefined") {
          window.location.reload()
        }
      },
    },
    {
      label: "Toggle Full Screen",
      shortcut: "⌃⌘F",
      action: () => {
        if (typeof document === "undefined") {
          return
        }

        if (document.fullscreenElement) {
          void document.exitFullscreen()
          return
        }

        void document.documentElement.requestFullscreen()
      },
    },
  ],
}

const helpMenuItem: MenuItem = {
  label: "Help",
  submenu: [
    {
      label: "Keyboard Shortcuts",
      action: () => {
        if (typeof window === "undefined") {
          return
        }

        window.alert(
          [
            "Keyboard Shortcuts",
            "",
            "Undo: ⌘Z",
            "Redo: ⇧⌘Z",
            "Bold: ⌘B",
            "Italic: ⌘I",
            "Underline: ⌘U",
            "Find and Replace: ⌘F",
            "Spell Check: ⌥⌘X",
            "Select All: ⌘A",
            "Copy: ⌘C",
            "Paste: ⌘V",
            "Cut: ⌘X",
          ].join("\n"),
        )
      },
    },
    {
      label: "About Ivoryscribe",
      action: () => {
        if (typeof window === "undefined") {
          return
        }

        window.alert("Ivoryscribe\nWrite an epic. Save a species.")
      },
    },
  ],
}

const markdownMenuItem: MenuItem = {
  label: "Markdown",
  submenu: [
    {
      label: "Heading 1",
      shortcut: "⌘⌥1",
      action: () => {
        requestMarkdownEditorCommand("heading-1")
      },
    },
    {
      label: "Heading 2",
      shortcut: "⌘⌥2",
      action: () => {
        requestMarkdownEditorCommand("heading-2")
      },
    },
    {
      label: "Bold",
      shortcut: "⌘B",
      action: () => {
        requestMarkdownEditorCommand("bold")
      },
    },
    {
      label: "Italics",
      shortcut: "⌘I",
      action: () => {
        requestMarkdownEditorCommand("italic")
      },
    },
    {
      label: "Inline Code",
      shortcut: "⌘E",
      action: () => {
        requestMarkdownEditorCommand("inline-code")
      },
    },
    {
      label: "Code Block",
      shortcut: "⌘⌥C",
      action: () => {
        requestMarkdownEditorCommand("code-block")
      },
    },
    {
      label: "Link",
      shortcut: "⌘K",
      action: () => {
        requestMarkdownEditorCommand("link")
      },
    },
  ],
}

export const projectWorkspaceMenu: MenuItem[] = [
  {
    label: "File",
    submenu: [
      {
        label: "New Folder",
        icon: "folder",
        action: () => {
          requestCreateProjectFolder()
        },
      },
      {
        label: "New Project",
        submenu: [
          {
            label: "Book",
            icon: "book",
            action: () => {
              requestCreateBookProject("Book")
            },
          },
          {
            label: "Presentation",
            action: () => {
              requestCreateBookProject("Presentation")
            },
          },
          {
            label: "Markdown",
            action: () => {
              requestCreateBookProject("Markdown")
            },
          },
          {
            label: "Plain Text",
            action: () => {
              requestCreateBookProject("PlainText")
            },
          },
        ],
      },
    ],
  },
  {
    label: "Edit",
    disabled: true,
  },
  {
    label: "View",
    submenu: [
      viewMenuItem.submenu?.find((item) => item.label === "Change Font")!,
      viewMenuItem.submenu?.find((item) => item.label === "Change Color Palette")!,
    ],
  },
  {
    label: "Settings",
    disabled: true,
  },
  windowMenuItem,
  helpMenuItem,
]

export function getAppMenu(options?: { markdownDocumentActive?: boolean }): MenuItem[] {
  const markdownDocumentActive = Boolean(options?.markdownDocumentActive)

  const menu: MenuItem[] = [
    {
      label: "File",
      submenu: [
        {
          label: "New Document",
          action: () => {
            console.log("New Document")
          },
        },
        {
          label: "Save",
          shortcut: "⌘S",
          action: () => {
            requestAppSaveProject()
          },
        },
        {
          label: "Save Version",
          shortcut: "⇧⌘S",
          action: () => {
            requestAppSaveProjectVersion()
          },
        },
        {
          label: "Export To",
          submenu: [
            {
              label: "PDF (.pdf)",
              action: () => {
                requestExportProject("pdf")
              },
            },
            {
              label: "Word (.docx)",
              action: () => {
                requestExportProject("docx")
              },
            },
            {
              label: "Markdown (.md)",
              action: () => {
                requestExportProject("md")
              },
            },
            {
              label: "Text (.txt)",
              action: () => {
                requestExportProject("txt")
              },
            },
          ],
        },
      ],
    },
    editMenuItem,
    viewMenuItem,
    {
      label: "Settings",
      action: () => {
        console.log("Settings")
      },
    },
    windowMenuItem,
    helpMenuItem,
  ]

  if (markdownDocumentActive) {
    menu.splice(3, 0, markdownMenuItem)
  }

  return menu
}

export const appMenu: MenuItem[] = getAppMenu()

export type NativeMenuItem = {
  label: string
  id?: string
  submenu?: NativeMenuItem[]
  disabled?: boolean
  shortcut?: string
  role?: string
}

export function serializeMenuForElectron(
  items: MenuItem[],
  parentPath = "menu",
): { nativeItems: NativeMenuItem[]; commandMap: Record<string, () => void> } {
  const commandMap: Record<string, () => void> = {}

  function walk(menuItems: MenuItem[], prefix: string): NativeMenuItem[] {
    return menuItems.map((item, index) => {
      const id = `${prefix}/${index}-${item.label.replace(/\s+/g, "-").toLowerCase()}`

      if (item.submenu?.length) {
        const nested = walk(item.submenu, id)
        return {
          label: item.label,
          disabled: item.disabled,
          submenu: nested,
        }
      }

      if (item.action) {
        commandMap[id] = item.action
      }

      return {
        label: item.label,
        id: item.action ? id : undefined,
        disabled: item.disabled,
        shortcut: item.shortcut,
        role: item.electronRole,
      }
    })
  }

  const nativeItems = walk(items, parentPath)
  return { nativeItems, commandMap }
}
