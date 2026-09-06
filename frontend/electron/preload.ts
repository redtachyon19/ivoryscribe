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
  onOpenPath: (callback: (filePath: string) => void) => {
    const handler = (_event: unknown, filePath: string) => callback(filePath)
    ipcRenderer.on("app:open-path", handler)
    return () => { ipcRenderer.removeListener("app:open-path", handler) }
  },
  notifyOpenPathReady: () => {
    ipcRenderer.send("app:open-path-ready")
  },
  openFileInNewWindow: () => {
    ipcRenderer.send("app:open-file-window")
  },

  getVersion: () => ipcRenderer.invoke("app:getVersion") as Promise<string>,

  fs: {
    selectDirectory: (opts?: { defaultPath?: string; title?: string }) =>
      ipcRenderer.invoke("dialog:selectDirectory", opts ?? {}),
    getDefaultRoot: (options?: { create?: boolean }) =>
      ipcRenderer.invoke("fs:getDefaultRoot", options ?? {}),
    readFile: (filePath: string) =>
      ipcRenderer.invoke("fs:readFile", filePath),
    readFileBinary: (filePath: string) =>
      ipcRenderer.invoke("fs:readFileBinary", filePath) as Promise<Uint8Array>,
    writeFile: (filePath: string, contents: string) =>
      ipcRenderer.invoke("fs:writeFile", filePath, contents),
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
    toPdf: (html: string) =>
      ipcRenderer.invoke("print:toPdf", html) as Promise<{ pdf: Uint8Array; chapterStartPages: number[] }>,
  },

  updater: {
    check: () => ipcRenderer.send("updater:check"),
    download: () => ipcRenderer.send("updater:download"),
    install: () => ipcRenderer.send("updater:install"),
    onEvent: (callback: (event: unknown) => void) => {
      const handler = (_event: unknown, payload: unknown) => callback(payload)
      ipcRenderer.on("updater:event", handler)
      return () => { ipcRenderer.removeListener("updater:event", handler) }
    },
  },
})

if (process.platform === "darwin") {
  document.addEventListener("DOMContentLoaded", () => {
    document.documentElement.classList.add("electron-mac")
  })
}
