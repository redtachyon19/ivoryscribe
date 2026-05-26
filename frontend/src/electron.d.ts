export {}

export type FsEntry = {
  name: string
  path: string
  kind: "file" | "directory"
  size: number
  modifiedAt: number
}

export type FsStat = {
  size: number
  modifiedAt: number
  isDirectory: boolean
  isFile: boolean
}

declare global {
  interface Window {
    electronAPI?: {
      platform: string
      minimize: () => void
      maximize: () => void
      close: () => void
      isMaximized: () => Promise<boolean>
      isFullScreen: () => Promise<boolean>
      addSpellCheckerWord?: (word: string) => Promise<boolean>
      removeSpellCheckerWord?: (word: string) => Promise<boolean>
      updateMenu: (items: unknown) => void
      onMenuCommand: (callback: (commandId: string) => void) => () => void
      /** Subscribe to OS-driven file-open events (Finder double-click on a
       *  .tusk/.tusks, second-instance launch with file args, or cold-start
       *  argv on Win/Linux). Returns an unsubscribe function. Main buffers
       *  paths until the renderer subscribes, then flushes. */
      onOpenPath?: (callback: (filePath: string) => void) => () => void

      fs: {
        selectDirectory: (opts?: { defaultPath?: string; title?: string }) => Promise<string | null>
        getDefaultRoot: () => Promise<string>
        readFile: (filePath: string) => Promise<string>
        /** Binary read for non-utf-8 files (PDFs, images). */
        readFileBinary: (filePath: string) => Promise<Uint8Array>
        writeFile: (filePath: string, contents: string) => Promise<void>
        listDirectory: (dirPath: string) => Promise<FsEntry[]>
        mkdir: (dirPath: string) => Promise<void>
        rename: (oldPath: string, newPath: string) => Promise<void>
        trash: (targetPath: string) => Promise<void>
        /** Reveal a file or directory in the OS file manager (Finder on
         *  macOS, File Explorer on Windows, Files on Linux). */
        showItemInFolder: (targetPath: string) => void
        exists: (targetPath: string) => Promise<boolean>
        stat: (targetPath: string) => Promise<FsStat>
        /** macOS only. Tint the macOS system folder icon to the given
         *  hex color and install it as the folder's custom icon
         *  (`Icon\r` + FinderInfo bit). Pass empty / null to clear the
         *  custom icon and revert to the system default. Resolves
         *  `{ ok, error? }`. */
        setMacFolderIconColor: (targetPath: string, hex: string | null) => Promise<{ ok: boolean; error?: string }>
      }

      path: {
        join: (...parts: string[]) => string
        basename: (p: string, ext?: string) => string
        dirname: (p: string) => string
        extname: (p: string) => string
        sep: string
      }

      clipboard?: {
        /** Read plain-text from the system clipboard via Electron's main
         *  process. Reliable even when `navigator.clipboard.readText()`
         *  is blocked by missing user-activation. */
        readText: () => Promise<string>
      }
    }
  }
}
