import electronUpdater from "electron-updater"
import { app, ipcMain, type BrowserWindow } from "electron"

const { autoUpdater } = electronUpdater

type GetWindow = () => BrowserWindow | null

export type UpdaterEvent =
  | { status: "checking" }
  | { status: "available"; version: string }
  | { status: "not-available" }
  | { status: "downloading"; percent: number }
  | { status: "downloaded"; version: string }
  | { status: "error"; message: string }

function broadcast(getWindow: GetWindow, payload: UpdaterEvent) {
  const win = getWindow()
  if (win && !win.isDestroyed()) {
    win.webContents.send("updater:event", payload)
  }
}

export function initAutoUpdater(getWindow: GetWindow) {
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on("checking-for-update", () => broadcast(getWindow, { status: "checking" }))
  autoUpdater.on("update-available", (info) =>
    broadcast(getWindow, { status: "available", version: info.version }),
  )
  autoUpdater.on("update-not-available", () => broadcast(getWindow, { status: "not-available" }))
  autoUpdater.on("download-progress", (progress) =>
    broadcast(getWindow, { status: "downloading", percent: Math.round(progress.percent) }),
  )
  autoUpdater.on("update-downloaded", (info) =>
    broadcast(getWindow, { status: "downloaded", version: info.version }),
  )
  autoUpdater.on("error", (err) =>
    broadcast(getWindow, { status: "error", message: err == null ? "unknown error" : err.message ?? String(err) }),
  )

  ipcMain.on("updater:check", () => { void checkForUpdates() })
  ipcMain.on("updater:download", () => { void autoUpdater.downloadUpdate() })
  ipcMain.on("updater:install", () => {
    autoUpdater.quitAndInstall(false, true)
  })

  if (app.isPackaged) {
    setTimeout(() => { void checkForUpdates() }, 4000)
  }
}

export async function checkForUpdates() {
  if (!app.isPackaged) return
  try {
    await autoUpdater.checkForUpdates()
  } catch (error) {
    console.error("[ivoryscribe] update check failed:", error)
  }
}
