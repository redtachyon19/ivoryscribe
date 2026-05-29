// Application-global handler for editor commands (Cmd+A, Cmd+C, Cmd+V, …)
// when focus lives in a regular text input — rename modals, sidebar inline
// renames, settings fields, find-and-replace inputs, anything outside the
// document editor.
//
// Mounted ONCE at the app root (see `useAppOrchestration`) so it survives
// view changes and is active even when no document editor exists. The
// per-editor `useEditorCommandBus` defers to this hook by bailing whenever
// `isNativeTextEntry` is true, so a command is never handled twice.

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
}
