import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, shell } from "electron"
import type { MenuItemConstructorOptions } from "electron"
import { execFile } from "node:child_process"
import { promises as fsp } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { initAutoUpdater, checkForUpdates } from "./updater"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.DIST = path.join(__dirname, "../dist")
process.env.VITE_PUBLIC = app.isPackaged
  ? process.env.DIST
  : path.join(__dirname, "../public")

let mainWindow: BrowserWindow | null = null

const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

const isMac = process.platform === "darwin"

const OPEN_PATH_CHANNEL = "app:open-path"
const SUPPORTED_OPEN_EXTENSIONS = new Set([".tusk", ".tusks", ".md", ".txt", ".pdf"])
const pendingOpenPaths: string[] = []
let isRendererReady = false

// Menu items carrying this command are handled here rather than round-tripped to the
// renderer: the Dock menu fires with no window at all, and on macOS the menu bar stays
// up after the last window closes, so a renderer-owned handler would be dead in exactly
// the cases where "open a file" is the only thing left to do.
const OPEN_FILE_WINDOW_COMMAND = "open-file-window"
const OPEN_FILE_DIALOG_FILTERS = [
  { name: "Ivoryscribe Documents", extensions: ["tusk", "tusks", "md", "txt", "pdf"] },
]
let lastOpenDialogDirectory: string | null = null

function hasSupportedExtension(filePath: string): boolean {
  return SUPPORTED_OPEN_EXTENSIONS.has(path.extname(filePath).toLowerCase())
}

