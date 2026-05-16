import { app, ipcMain, shell, BrowserWindow, Menu, dialog } from "electron";
import { promises } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const __dirname$1 = path.dirname(fileURLToPath(import.meta.url));
process.env.DIST = path.join(__dirname$1, "../dist");
process.env.VITE_PUBLIC = app.isPackaged ? process.env.DIST : path.join(__dirname$1, "../public");
let mainWindow = null;
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
const isMac = process.platform === "darwin";
function toAccelerator(shortcut) {
  if (!shortcut) return void 0;
  return shortcut.replace(/⌘/g, "CmdOrCtrl+").replace(/⇧/g, "Shift+").replace(/⌥/g, "Alt+").replace(/⌃/g, "Ctrl+").replace(/\+$/g, "");
}
function buildNativeMenu(items, sendCommand) {
  return items.map((item) => {
    if (item.submenu?.length) {
      return {
        label: item.label,
        enabled: !item.disabled,
        submenu: buildNativeMenu(item.submenu, sendCommand)
      };
    }
    return {
      label: item.label,
      enabled: !item.disabled,
      accelerator: item.shortcut ? toAccelerator(item.shortcut) : void 0,
      click: () => {
        if (item.id) sendCommand(item.id);
      }
    };
  });
}
function applyNativeMenu(rendererItems) {
  const sendCommand = (id) => {
    mainWindow?.webContents.send("menu:command", id);
  };
  const appMenuItems = buildNativeMenu(rendererItems, sendCommand);
  const template = [
    ...isMac ? [{
      label: app.name,
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" }
      ]
    }] : [],
    ...appMenuItems
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
function createWindow() {
  const preloadPath = path.join(__dirname$1, "preload.cjs");
  console.log("[ivoryscribe] preload path:", preloadPath);
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: isMac ? "hiddenInset" : "hidden",
    trafficLightPosition: isMac ? { x: 16, y: 14 } : void 0,
    frame: isMac,
    transparent: isMac,
    vibrancy: isMac ? "sidebar" : void 0,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  mainWindow.webContents.on("preload-error", (_event, preload, error) => {
    console.error("[ivoryscribe] PRELOAD ERROR:", preload, error);
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });
  if (VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(VITE_DEV_SERVER_URL);
  } else {
    void mainWindow.loadFile(path.join(process.env.DIST, "index.html"));
  }
}
ipcMain.on("window:minimize", () => {
  mainWindow?.minimize();
});
ipcMain.on("window:maximize", () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});
ipcMain.on("window:close", () => {
  mainWindow?.close();
});
ipcMain.handle("window:isMaximized", () => {
  return mainWindow?.isMaximized() ?? false;
});
ipcMain.handle("window:isFullScreen", () => {
  return mainWindow?.isFullScreen() ?? false;
});
ipcMain.handle("spellcheck:add-word", (_event, word) => {
  if (typeof word !== "string") {
    return false;
  }
  const normalizedWord = word.trim().toLowerCase();
  if (!normalizedWord) {
    return false;
  }
  try {
    return mainWindow?.webContents.session.addWordToSpellCheckerDictionary(normalizedWord) ?? false;
  } catch {
    return false;
  }
});
ipcMain.handle("spellcheck:remove-word", (_event, word) => {
  if (typeof word !== "string") {
    return false;
  }
  const normalizedWord = word.trim().toLowerCase();
  if (!normalizedWord) {
    return false;
  }
  const session = mainWindow?.webContents.session;
  if (!session) {
    return false;
  }
  if (typeof session.removeWordFromSpellCheckerDictionary !== "function") {
    return false;
  }
  try {
    return session.removeWordFromSpellCheckerDictionary(normalizedWord);
  } catch {
    return false;
  }
});
ipcMain.on("menu:update", (_event, items) => {
  applyNativeMenu(items);
});
ipcMain.handle("dialog:selectDirectory", async (_event, opts = {}) => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: opts.title ?? "Select folder",
    defaultPath: opts.defaultPath,
    properties: ["openDirectory", "createDirectory"]
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});
ipcMain.handle("fs:getDefaultRoot", async () => {
  const docs = app.getPath("documents");
  const root = path.join(docs, "Ivoryscribe");
  await promises.mkdir(root, { recursive: true });
  return root;
});
ipcMain.handle("fs:readFile", async (_event, filePath) => {
  return await promises.readFile(filePath, "utf8");
});
ipcMain.handle("fs:writeFile", async (_event, filePath, contents) => {
  await promises.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await promises.writeFile(tmp, contents, "utf8");
  await promises.rename(tmp, filePath);
});
ipcMain.handle("fs:listDirectory", async (_event, dirPath) => {
  const entries = await promises.readdir(dirPath, { withFileTypes: true });
  const out = [];
  for (const ent of entries) {
    if (ent.name.startsWith(".")) continue;
    const full = path.join(dirPath, ent.name);
    try {
      const stat = await promises.stat(full);
      out.push({
        name: ent.name,
        path: full,
        kind: ent.isDirectory() ? "directory" : "file",
        size: stat.size,
        modifiedAt: stat.mtimeMs
      });
    } catch {
    }
  }
  return out;
});
ipcMain.handle("fs:mkdir", async (_event, dirPath) => {
  await promises.mkdir(dirPath, { recursive: true });
});
ipcMain.handle("fs:rename", async (_event, oldPath, newPath) => {
  await promises.rename(oldPath, newPath);
});
ipcMain.handle("fs:trash", async (_event, targetPath) => {
  await shell.trashItem(targetPath);
});
ipcMain.handle("fs:exists", async (_event, targetPath) => {
  try {
    await promises.access(targetPath);
    return true;
  } catch {
    return false;
  }
});
ipcMain.handle("fs:stat", async (_event, targetPath) => {
  const s = await promises.stat(targetPath);
  return {
    size: s.size,
    modifiedAt: s.mtimeMs,
    isDirectory: s.isDirectory(),
    isFile: s.isFile()
  };
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
    mainWindow = null;
  }
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
void app.whenReady().then(() => {
  createWindow();
  applyNativeMenu([]);
});
