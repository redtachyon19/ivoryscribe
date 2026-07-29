import { useEffect } from "react"
import { EDITOR_COMMAND_EVENT, type EditorCommand } from "../events/editorEvents"
import { isNativeTextEntry, runNativeTextEntryCommand } from "../utils/nativeTextEntryCommands"

type EditorCommandDetail = { command: EditorCommand }

export function useNativeTextEntryCommandBus() {
  useEffect(() => {
    const onCommand = (event: Event) => {
      const command = (event as CustomEvent<EditorCommandDetail>).detail?.command
      if (!command) return

      const activeElement = typeof document !== "undefined" ? document.activeElement : null
      if (!isNativeTextEntry(activeElement)) return

      void runNativeTextEntryCommand(command, activeElement as HTMLElement)
    }

    window.addEventListener(EDITOR_COMMAND_EVENT, onCommand)
    return () => {
      window.removeEventListener(EDITOR_COMMAND_EVENT, onCommand)
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return
      if (!(event.metaKey || event.ctrlKey) || event.shiftKey || event.altKey) return
      const isSelectAll = event.code === "KeyA" || event.key.toLowerCase() === "a"
      if (!isSelectAll) return

      const activeElement = typeof document !== "undefined" ? document.activeElement : null
      if (!isNativeTextEntry(activeElement)) return

      event.preventDefault()
      void runNativeTextEntryCommand("select-all", activeElement as HTMLElement)
    }

    window.addEventListener("keydown", onKeyDown, true)
    return () => {
      window.removeEventListener("keydown", onKeyDown, true)
    }
  }, [])

  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      const active = typeof document !== "undefined" ? document.activeElement : null
      if (isNativeTextEntry(active)) (active as HTMLElement).blur()
    }

    window.addEventListener("keydown", onEscape)
    return () => {
      window.removeEventListener("keydown", onEscape)
    }
  }, [])

  useEffect(() => {
    const onMouseDownOutside = (event: MouseEvent) => {
      const active = typeof document !== "undefined" ? document.activeElement : null
      if (!isNativeTextEntry(active)) return

      const target = event.target as Element | null
      if (!target) return

      if (target === active || (active as HTMLElement).contains(target)) return
      if (target.closest("input, textarea, select, button, a, [contenteditable]:not([contenteditable='false']), [tabindex]")) return

      ;(active as HTMLElement).blur()
    }

    window.addEventListener("mousedown", onMouseDownOutside, true)
    return () => {
      window.removeEventListener("mousedown", onMouseDownOutside, true)
    }
  }, [])
}
