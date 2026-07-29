import { useEffect } from "react"
import { requestAppSaveProject, requestAppSaveProjectVersion } from "../events/editorEvents"

export function useManualSaveShortcut() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return
      const hasPrimaryModifier = event.metaKey || event.ctrlKey
      if (!hasPrimaryModifier || event.altKey) return
      const isSShortcut = event.code === "KeyS" || event.key.toLowerCase() === "s"
      if (!isSShortcut) return
      event.preventDefault()
      if (event.shiftKey) requestAppSaveProjectVersion()
      else requestAppSaveProject()
    }
    window.addEventListener("keydown", onKeyDown, true)
    return () => window.removeEventListener("keydown", onKeyDown, true)
  }, [])
}
