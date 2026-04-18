import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("electronAPI", {
    platform: process.platform,
    minimize: () => ipcRenderer.send("window:minimize"),
    maximize: () => ipcRenderer.send("window:maximize"),
    close: () => ipcRenderer.send("window:close"),
    isMaximized: () => ipcRenderer.invoke("window:isMaximized"),
    isFullScreen: () => ipcRenderer.invoke("window:isFullScreen"),
    updateMenu: (items) => ipcRenderer.send("menu:update", items),
    onMenuCommand: (callback) => {
        const handler = (_event, commandId) => callback(commandId);
        ipcRenderer.on("menu:command", handler);
        return () => { ipcRenderer.removeListener("menu:command", handler); };
    },
});
// Add electron-mac class on html element so CSS can target it for transparency
if (process.platform === "darwin") {
    document.addEventListener("DOMContentLoaded", () => {
        document.documentElement.classList.add("electron-mac");
    });
}
