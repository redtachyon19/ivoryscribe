// Local-workspace root: the user-chosen folder on disk that contains all
// `.tusk` books, `.tusks` presentations, and standalone `.md` / `.txt`
// documents, organized in nested subfolders.
//
// The root path is persisted in localStorage (per-machine, not per-account).

import { useCallback, useEffect, useState } from "react"

const LOCAL_ROOT_KEY = "ivoryscribe.local.rootFolder"

export function isElectronEnv(): boolean {
  return typeof window !== "undefined" && !!window.electronAPI?.fs
}

// In Electron, window.open() spawns a real BrowserWindow rather than a
// browser tab, so context-menu labels read "Open in New Window" there.
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
    // Ignore quota errors etc — localStorage isn't load-bearing here.
  }
}

export type UseLocalRootResult = {
  root: string | null
  isElectron: boolean
  isReady: boolean
  choose: () => Promise<string | null>
  clear: () => void
}

export function useLocalRoot(): UseLocalRootResult {
  const [root, setRoot] = useState<string | null>(null)
  const [isReady, setIsReady] = useState(false)
  const isElectron = isElectronEnv()

  // On first launch (or whenever the stored path is stale/missing): resolve to
  // ~/Documents/Ivoryscribe and create it if needed. The picker is still
  // available via `choose()` for users who want a different folder later.
  useEffect(() => {
    let cancelled = false
    async function bootstrap() {
      const fs = window.electronAPI?.fs
      const stored = getStoredLocalRoot()

      // Validate the stored path actually exists. If a previous broken launch
      // wrote a path that's since been deleted, fall through to the default.
      if (stored && fs) {
        try {
          if (await fs.exists(stored)) {
            if (!cancelled) {
              setRoot(stored)
              setIsReady(true)
            }
            return
          }
        } catch { /* fall through to default */ }
      }

      if (!fs?.getDefaultRoot) {
        if (!cancelled) setIsReady(true)
        return
      }
      try {
        const defaultRoot = await fs.getDefaultRoot()
        if (cancelled) return
        setStoredLocalRoot(defaultRoot)
        setRoot(defaultRoot)
      } catch {
        // Permission denied, disk full, etc. — fall back to manual picker.
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
    const next = await fs.selectDirectory({ title: "Choose your Ivoryscribe workspace folder" })
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

  return { root, isElectron, isReady, choose, clear }
}
