import { useCallback, useMemo, useRef, useState } from "react"

type Path = number[]

const CLOSE_DELAY_MS = 240

function isPrefixPath(prefix: Path, full: Path) {
  if (prefix.length > full.length) {
    return false
  }

  for (let index = 0; index < prefix.length; index += 1) {
    if (prefix[index] !== full[index]) {
      return false
    }
  }

  return true
}

export function useMenuState() {
  const [openPath, setOpenPath] = useState<Path>([])
  const closeTimeoutRef = useRef<number | null>(null)

  const cancelCloseTimer = useCallback(() => {
    if (closeTimeoutRef.current !== null) {
      window.clearTimeout(closeTimeoutRef.current)
      closeTimeoutRef.current = null
    }
  }, [])

  const closeAllMenus = useCallback(() => {
    cancelCloseTimer()
    setOpenPath([])
  }, [cancelCloseTimer])

  const scheduleCloseAll = useCallback(() => {
    cancelCloseTimer()
    closeTimeoutRef.current = window.setTimeout(() => {
      setOpenPath([])
      closeTimeoutRef.current = null
    }, CLOSE_DELAY_MS)
  }, [cancelCloseTimer])

  const openMenuPath = useCallback(
    (path: Path) => {
      cancelCloseTimer()
      setOpenPath(path)
    },
    [cancelCloseTimer],
  )

  const isMenuOpen = useCallback(
    (path: Path) => {
      if (!path.length || !openPath.length) {
        return false
      }
      return isPrefixPath(path, openPath)
    },
    [openPath],
  )

  return useMemo(
    () => ({
      closeAllMenus,
      openMenuPath,
      isMenuOpen,
      cancelCloseTimer,
      scheduleCloseAll,
    }),
    [closeAllMenus, openMenuPath, isMenuOpen, cancelCloseTimer, scheduleCloseAll],
  )
}
