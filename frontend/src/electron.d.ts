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

      fs: {
        selectDirectory: (opts?: { defaultPath?: string; title?: string }) => Promise<string | null>
        getDefaultRoot: () => Promise<string>
        readFile: (filePath: string) => Promise<string>
        writeFile: (filePath: string, contents: string) => Promise<void>
        listDirectory: (dirPath: string) => Promise<FsEntry[]>
        mkdir: (dirPath: string) => Promise<void>
        rename: (oldPath: string, newPath: string) => Promise<void>
        trash: (targetPath: string) => Promise<void>
        exists: (targetPath: string) => Promise<boolean>
        stat: (targetPath: string) => Promise<FsStat>
      }

      path: {
        join: (...parts: string[]) => string
        basename: (p: string, ext?: string) => string
        dirname: (p: string) => string
        extname: (p: string) => string
        sep: string
      }
    }
  }
}