function enqueueOpenPath(filePath: string) {
  if (!filePath || !hasSupportedExtension(filePath)) return
  if (isRendererReady && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(OPEN_PATH_CHANNEL, filePath)
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

ipcMain.on("app:open-path-ready", (event) => {
  if (mainWindow && event.sender === mainWindow.webContents) {
    isRendererReady = true
    flushPendingOpenPaths()
  }
})

function collectPathsFromArgv(argv: string[]): string[] {
  return argv.slice(1).filter((arg) => !arg.startsWith("-") && hasSupportedExtension(arg))
}

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

type RendererMenuItem = {
  label: string
  id?: string
  submenu?: RendererMenuItem[]
  disabled?: boolean
  shortcut?: string
  role?: string
  appCommand?: string
}

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

    if (item.appCommand === OPEN_FILE_WINDOW_COMMAND) {
      return {
        label: item.label,
        enabled: !item.disabled,
        accelerator: item.shortcut ? toAccelerator(item.shortcut) : undefined,
        click: () => { void promptOpenFileInNewWindow() },
      }
    }

    if (item.role) {
      return {
        label: item.label,
        enabled: !item.disabled,
        accelerator: item.shortcut ? toAccelerator(item.shortcut) : undefined,
        role: item.role as MenuItemConstructorOptions["role"],
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
            { label: "Check for Updates…", click: () => { void checkForUpdates() } },
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

function createWindow() {
  mainWindow = new BrowserWindow(makeBrowserWindowOptions())

  mainWindow.webContents.on("preload-error", (_event, preload, error) => {
    console.error("[ivoryscribe] PRELOAD ERROR:", preload, error)
  })

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

// A throwaway window scoped to one file. It rides the same two query params a
// Finder-opened file outside the workspace already travels on, so the renderer needs
// no new plumbing: rootOverride makes the file's own folder the workspace for this
// window only, and openFile tells it which document to land in. Deliberately not
// assigned to mainWindow — closing a temp window must not tear down the open-path
// bridge the primary window owns.
function createDocumentWindow(filePath: string): BrowserWindow {
  const win = new BrowserWindow(makeBrowserWindowOptions())
  const query = { rootOverride: path.dirname(filePath), openFile: filePath }

  win.webContents.on("preload-error", (_event, preload, error) => {
    console.error("[ivoryscribe] PRELOAD ERROR:", preload, error)
  })

  if (VITE_DEV_SERVER_URL) {
    const url = new URL(VITE_DEV_SERVER_URL)
    url.searchParams.set("rootOverride", query.rootOverride)
    url.searchParams.set("openFile", query.openFile)
    void win.loadURL(url.toString())
  } else {
    void win.loadFile(path.join(process.env.DIST!, "index.html"), { query })
  }

  return win
}

async function promptOpenFileInNewWindow(parent?: BrowserWindow | null) {
  if (!app.isReady()) return

  const owner = parent && !parent.isDestroyed() ? parent : BrowserWindow.getFocusedWindow()
  const options: Electron.OpenDialogOptions = {
    title: "Open File",
    buttonLabel: "Open",
    defaultPath: lastOpenDialogDirectory ?? app.getPath("documents"),
    properties: ["openFile", "multiSelections"],
    filters: OPEN_FILE_DIALOG_FILTERS,
  }

  const result = owner
    ? await dialog.showOpenDialog(owner, options)
    : await dialog.showOpenDialog(options)
  if (result.canceled) return

  const openable = result.filePaths.filter(hasSupportedExtension)
  const unopenable = result.filePaths.filter((p) => !hasSupportedExtension(p))

  if (openable.length > 0) {
    lastOpenDialogDirectory = path.dirname(openable[openable.length - 1])
    for (const filePath of openable) createDocumentWindow(filePath)
  }

  // The filters normally make this unreachable, but a path typed straight into the
  // panel can slip past them, and silently doing nothing would read as a hang.
  if (unopenable.length > 0) {
    void dialog.showMessageBox({
      type: "warning",
      message: unopenable.length === 1
        ? "Ivoryscribe can’t open that file"
        : "Ivoryscribe can’t open some of those files",
      detail: `${unopenable.map((p) => path.basename(p)).join("\n")}\n\nOpen a .tusk, .tusks, .md, .txt or .pdf file instead.`,
      buttons: ["OK"],
    })
  }
}

function applyDockMenu() {
  if (!isMac || !app.dock) return
  app.dock.setMenu(Menu.buildFromTemplate([
    { label: "Open File…", click: () => { void promptOpenFileInNewWindow() } },
  ]))
}

ipcMain.on("app:open-file-window", (event) => {
  void promptOpenFileInNewWindow(BrowserWindow.fromWebContents(event.sender))
})

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

ipcMain.on("menu:update", (_event, items: RendererMenuItem[]) => {
  applyNativeMenu(items)
})

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

const DEFAULT_ROOT_FOLDER_NAME = "Scribe"

ipcMain.handle("fs:getDefaultRoot", async (_event, options: { create?: boolean } = {}) => {
  const { create = true } = options
  const root = path.join(app.getPath("documents"), DEFAULT_ROOT_FOLDER_NAME)

  if (!create) {
    try {
      const stat = await fsp.stat(root)
      return stat.isDirectory() ? root : null
    } catch {
      return null
    }
  }

  await fsp.mkdir(root, { recursive: true })
  return root
})

ipcMain.handle("fs:readFile", async (_event, filePath: string) => {
  return await fsp.readFile(filePath, "utf8")
})

ipcMain.handle("fs:readFileBinary", async (_event, filePath: string) => {
  return await fsp.readFile(filePath)
})

ipcMain.handle("fs:writeFile", async (_event, filePath: string, contents: string) => {
  await fsp.mkdir(path.dirname(filePath), { recursive: true })
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`
  await fsp.writeFile(tmp, contents, "utf8")
  await fsp.rename(tmp, filePath)
})

ipcMain.handle("fs:writeFileBinary", async (_event, filePath: string, data: Uint8Array) => {
  await fsp.mkdir(path.dirname(filePath), { recursive: true })
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`
  await fsp.writeFile(tmp, Buffer.from(data))
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

ipcMain.on("fs:showItemInFolder", (_event, targetPath: string) => {
  shell.showItemInFolder(targetPath)
})

ipcMain.handle("app:getVersion", () => app.getVersion())

ipcMain.handle("clipboard:readText", () => {
  return clipboard.readText()
})

ipcMain.handle("print:toPdf", async (_event, html: string): Promise<{ pdf: Buffer; chapterStartPages: number[] }> => {
  const win = new BrowserWindow({
    show: false,
    width: 816,
    height: 1056,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      offscreen: false,
    },
  })

  const tmpPath = path.join(app.getPath("temp"), `ivoryscribe-export-${Date.now()}-${Math.round(Math.random() * 1e9)}.html`)

  try {
    await fsp.writeFile(tmpPath, html, "utf-8")
    await win.loadFile(tmpPath)

    await win.webContents.executeJavaScript(
      `new Promise((resolve) => {
        const deadline = Date.now() + 10000
        const fontsReady = (window.document.fonts && window.document.fonts.ready)
          ? window.document.fonts.ready
          : Promise.resolve()
        const tick = () => {
          if (window.__pdfxReady === true || Date.now() > deadline) { resolve(true); return }
          setTimeout(tick, 50)
        }
        fontsReady.finally(() => tick())
      })`,
    )

    const chapterStartPages = (await win.webContents
      .executeJavaScript("Array.isArray(window.__pdfxChapterStartPages) ? window.__pdfxChapterStartPages : []")
      .catch(() => [])) as number[]

    const data = await win.webContents.printToPDF({
      preferCSSPageSize: true,
      printBackground: true,
      margins: { marginType: "none" },
    })
    return { pdf: data, chapterStartPages }
  } finally {
    win.destroy()
    fsp.unlink(tmpPath).catch(() => {})
  }
})

const TINT_FOLDER_ICON_JXA = String.raw`
ObjC.import('AppKit');
ObjC.import('CoreImage');

// JXA's idiomatic nil check — \`obj.isNil\` returns the *method* (truthy)
// rather than calling it, so we unwrap to a JS value and compare. This
// caught a bug where every "did the object survive?" branch silently
// passed.
function isObjCNil(value) {
  if (value === null || value === undefined) return true;
  try {
    return ObjC.unwrap(value) === null;
  } catch (_) {
    return false;
  }
}

function run() {
  const env = $.NSProcessInfo.processInfo.environment;
  const folderPath = ObjC.unwrap(env.objectForKey('IV_FOLDER_PATH'));
  const rawHex = ObjC.unwrap(env.objectForKey('IV_HEX_COLOR')) || '';
  const workspace = $.NSWorkspace.sharedWorkspace;

  if (!folderPath) return 'ERR:no path';

  // Empty hex → clear custom icon, restore system default.
  if (rawHex.trim() === '') {
    workspace.setIconForFileOptions($(), folderPath, 0);
    return 'reset';
  }

  const clean = rawHex.replace('#', '');
  if (clean.length !== 6) return 'ERR:bad hex';
  const r = parseInt(clean.substr(0, 2), 16) / 255;
  const g = parseInt(clean.substr(2, 2), 16) / 255;
  const b = parseInt(clean.substr(4, 2), 16) / 255;

  // Grab the system folder icon. NSImage.imageNamed('NSFolder') is the
  // native blue Finder folder. iconForFileType is a fallback that on some
  // OS versions returns a less detailed representation.
  let baseIcon = $.NSImage.imageNamed('NSFolder');
  if (isObjCNil(baseIcon)) {
    baseIcon = workspace.iconForFileType('public.folder');
  }
  if (isObjCNil(baseIcon)) return 'ERR:no base icon';

  // Force a large representation for crisp Finder rendering at any zoom.
  const drawSize = $.NSMakeSize(512, 512);
  baseIcon.setSize(drawSize);

  // Convert the NSImage to a CIImage via TIFF → NSBitmapImageRep. We
  // can't go NSImage → CIImage directly across all macOS versions, but
  // every NSImage exposes a TIFFRepresentation, and the TIFF carries the
  // highest-resolution sub-representation (we verified 1024×1024 in dev).
  const tiffData = baseIcon.TIFFRepresentation;
  if (isObjCNil(tiffData)) return 'ERR:no TIFF data';
  const bitmap = $.NSBitmapImageRep.imageRepWithData(tiffData);
  if (isObjCNil(bitmap)) return 'ERR:no bitmap rep';
  const ciImage = $.CIImage.alloc.initWithBitmapImageRep(bitmap);
  if (isObjCNil(ciImage)) return 'ERR:no CI image';

  // CIColorMonochrome: replaces each pixel's color with the input color
  // scaled by the pixel's luminance, while preserving the alpha channel.
  // The folder's highlights/shadows stay (so it still reads as 3D), but
  // every visible pixel is now in the chosen hue. Result is *vibrant*
  // tinting — verified by writing the output PNG to disk during dev.
  const filter = $.CIFilter.filterWithName('CIColorMonochrome');
  if (isObjCNil(filter)) return 'ERR:CIColorMonochrome unavailable';
  filter.setDefaults;
  filter.setValueForKey(ciImage, 'inputImage');
  filter.setValueForKey($.CIColor.colorWithRedGreenBlue(r, g, b), 'inputColor');
  filter.setValueForKey(1.0, 'inputIntensity');

  const output = filter.outputImage;
  if (isObjCNil(output)) return 'ERR:filter produced no output';

  // CRITICAL: rasterize through CIContext, NOT NSCIImageRep.
  // NSCIImageRep is a "lazy" representation — addRepresentation accepts
  // it, but NSWorkspace.setIcon writes a broken Icon\\r resource because
  // it never asks for actual pixel bytes. Finder then renders the
  // generic gray "no icon" placeholder, which was the bug the user saw.
  // CIContext.createCGImage produces a concrete CGImage, and an
  // NSBitmapImageRep built from that CGImage round-trips through
  // setIcon correctly.
  const cictx = $.CIContext.context;
  const cgImg = cictx.createCGImageFromRect(output, output.extent);
  if (isObjCNil(cgImg)) return 'ERR:could not rasterize';
  const bitmapRep = $.NSBitmapImageRep.alloc.initWithCGImage(cgImg);
  if (isObjCNil(bitmapRep)) return 'ERR:no bitmap from CG';

  const tinted = $.NSImage.alloc.initWithSize(drawSize);
  tinted.addRepresentation(bitmapRep);

  const ok = workspace.setIconForFileOptions(tinted, folderPath, 0);
  return ok ? 'ok' : 'ERR:setIcon returned false';
}
`

ipcMain.handle("fs:setMacFolderIconColor", async (_event, targetPath: string, hex: string | null): Promise<{ ok: boolean; error?: string }> => {
  if (process.platform !== "darwin") {
    return { ok: false, error: "Folder icon coloring is only available on macOS" }
  }
  if (typeof targetPath !== "string" || !targetPath) {
    return { ok: false, error: "Invalid path" }
  }
  return await new Promise((resolve) => {
    execFile(
      "/usr/bin/osascript",
      ["-l", "JavaScript", "-e", TINT_FOLDER_ICON_JXA],
      {
        env: {
          ...process.env,
          IV_FOLDER_PATH: targetPath,
          IV_HEX_COLOR: hex ?? "",
        },
        timeout: 8_000,
      },
      (err, stdout, stderr) => {
        if (err) {
          resolve({ ok: false, error: stderr?.toString().trim() || err.message })
          return
        }
        const result = stdout.toString().trim()
        if (result.startsWith("ERR:")) {
          resolve({ ok: false, error: result.slice(4) })
          return
        }
        resolve({ ok: true })
      },
    )
  })
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

const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on("second-instance", (_event, argv) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
    for (const p of collectPathsFromArgv(argv)) enqueueOpenPath(p)
  })

  app.on("open-file", (event, filePath) => {
    event.preventDefault()
    enqueueOpenPath(filePath)
  })

  if (!isMac) {
    for (const p of collectPathsFromArgv(process.argv)) enqueueOpenPath(p)
  }

  void app.whenReady().then(() => {
    createWindow()
    applyNativeMenu([])
    applyDockMenu()
    initAutoUpdater(() => mainWindow)
  })
}
