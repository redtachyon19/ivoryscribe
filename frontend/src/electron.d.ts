export {}

export type UpdaterEvent =
  | { status: "checking" }
  | { status: "available"; version: string }
  | { status: "not-available" }
  | { status: "downloading"; percent: number }
  | { status: "downloaded"; version: string }
  | { status: "error"; message: string }

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
      onOpenPath?: (callback: (filePath: string) => void) => () => void
      notifyOpenPathReady?: () => void
      openFileInNewWindow?: () => void

      getVersion: () => Promise<string>

      fs: {
        selectDirectory: (opts?: { defaultPath?: string; title?: string }) => Promise<string | null>
        getDefaultRoot: (options?: { create?: boolean }) => Promise<string | null>
        readFile: (filePath: string) => Promise<string>
        readFileBinary: (filePath: string) => Promise<Uint8Array>
        writeFile: (filePath: string, contents: string) => Promise<void>
        writeFileBinary: (filePath: string, data: Uint8Array) => Promise<void>
        listDirectory: (dirPath: string) => Promise<FsEntry[]>
        mkdir: (dirPath: string) => Promise<void>
        rename: (oldPath: string, newPath: string) => Promise<void>
        trash: (targetPath: string) => Promise<void>
        showItemInFolder: (targetPath: string) => void
        exists: (targetPath: string) => Promise<boolean>
        stat: (targetPath: string) => Promise<FsStat>
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
        readText: () => Promise<string>
      }

      print?: {
        toPdf: (html: string) => Promise<{ pdf: Uint8Array; chapterStartPages: number[] }>
      }

      updater?: {
        check: () => void
        download: () => void
        install: () => void
        onEvent: (callback: (event: UpdaterEvent) => void) => () => void
      }
    }
  }
}

declare global {
  const __APP_VERSION__: string
}
