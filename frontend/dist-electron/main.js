import { app, ipcMain, BrowserWindow, shell } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
const __dirname$1 = path.dirname(fileURLToPath(import.meta.url));
process.env.DIST = path.join(__dirname$1, "../dist");
process.env.VITE_PUBLIC = app.isPackaged ? process.env.DIST : path.join(__dirname$1, "../public");
let mainWindow = null;
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
function createWindow() {
  const isMac = process.platform === "darwin";
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
void app.whenReady().then(createWindow);
