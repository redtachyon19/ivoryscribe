export {}

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
    }
  }
}
