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

  fs: {
    selectDirectory: (opts?: { defaultPath?: string; title?: string }) =>
      ipcRenderer.invoke("dialog:selectDirectory", opts ?? {}),
    getDefaultRoot: () =>
      ipcRenderer.invoke("fs:getDefaultRoot"),
    readFile: (filePath: string) =>
      ipcRenderer.invoke("fs:readFile", filePath),
    writeFile: (filePath: string, contents: string) =>
      ipcRenderer.invoke("fs:writeFile", filePath, contents),
    listDirectory: (dirPath: string) =>
      ipcRenderer.invoke("fs:listDirectory", dirPath),
    mkdir: (dirPath: string) =>
      ipcRenderer.invoke("fs:mkdir", dirPath),
    rename: (oldPath: string, newPath: string) =>
      ipcRenderer.invoke("fs:rename", oldPath, newPath),
    trash: (targetPath: string) =>
      ipcRenderer.invoke("fs:trash", targetPath),
    exists: (targetPath: string) =>
      ipcRenderer.invoke("fs:exists", targetPath),
    stat: (targetPath: string) =>
      ipcRenderer.invoke("fs:stat", targetPath),
  },

  path: {
    join: (...parts: string[]) => path.join(...parts),
    basename: (p: string, ext?: string) => path.basename(p, ext),
    dirname: (p: string) => path.dirname(p),
    extname: (p: string) => path.extname(p),
    sep: path.sep,
  },
})

if (process.platform === "darwin") {
  document.addEventListener("DOMContentLoaded", () => {
    document.documentElement.classList.add("electron-mac")
  })
}
