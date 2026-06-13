import { contextBridge, ipcRenderer } from "electron"
import path from "node:path"

contextBridge.exposeInMainWorld("electronAPI", {
  platform: process.platform,
  minimize: () => ipcRenderer.send("window:minimize"),
  maximize: () => ipcRenderer.send("window:maximize"),
  close: () => ipcRenderer.send("window:close"),
  isMaximized: () => ipcRenderer.invoke("window:isMaximized"),
  isFullScreen: () => ipcRenderer.invoke("window:isFullScreen"),
  addSpellCheckerWord: (word: string) => ipcRenderer.invoke("spellcheck:add-word", word),
  removeSpellCheckerWord: (word: string) => ipcRenderer.invoke("spellcheck:remove-word", word),
  updateMenu: (items: unknown) => ipcRenderer.send("menu:update", items),
  onMenuCommand: (callback: (commandId: string) => void) => {
    const handler = (_event: unknown, commandId: string) => callback(commandId)
    ipcRenderer.on("menu:command", handler)
    return () => { ipcRenderer.removeListener("menu:command", handler) }
  },
  // Fired when the OS hands us a file to open — Finder double-click on a
  // .tusk/.tusks (macOS open-file), a second-instance launch with file
  // args, or a cold-start argv path on Win/Linux. The main process buffers
  // until the renderer subscribes via this listener.
  onOpenPath: (callback: (filePath: string) => void) => {
    const handler = (_event: unknown, filePath: string) => callback(filePath)
    ipcRenderer.on("app:open-path", handler)
    return () => { ipcRenderer.removeListener("app:open-path", handler) }
  },
  // The renderer calls this once it has actually attached its onOpenPath
  // listener AND is ready to act on a path (local workspace resolved). Main
  // buffers OS-handed paths until THIS fires — flushing earlier (on
  // did-finish-load) raced the async workspace bootstrap and dropped the
  // cold-start file. See main.ts flushPendingOpenPaths.
  notifyOpenPathReady: () => {
    ipcRenderer.send("app:open-path-ready")
  },

  fs: {
    selectDirectory: (opts?: { defaultPath?: string; title?: string }) =>
      ipcRenderer.invoke("dialog:selectDirectory", opts ?? {}),
    getDefaultRoot: () =>
      ipcRenderer.invoke("fs:getDefaultRoot"),
    readFile: (filePath: string) =>
      ipcRenderer.invoke("fs:readFile", filePath),
    // Binary read for PDFs / other non-utf-8 files. The renderer receives
    // a Uint8Array via Electron's structured-clone IPC.
    readFileBinary: (filePath: string) =>
      ipcRenderer.invoke("fs:readFileBinary", filePath) as Promise<Uint8Array>,
    writeFile: (filePath: string, contents: string) =>
      ipcRenderer.invoke("fs:writeFile", filePath, contents),
    // Binary write for PDFs / other non-utf-8 files (e.g. persisting edited
    // bookmarks back into a .pdf). The Uint8Array is structured-cloned to the
    // main process.
    writeFileBinary: (filePath: string, data: Uint8Array) =>
      ipcRenderer.invoke("fs:writeFileBinary", filePath, data) as Promise<void>,
    listDirectory: (dirPath: string) =>
      ipcRenderer.invoke("fs:listDirectory", dirPath),
    mkdir: (dirPath: string) =>
      ipcRenderer.invoke("fs:mkdir", dirPath),
    rename: (oldPath: string, newPath: string) =>
      ipcRenderer.invoke("fs:rename", oldPath, newPath),
    trash: (targetPath: string) =>
      ipcRenderer.invoke("fs:trash", targetPath),
    showItemInFolder: (targetPath: string) =>
      ipcRenderer.send("fs:showItemInFolder", targetPath),
    exists: (targetPath: string) =>
      ipcRenderer.invoke("fs:exists", targetPath),
    stat: (targetPath: string) =>
      ipcRenderer.invoke("fs:stat", targetPath),
    /** macOS only. Install a tinted version of the system folder icon as
     *  the folder's custom icon, so it actually appears in that color
     *  in Finder. Pass an empty hex (or null) to clear the custom icon
     *  and revert to the system default. Returns `{ ok, error? }`. */
    setMacFolderIconColor: (targetPath: string, hex: string | null) =>
      ipcRenderer.invoke("fs:setMacFolderIconColor", targetPath, hex) as Promise<{ ok: boolean; error?: string }>,
  },

  path: {
    join: (...parts: string[]) => path.join(...parts),
    basename: (p: string, ext?: string) => path.basename(p, ext),
    dirname: (p: string) => path.dirname(p),
    extname: (p: string) => path.extname(p),
    sep: path.sep,
  },

  clipboard: {
    readText: () => ipcRenderer.invoke("clipboard:readText") as Promise<string>,
  },

  print: {
    /** Render a self-contained export HTML document to PDF bytes via the main
     *  process (hidden BrowserWindow + Chromium printToPDF). */
    toPdf: (html: string) => ipcRenderer.invoke("print:toPdf", html) as Promise<Uint8Array>,
  },
})

if (process.platform === "darwin") {
  document.addEventListener("DOMContentLoaded", () => {
    document.documentElement.classList.add("electron-mac")
  })
}
