import { useCallback, useEffect, useState } from "react"

const LOCAL_ROOT_KEY = "ivoryscribe.local.rootFolder"
const AUTO_CREATE_DEFAULT_ROOT_KEY = "ivoryscribe.local.autoCreateDefaultRoot"
export const ROOT_OVERRIDE_QUERY_PARAM = "rootOverride"
export const OPEN_FILE_QUERY_PARAM = "openFile"

function readRootOverrideFromLocation(): string | null {
  if (typeof window === "undefined") return null
  try {
    const params = new URLSearchParams(window.location.search)
    const value = params.get(ROOT_OVERRIDE_QUERY_PARAM)
    return value && value.length > 0 ? value : null
  } catch {
    return null
  }
}

export function readOpenFileFromLocation(): string | null {
  if (typeof window === "undefined") return null
  try {
    const params = new URLSearchParams(window.location.search)
    const value = params.get(OPEN_FILE_QUERY_PARAM)
    return value && value.length > 0 ? value : null
  } catch {
    return null
  }
}

export function buildRootOverrideUrl(absoluteFolderPath: string, openFilePath?: string): string {
  const url = new URL(window.location.href)
  url.search = ""
  url.hash = ""
  url.searchParams.set(ROOT_OVERRIDE_QUERY_PARAM, absoluteFolderPath)
  if (openFilePath) url.searchParams.set(OPEN_FILE_QUERY_PARAM, openFilePath)
  return url.toString()
}

export function isPathInsideRoot(filePath: string, rootPath: string, sep: string): boolean {
  if (!filePath || !rootPath) return false
  const normalize = (p: string) => {
    let out = p.replace(/[/\\]+$/, "")
    return out
  }
  const file = normalize(filePath)
  const root = normalize(rootPath)
  return file === root || file.startsWith(root + sep)
}

export function isElectronEnv(): boolean {
  return typeof window !== "undefined" && !!window.electronAPI?.fs
}

export function openInNewItemLabel(): "Open in New Tab" | "Open in New Window" {
  return typeof window !== "undefined" && window.electronAPI ? "Open in New Window" : "Open in New Tab"
}

export function getStoredLocalRoot(): string | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(LOCAL_ROOT_KEY)
    return raw && raw.length > 0 ? raw : null
  } catch {
    return null
  }
}

export function setStoredLocalRoot(path: string | null): void {
  if (typeof window === "undefined") return
  try {
    if (path) {
      window.localStorage.setItem(LOCAL_ROOT_KEY, path)
    } else {
      window.localStorage.removeItem(LOCAL_ROOT_KEY)
    }
  } catch {
  }
}

export function getStoredAutoCreateDefaultRoot(): boolean {
  if (typeof window === "undefined") return true
  try {
    return window.localStorage.getItem(AUTO_CREATE_DEFAULT_ROOT_KEY) !== "false"
  } catch {
    return true
  }
}

export function setStoredAutoCreateDefaultRoot(enabled: boolean): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(AUTO_CREATE_DEFAULT_ROOT_KEY, enabled ? "true" : "false")
  } catch {
  }
}

export type UseLocalRootResult = {
  root: string | null
  isElectron: boolean
  isReady: boolean
  choose: () => Promise<string | null>
  clear: () => void
  autoCreateDefaultRoot: boolean
  setAutoCreateDefaultRoot: (enabled: boolean) => void
}

export function useLocalRoot(): UseLocalRootResult {
  const [root, setRoot] = useState<string | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [autoCreateDefaultRoot, setAutoCreateDefaultRootState] = useState<boolean>(
    () => getStoredAutoCreateDefaultRoot(),
  )
  const isElectron = isElectronEnv()

  useEffect(() => {
    let cancelled = false
    async function bootstrap() {
      const fs = window.electronAPI?.fs

      const override = readRootOverrideFromLocation()
      if (override && fs) {
        try {
          if (await fs.exists(override)) {
            if (!cancelled) {
              setRoot(override)
              setIsReady(true)
            }
            return
          }
        } catch (err) {
          console.warn("[localRoot] rootOverride check failed:", override, err)
        }
      }

      const stored = getStoredLocalRoot()

      if (stored && fs) {
        try {
          if (await fs.exists(stored)) {
            if (!cancelled) {
              setRoot(stored)
              setIsReady(true)
            }
            return
          }
          console.warn("[localRoot] stored workspace not found on disk:", stored)
        } catch (err) {
          console.warn("[localRoot] could not check stored workspace:", stored, err)
        }
      }

      if (!fs?.getDefaultRoot) {
        if (!cancelled) setIsReady(true)
        return
      }
      try {
        const defaultRoot = await fs.getDefaultRoot({ create: getStoredAutoCreateDefaultRoot() })
        if (cancelled) return
        if (!defaultRoot) {
          console.warn("[localRoot] no default workspace (auto-create is off and none exists)")
          return
        }
        if (!stored) setStoredLocalRoot(defaultRoot)
        setRoot(defaultRoot)
      } catch (err) {
        console.error("[localRoot] getDefaultRoot failed:", err)
      } finally {
        if (!cancelled) setIsReady(true)
      }
    }
    void bootstrap()
    return () => { cancelled = true }
  }, [])

  const choose = useCallback(async (): Promise<string | null> => {
    const fs = window.electronAPI?.fs
    if (!fs) return null
    const next = await fs.selectDirectory({
      title: "Choose your Ivoryscribe workspace folder",
      defaultPath: getStoredLocalRoot() ?? undefined,
    })
    if (next) {
      setStoredLocalRoot(next)
      setRoot(next)
    }
    return next
  }, [])

  const clear = useCallback(() => {
    setStoredLocalRoot(null)
    setRoot(null)
  }, [])

  const setAutoCreateDefaultRoot = useCallback((enabled: boolean) => {
    setStoredAutoCreateDefaultRoot(enabled)
    setAutoCreateDefaultRootState(enabled)
    if (!enabled) return
    const fs = window.electronAPI?.fs
    if (!fs?.getDefaultRoot) return
    void (async () => {
      try {
        const defaultRoot = await fs.getDefaultRoot({ create: true })
        if (!defaultRoot) return
        setRoot((current) => {
          if (current) return current
          setStoredLocalRoot(defaultRoot)
          return defaultRoot
        })
      } catch {
      }
    })()
  }, [])

  return { root, isElectron, isReady, choose, clear, autoCreateDefaultRoot, setAutoCreateDefaultRoot }
}
