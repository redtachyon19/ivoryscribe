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
    }
  }
}
