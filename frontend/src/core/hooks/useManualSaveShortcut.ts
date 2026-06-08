// App-wide save shortcuts:
//   • ⌘/Ctrl+S   → save (autosave checkpoint)
//   • ⌘/Ctrl+⇧+S → Save Version (manual checkpoint)
//
// The save itself — and its single perimeter-glow confirmation — happens
// downstream in useProjectVersioning, which listens for the matching event and
// emits the glow as part of the save. This hook only fires the request, so the
// glow is never a second, separate phenomenon from the save.
//
// The native "File ▸ Save" / "Save Version" menu accelerators don't reliably
// reach the renderer when the editor has focus, so this binds the keys directly
// (capture phase, so it wins over editor handlers and the browser's "Save page"
// dialog) and fires the same requests the menu items do. (The version handler
// coalesces a native-accelerator + this keydown double-fire.)

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
