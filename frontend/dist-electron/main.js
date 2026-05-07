import { app, ipcMain, BrowserWindow, Menu, shell } from "electron";
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
      preload: path.join(__dirname$1, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
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
