import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, shell } from "electron"
import type { MenuItemConstructorOptions } from "electron"
import { promises as fsp } from "node:fs"
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

// ── File-association open queue ───────────────────────────────
// Paths handed to us by the OS (Finder double-click on macOS, command-line
// args on Win/Linux, `second-instance` events) before the renderer is ready
// must be buffered. We flush them once the window finishes loading. After
// that we just send live.
const OPEN_PATH_CHANNEL = "app:open-path"
// Must stay in sync with kindForExtension in core/localFiles/types.ts. Any
// extension we let through here gets handed to openExternalFile, which uses
// kindForExtension to dispatch to the right codec.
const SUPPORTED_OPEN_EXTENSIONS = new Set([".tusk", ".tusks", ".md", ".txt"])
const pendingOpenPaths: string[] = []
let isRendererReady = false

function hasSupportedExtension(filePath: string): boolean {
  return SUPPORTED_OPEN_EXTENSIONS.has(path.extname(filePath).toLowerCase())
}

function enqueueOpenPath(filePath: string) {
  if (!filePath || !hasSupportedExtension(filePath)) return
  if (isRendererReady && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(OPEN_PATH_CHANNEL, filePath)
    // Bring the window to the front so a Finder double-click on an already-
    // running app doesn't silently load behind whatever the user was doing.
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  } else {
    pendingOpenPaths.push(filePath)
  }
}

function flushPendingOpenPaths() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  for (const p of pendingOpenPaths) mainWindow.webContents.send(OPEN_PATH_CHANNEL, p)
  pendingOpenPaths.length = 0
}

// Pull supported file paths out of an argv array. Skips electron-runtime
// flags and the executable path itself. Used for Windows/Linux startup and
// the `second-instance` event payload.
function collectPathsFromArgv(argv: string[]): string[] {
  return argv.slice(1).filter((arg) => !arg.startsWith("-") && hasSupportedExtension(arg))
}

// ── Helpers shared by main + child windows ──

function makeBrowserWindowOptions(): Electron.BrowserWindowConstructorOptions {
  const preloadPath = path.join(__dirname, "preload.cjs")
  return {
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
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  }
}

// "Open in new window" URLs come from window.open() in the renderer. We want
// to spawn a real Electron BrowserWindow for our own app URLs (dev server +
// blob previews) and shell out to the system browser for everything else.
function isInternalUrl(url: string): boolean {
  if (url.startsWith("blob:") || url.startsWith("file:") || url.startsWith("about:")) {
    return true
  }
  try {
    const parsed = new URL(url)
    if (VITE_DEV_SERVER_URL) {
      const dev = new URL(VITE_DEV_SERVER_URL)
      if (parsed.origin === dev.origin) return true
    }
  } catch {
    // Malformed URL — treat as external.
  }
  return false
}

function configureWebContents(webContents: Electron.WebContents) {
  webContents.setWindowOpenHandler(({ url }) => {
    if (isInternalUrl(url)) {
      return {
        action: "allow",
        overrideBrowserWindowOptions: makeBrowserWindowOptions(),
      }
    }
    void shell.openExternal(url)
    return { action: "deny" }
  })
}

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
  // Route menu commands to whichever window is focused (fall back to main).
  const sendCommand = (id: string) => {
    const target = BrowserWindow.getFocusedWindow() ?? mainWindow
    target?.webContents.send("menu:command", id)
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
  mainWindow = new BrowserWindow(makeBrowserWindowOptions())

  mainWindow.webContents.on("preload-error", (_event, preload, error) => {
    console.error("[ivoryscribe] PRELOAD ERROR:", preload, error)
  })

  // Mark the renderer ready *after* the first paint and flush any paths the
  // OS handed us during startup (e.g. a Finder double-click that launched
  // the app cold).
  mainWindow.webContents.once("did-finish-load", () => {
    isRendererReady = true
    flushPendingOpenPaths()
  })

  // If the window is closed and recreated (macOS dock activate path), reset
  // the readiness flag so we re-buffer until the next did-finish-load.
  mainWindow.on("closed", () => {
    isRendererReady = false
    mainWindow = null
  })

  if (VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(VITE_DEV_SERVER_URL)
  } else {
    void mainWindow.loadFile(path.join(process.env.DIST!, "index.html"))
  }
}

// Window control IPC handlers. We resolve the target from `event.sender` so
// that secondary windows (spawned via window.open) control themselves rather
// than the main window.
ipcMain.on("window:minimize", (event) => {
  BrowserWindow.fromWebContents(event.sender)?.minimize()
})

ipcMain.on("window:maximize", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return
  if (win.isMaximized()) {
    win.unmaximize()
  } else {
    win.maximize()
  }
})

ipcMain.on("window:close", (event) => {
  BrowserWindow.fromWebContents(event.sender)?.close()
})

ipcMain.handle("window:isMaximized", (event) => {
  return BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false
})

ipcMain.handle("window:isFullScreen", (event) => {
  return BrowserWindow.fromWebContents(event.sender)?.isFullScreen() ?? false
})

ipcMain.handle("spellcheck:add-word", (event, word: unknown) => {
  if (typeof word !== "string") {
    return false
  }

  const normalizedWord = word.trim().toLowerCase()
  if (!normalizedWord) {
    return false
  }

  try {
    return event.sender.session.addWordToSpellCheckerDictionary(normalizedWord)
  } catch {
    return false
  }
})

