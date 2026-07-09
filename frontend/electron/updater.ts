import electronUpdater from "electron-updater"
import { app, ipcMain, type BrowserWindow } from "electron"

// electron-updater is CommonJS; grab the singleton off the default export.
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

/**
 * Wires desktop auto-updates via GitHub Releases (see the `publish` block in
 * package.json). Updates are surfaced to the renderer as an in-app banner
 * rather than downloaded silently: the user opts in to download, watches
 * progress, then restarts to install. Only runs in packaged builds — dev has
 * no update feed. rAF-free, event-driven.
 */
export function initAutoUpdater(getWindow: GetWindow) {
  // Surface an in-app prompt first; the user chooses when to download/install.
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

  // Renderer → main controls (gated by the banner UI, which only shows the
  // Download button once an update is actually available).
  ipcMain.on("updater:check", () => { void checkForUpdates() })
  ipcMain.on("updater:download", () => { void autoUpdater.downloadUpdate() })
  ipcMain.on("updater:install", () => {
    // isSilent=false (show the installer), forceRunAfter=true (relaunch into
    // the new version once installed).
    autoUpdater.quitAndInstall(false, true)
  })

  // Auto-check a few seconds after launch so the window is up first.
  if (app.isPackaged) {
    setTimeout(() => { void checkForUpdates() }, 4000)
  }
}

/**
 * Kicks off an update check. Also used by the "Check for Updates…" menu item.
 * No-ops (and never throws) in dev / unpublished builds, which have no feed.
 */
export async function checkForUpdates() {
  if (!app.isPackaged) return
  try {
    await autoUpdater.checkForUpdates()
  } catch (error) {
    console.error("[ivoryscribe] update check failed:", error)
  }
}
