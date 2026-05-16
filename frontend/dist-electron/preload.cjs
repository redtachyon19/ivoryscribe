"use strict";
const electron = require("electron");
const path = require("node:path");
electron.contextBridge.exposeInMainWorld("electronAPI", {
  platform: process.platform,
  minimize: () => electron.ipcRenderer.send("window:minimize"),
  maximize: () => electron.ipcRenderer.send("window:maximize"),
  close: () => electron.ipcRenderer.send("window:close"),
  isMaximized: () => electron.ipcRenderer.invoke("window:isMaximized"),
  isFullScreen: () => electron.ipcRenderer.invoke("window:isFullScreen"),
  addSpellCheckerWord: (word) => electron.ipcRenderer.invoke("spellcheck:add-word", word),
  removeSpellCheckerWord: (word) => electron.ipcRenderer.invoke("spellcheck:remove-word", word),
  updateMenu: (items) => electron.ipcRenderer.send("menu:update", items),
  onMenuCommand: (callback) => {
    const handler = (_event, commandId) => callback(commandId);
    electron.ipcRenderer.on("menu:command", handler);
    return () => {
      electron.ipcRenderer.removeListener("menu:command", handler);
    };
  },
  fs: {
    selectDirectory: (opts) => electron.ipcRenderer.invoke("dialog:selectDirectory", opts ?? {}),
    getDefaultRoot: () => electron.ipcRenderer.invoke("fs:getDefaultRoot"),
    readFile: (filePath) => electron.ipcRenderer.invoke("fs:readFile", filePath),
    writeFile: (filePath, contents) => electron.ipcRenderer.invoke("fs:writeFile", filePath, contents),
    listDirectory: (dirPath) => electron.ipcRenderer.invoke("fs:listDirectory", dirPath),
    mkdir: (dirPath) => electron.ipcRenderer.invoke("fs:mkdir", dirPath),
    rename: (oldPath, newPath) => electron.ipcRenderer.invoke("fs:rename", oldPath, newPath),
    trash: (targetPath) => electron.ipcRenderer.invoke("fs:trash", targetPath),
    exists: (targetPath) => electron.ipcRenderer.invoke("fs:exists", targetPath),
    stat: (targetPath) => electron.ipcRenderer.invoke("fs:stat", targetPath)
  },
  path: {
    join: (...parts) => path.join(...parts),
    basename: (p, ext) => path.basename(p, ext),
    dirname: (p) => path.dirname(p),
    extname: (p) => path.extname(p),
    sep: path.sep
  }
});
if (process.platform === "darwin") {
  document.addEventListener("DOMContentLoaded", () => {
    document.documentElement.classList.add("electron-mac");
  });
}
