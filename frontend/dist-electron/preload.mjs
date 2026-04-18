"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("electronAPI", {
  platform: process.platform,
  minimize: () => electron.ipcRenderer.send("window:minimize"),
  maximize: () => electron.ipcRenderer.send("window:maximize"),
  close: () => electron.ipcRenderer.send("window:close"),
  isMaximized: () => electron.ipcRenderer.invoke("window:isMaximized"),
  isFullScreen: () => electron.ipcRenderer.invoke("window:isFullScreen"),
  updateMenu: (items) => electron.ipcRenderer.send("menu:update", items),
  onMenuCommand: (callback) => {
    const handler = (_event, commandId) => callback(commandId);
    electron.ipcRenderer.on("menu:command", handler);
    return () => {
      electron.ipcRenderer.removeListener("menu:command", handler);
    };
  }
});
if (process.platform === "darwin") {
  document.addEventListener("DOMContentLoaded", () => {
    document.documentElement.classList.add("electron-mac");
  });
}