ipcMain.handle("spellcheck:remove-word", (event, word: unknown) => {
  if (typeof word !== "string") {
    return false
  }

  const normalizedWord = word.trim().toLowerCase()
  if (!normalizedWord) {
    return false
  }

  const session = event.sender.session

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

// ── Filesystem IPC ──
// Local-file project storage lives entirely under a user-chosen root folder.
// Every operation takes absolute paths produced by path.join via preload.

ipcMain.handle("dialog:selectDirectory", async (event, opts: { defaultPath?: string; title?: string } = {}) => {
  const parent = BrowserWindow.fromWebContents(event.sender) ?? mainWindow
  if (!parent) return null
  const result = await dialog.showOpenDialog(parent, {
    title: opts.title ?? "Select folder",
    defaultPath: opts.defaultPath,
    properties: ["openDirectory", "createDirectory"],
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
})

// Resolve (and create if missing) the per-platform default workspace folder
// at ~/Documents/Ivoryscribe. Called on first launch so the user doesn't have
// to deal with a picker just to get going.
ipcMain.handle("fs:getDefaultRoot", async () => {
  const docs = app.getPath("documents")
  const root = path.join(docs, "Ivoryscribe")
  await fsp.mkdir(root, { recursive: true })
  return root
})

ipcMain.handle("fs:readFile", async (_event, filePath: string) => {
  return await fsp.readFile(filePath, "utf8")
})

// Binary read for files where utf-8 would corrupt the bytes (PDFs, images,
// etc.). Returns a Buffer; Electron IPC structured-clones it into a
// Uint8Array on the renderer side. Keep this separate from `fs:readFile` so
// existing utf-8 call sites don't accidentally get a Buffer back.
ipcMain.handle("fs:readFileBinary", async (_event, filePath: string) => {
  return await fsp.readFile(filePath)
})

ipcMain.handle("fs:writeFile", async (_event, filePath: string, contents: string) => {
  await fsp.mkdir(path.dirname(filePath), { recursive: true })
  // Atomic write: tmp + rename so a crash mid-save can't truncate the file.
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`
  await fsp.writeFile(tmp, contents, "utf8")
  await fsp.rename(tmp, filePath)
})

type FsEntry = {
  name: string
  path: string
  kind: "file" | "directory"
  size: number
  modifiedAt: number
}

ipcMain.handle("fs:listDirectory", async (_event, dirPath: string): Promise<FsEntry[]> => {
  const entries = await fsp.readdir(dirPath, { withFileTypes: true })
  const out: FsEntry[] = []
  for (const ent of entries) {
    if (ent.name.startsWith(".")) continue
    const full = path.join(dirPath, ent.name)
    try {
      const stat = await fsp.stat(full)
      out.push({
        name: ent.name,
        path: full,
        kind: ent.isDirectory() ? "directory" : "file",
        size: stat.size,
        modifiedAt: stat.mtimeMs,
      })
    } catch {
      // Symlink target missing or permission error — skip.
    }
  }
  return out
})

ipcMain.handle("fs:mkdir", async (_event, dirPath: string) => {
  await fsp.mkdir(dirPath, { recursive: true })
})

ipcMain.handle("fs:rename", async (_event, oldPath: string, newPath: string) => {
  await fsp.rename(oldPath, newPath)
})

ipcMain.handle("fs:trash", async (_event, targetPath: string) => {
  await shell.trashItem(targetPath)
})

// Reveal a file or directory in the OS file manager (Finder/Explorer/Files).
ipcMain.on("fs:showItemInFolder", (_event, targetPath: string) => {
  shell.showItemInFolder(targetPath)
})

// Read plain text from the system clipboard via Electron's main-process
// clipboard module. The renderer's `navigator.clipboard.readText()` can be
// blocked by missing user-activation in callback contexts (e.g. when a
// menu accelerator fires), so we expose a guaranteed-to-work path here.
ipcMain.handle("clipboard:readText", () => {
  return clipboard.readText()
})



ipcMain.handle("fs:exists", async (_event, targetPath: string) => {
  try {
    await fsp.access(targetPath)
    return true
  } catch {
    return false
  }
})

ipcMain.handle("fs:stat", async (_event, targetPath: string) => {
  const s = await fsp.stat(targetPath)
  return {
    size: s.size,
    modifiedAt: s.mtimeMs,
    isDirectory: s.isDirectory(),
    isFile: s.isFile(),
  }
})

// Install the window-open handler on every webContents (main window + any
// child windows opened via window.open). Without this, secondary windows
// wouldn't be able to spawn further windows themselves.
app.on("web-contents-created", (_event, webContents) => {
  configureWebContents(webContents)
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

// ── File-association lifecycle ────────────────────────────────
// Single-instance lock: a Finder double-click on a second .tusk file must
// route to the running app (via `second-instance`) instead of spawning a
// duplicate that would race the filesystem watcher and clobber state.
const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on("second-instance", (_event, argv) => {
    // Foreground the existing window, then queue any file paths the new
    // invocation was started with.
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
    for (const p of collectPathsFromArgv(argv)) enqueueOpenPath(p)
  })

  // macOS: Finder double-clicks dispatch `open-file` to the running app
  // (warm start) OR to the launching app before `ready` (cold start). Both
  // funnel through enqueueOpenPath, which buffers until the renderer is up.
  app.on("open-file", (event, filePath) => {
    event.preventDefault()
    enqueueOpenPath(filePath)
  })

  // Cold-start argv on Windows/Linux (macOS uses open-file for this).
  if (!isMac) {
    for (const p of collectPathsFromArgv(process.argv)) enqueueOpenPath(p)
  }

  void app.whenReady().then(() => {
    createWindow()
    // Set a minimal default menu; the renderer will send the full menu once loaded
    applyNativeMenu([])
  })
}
