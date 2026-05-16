import { contextBridge, ipcRenderer } from "electron";
import path from "node:path";
contextBridge.exposeInMainWorld("electronAPI", {
    platform: process.platform,
    minimize: () => ipcRenderer.send("window:minimize"),
    maximize: () => ipcRenderer.send("window:maximize"),
    close: () => ipcRenderer.send("window:close"),
    isMaximized: () => ipcRenderer.invoke("window:isMaximized"),
    isFullScreen: () => ipcRenderer.invoke("window:isFullScreen"),
    addSpellCheckerWord: (word) => ipcRenderer.invoke("spellcheck:add-word", word),
    removeSpellCheckerWord: (word) => ipcRenderer.invoke("spellcheck:remove-word", word),
    updateMenu: (items) => ipcRenderer.send("menu:update", items),
    onMenuCommand: (callback) => {
        const handler = (_event, commandId) => callback(commandId);
        ipcRenderer.on("menu:command", handler);
        return () => { ipcRenderer.removeListener("menu:command", handler); };
    },
    fs: {
        selectDirectory: (opts) => ipcRenderer.invoke("dialog:selectDirectory", opts ?? {}),
        getDefaultRoot: () => ipcRenderer.invoke("fs:getDefaultRoot"),
        readFile: (filePath) => ipcRenderer.invoke("fs:readFile", filePath),
        writeFile: (filePath, contents) => ipcRenderer.invoke("fs:writeFile", filePath, contents),
        listDirectory: (dirPath) => ipcRenderer.invoke("fs:listDirectory", dirPath),
        mkdir: (dirPath) => ipcRenderer.invoke("fs:mkdir", dirPath),
        rename: (oldPath, newPath) => ipcRenderer.invoke("fs:rename", oldPath, newPath),
        trash: (targetPath) => ipcRenderer.invoke("fs:trash", targetPath),
        exists: (targetPath) => ipcRenderer.invoke("fs:exists", targetPath),
        stat: (targetPath) => ipcRenderer.invoke("fs:stat", targetPath),
    },
    path: {
        join: (...parts) => path.join(...parts),
        basename: (p, ext) => path.basename(p, ext),
        dirname: (p) => path.dirname(p),
        extname: (p) => path.extname(p),
        sep: path.sep,
    },
});
if (process.platform === "darwin") {
    document.addEventListener("DOMContentLoaded", () => {
        document.documentElement.classList.add("electron-mac");
    });
}
