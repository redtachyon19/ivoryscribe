import {
  requestEditorCommand,
  requestCreateBlogProject,
  requestCreateBookProject,
  requestCreateProjectFolder,
  requestEditorFontFamilyChange,
  requestEditorFontSizeChange,
  requestExportAllTabsPdf,
} from "./editorEvents"

export type MenuItem = {
  label: string
  action?: () => void
  submenu?: MenuItem[]
  disabled?: boolean
  shortcut?: string
  icon?: string
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
      action: () => {
        requestEditorCommand("paste")
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
  ],
}

const viewMenuItem: MenuItem = {
  label: "View",
  submenu: [
    {
      label: "Change Font",
      submenu: [
        {
          label: "Times (Default)",
          action: () => {
            requestEditorFontFamilyChange('"Times", "Times New Roman", serif')
          },
        },
        {
          label: "Times New Roman",
          action: () => {
            requestEditorFontFamilyChange('"Times New Roman", serif')
          },
        },
        {
          label: "Roboto Mono",
          action: () => {
            requestEditorFontFamilyChange('"Roboto Mono", monospace')
          },
        },
        {
          label: "Arial",
          action: () => {
            requestEditorFontFamilyChange("Arial, sans-serif")
          },
        },
        {
          label: "Calibri",
          action: () => {
            requestEditorFontFamilyChange("Calibri, sans-serif")
          },
        },
        {
          label: "Courier",
          action: () => {
            requestEditorFontFamilyChange('"Courier New", Courier, monospace')
          },
        },
        {
          label: "EB Garamond",
          action: () => {
            requestEditorFontFamilyChange('"EB Garamond", serif')
          },
        },
        {
          label: "Montserrat",
          action: () => {
            requestEditorFontFamilyChange('"Montserrat", sans-serif')
          },
        },
        {
          label: "Custom Uploaded Font",
          action: () => {
            console.log("Custom Uploaded Font")
          },
        },
      ],
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
      submenu: [
        {
          label: "Ivory Tusk (Default)",
          action: () => {
            console.log("Ivory Tusk (Default)")
          },
        },
        {
          label: "Elephant (Dark Mode)",
          action: () => {
            console.log("Elephant (Dark Mode)")
          },
        },
        {
          label: "Moon & Midnight",
          action: () => {
            console.log("Moon & Midnight")
          },
        },
        {
          label: "Sunset Savannah",
          action: () => {
            console.log("Sunset Savannah")
          },
        },
        {
          label: "Woodland Forrest",
          action: () => {
            console.log("Woodland Forrest")
          },
        },
        {
          label: "Glaciers & Waterfalls",
          action: () => {
            console.log("Glaciers & Waterfalls")
          },
        },
        {
          label: "(Custom)",
          action: () => {
            console.log("(Custom)")
          },
        },
      ],
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
              requestCreateBookProject()
            },
          },
          {
            label: "Blog",
            icon: "notebook",
            action: () => {
              requestCreateBlogProject()
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
]

export const appMenu: MenuItem[] = [
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
        action: () => {
          console.log("Save")
        },
      },
      {
        label: "Export as PDF",
        action: () => {
          requestExportAllTabsPdf()
        },
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
]
