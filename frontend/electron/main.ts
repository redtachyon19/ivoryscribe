import { app, BrowserWindow, ipcMain, Menu, shell } from "electron"
import type { MenuItemConstructorOptions } from "electron"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.DIST = path.join(__dirname, "../dist")
process.env.VITE_PUBLIC = app.isPackaged
  ? process.env.DIST
  : path.join(__dirname, "../public")

let mainWindow: BrowserWindow | null = null

const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

const isMac = process.platform === "darwin"

// ── Native menu helpers ──

type RendererMenuItem = {
  label: string
  id?: string
  submenu?: RendererMenuItem[]
  disabled?: boolean
  shortcut?: string
}

/** Map web-style shortcut glyphs to Electron accelerator strings */
function toAccelerator(shortcut: string): string | undefined {
  if (!shortcut) return undefined
  return shortcut
    .replace(/⌘/g, "CmdOrCtrl+")
    .replace(/⇧/g, "Shift+")
    .replace(/⌥/g, "Alt+")
    .replace(/⌃/g, "Ctrl+")
    .replace(/\+$/g, "")
}

function buildNativeMenu(items: RendererMenuItem[], sendCommand: (id: string) => void): MenuItemConstructorOptions[] {
  return items.map((item) => {
    if (item.submenu?.length) {
      return {
        label: item.label,
        enabled: !item.disabled,
        submenu: buildNativeMenu(item.submenu, sendCommand),
      }
    }

    return {
      label: item.label,
      enabled: !item.disabled,
      accelerator: item.shortcut ? toAccelerator(item.shortcut) : undefined,
      click: () => {
        if (item.id) sendCommand(item.id)
      },
    }
  })
}

function applyNativeMenu(rendererItems: RendererMenuItem[]) {
  const sendCommand = (id: string) => {
    mainWindow?.webContents.send("menu:command", id)
  }

  const appMenuItems = buildNativeMenu(rendererItems, sendCommand)

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [{
          label: app.name,
          submenu: [
            { role: "about" as const },
            { type: "separator" as const },
            { role: "services" as const },
            { type: "separator" as const },
            { role: "hide" as const },
            { role: "hideOthers" as const },
            { role: "unhide" as const },
            { type: "separator" as const },
            { role: "quit" as const },
          ],
        }]
      : []),
    ...appMenuItems,
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// ── Window creation ──

function createWindow() {

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: isMac ? "hiddenInset" : "hidden",
    trafficLightPosition: isMac ? { x: 16, y: 14 } : undefined,
    frame: isMac,
    transparent: isMac,
    vibrancy: isMac ? "sidebar" : undefined,
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // Open external links in the default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: "deny" }
  })

  if (VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(VITE_DEV_SERVER_URL)
  } else {
    void mainWindow.loadFile(path.join(process.env.DIST!, "index.html"))
  }
}

// Window control IPC handlers
ipcMain.on("window:minimize", () => {
  mainWindow?.minimize()
})

ipcMain.on("window:maximize", () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize()
  } else {
    mainWindow?.maximize()
  }
})

ipcMain.on("window:close", () => {
  mainWindow?.close()
})

ipcMain.handle("window:isMaximized", () => {
  return mainWindow?.isMaximized() ?? false
})

ipcMain.handle("window:isFullScreen", () => {
  return mainWindow?.isFullScreen() ?? false
})

ipcMain.handle("spellcheck:add-word", (_event, word: unknown) => {
  if (typeof word !== "string") {
    return false
  }

  const normalizedWord = word.trim().toLowerCase()
  if (!normalizedWord) {
    return false
  }

  try {
    return mainWindow?.webContents.session.addWordToSpellCheckerDictionary(normalizedWord) ?? false
  } catch {
    return false
  }
})

ipcMain.handle("spellcheck:remove-word", (_event, word: unknown) => {
  if (typeof word !== "string") {
    return false
  }

  const normalizedWord = word.trim().toLowerCase()
  if (!normalizedWord) {
    return false
  }

  const session = mainWindow?.webContents.session
  if (!session) {
    return false
  }

  if (typeof session.removeWordFromSpellCheckerDictionary !== "function") {
    return false
  }

  try {
    return session.removeWordFromSpellCheckerDictionary(normalizedWord)
  } catch {
    return false
  }
})

// Menu update from renderer
ipcMain.on("menu:update", (_event, items: RendererMenuItem[]) => {
  applyNativeMenu(items)
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit()
    mainWindow = null
  }
})

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

void app.whenReady().then(() => {
  createWindow()
  // Set a minimal default menu; the renderer will send the full menu once loaded
  applyNativeMenu([])
})
