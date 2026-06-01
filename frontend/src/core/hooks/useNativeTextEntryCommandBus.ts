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
  // Route menu-dispatched commands (the Edit menu / Electron native menu) to
  // the focused native text input.
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

  // Direct Cmd/Ctrl+A guarantee for plain text fields (tab-title rename,
  // sidebar inline rename, settings / username / password inputs, …).
  //
  // The menu-command route above only fires when Electron's native "Select
  // All" accelerator actually round-trips a command back to the renderer.
  // That hand-off is fragile (focused-window routing, multi-window menus,
  // IPC timing); if it drops, Cmd+A in an input does nothing — because the
  // native menu accelerator ALSO suppresses the input's built-in select-all.
  // Handling the keystroke directly here makes Cmd+A reliable in every case
  // the keystroke reaches the renderer (always in the browser; and in
  // Electron whenever the accelerator doesn't consume it first).
  //
  // We deliberately bail for the TipTap surface (isNativeTextEntry is false
  // there) so the document editor keeps its own ProseMirror select-all.
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

  // Escape leaves a focused plain text field: it clears the (possibly
  // select-all'd) selection and removes the cursor. Runs in the bubble phase
  // so a field's own Escape handling (e.g. cancel-rename) happens first — we
  // just guarantee focus actually leaves the field afterwards.
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

  // Clicking outside a focused plain text field blurs it. The browser only
  // moves focus away when you click another *focusable* control, so a click
  // on empty space / a plain label / a non-interactive div would otherwise
  // leave the field focused with its cursor still in it. We cover that gap.
  useEffect(() => {
    const onMouseDownOutside = (event: MouseEvent) => {
      const active = typeof document !== "undefined" ? document.activeElement : null
      if (!isNativeTextEntry(active)) return

      const target = event.target as Element | null
      if (!target) return

      // Click inside the field itself — leave it focused.
      if (target === active || (active as HTMLElement).contains(target)) return
      // Clicking another focusable control moves focus natively — let it.
      if (target.closest("input, textarea, select, button, a, [contenteditable]:not([contenteditable='false']), [tabindex]")) return

      ;(active as HTMLElement).blur()
    }

    window.addEventListener("mousedown", onMouseDownOutside, true)
    return () => {
      window.removeEventListener("mousedown", onMouseDownOutside, true)
    }
  }, [])
}
