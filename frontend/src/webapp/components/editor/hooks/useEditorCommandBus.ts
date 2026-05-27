// Bridges global menu commands (Edit menu, Format menu) to a TipTap editor
// instance via the EDITOR_COMMAND_EVENT bus.
//
// Electron's native menu has accelerators (Cmd+A, Cmd+C, Cmd+V, …) that fire
// regardless of which element has focus. Without focus-aware routing,
// Cmd+A in a regular `<input>` would steal focus to TipTap and select
// everything in the editor; Cmd+C in an input would copy the TipTap
// selection instead of the input's. So every command first checks where
// focus actually lives:
//
//   • Native text entry (input / textarea / contentEditable OUTSIDE TipTap)
//       → handled by the global `useNativeTextEntryCommandBus` mounted at
//         the app root. This hook bails so we don't double-fire.
//   • TipTap surface OR nothing focused → run the editor command below.
//
// Pass `editor = null` from non-TipTap editors (Markdown, plaintext) — the
// hook installs a no-op listener so TipTap-only commands simply bail. The
// native-text-entry routing happens globally and covers their <textarea>
// surfaces anyway.

import { useEffect } from "react"
import type { Editor as TiptapEditor } from "@tiptap/react"
import {
  EDITOR_COMMAND_EVENT,
  requestEditorCommand,
  type EditorCommand,
} from "../../../../core/events/editorEvents"
import { isNativeTextEntry, readClipboardText } from "../../../../core/utils/nativeTextEntryCommands"

type EditorCommandDetail = { command: EditorCommand }

export function useEditorCommandBus(editor: TiptapEditor | null) {
  useEffect(() => {
    const onEditorCommand = async (event: Event) => {
      const command = (event as CustomEvent<EditorCommandDetail>).detail?.command
      if (!command) return

      // Focus in a non-editor text input? The global native-text-entry bus
      // (see useNativeTextEntryCommandBus) already handled it — bail so we
      // don't yank focus into TipTap via `editor.commands.focus()` below.
      const activeElement = typeof document !== "undefined" ? document.activeElement : null
      if (isNativeTextEntry(activeElement)) return

      // No TipTap editor mounted — the textarea-based editors (Markdown,
      // plaintext) call this hook with `editor = null`. Without a TipTap
      // surface there's nothing to do for commands that target it.
      if (!editor) return

      // Default path: act on the TipTap editor.
      editor.commands.focus()

      switch (command) {
        case "undo":
          editor.chain().focus().undo().run()
          return
        case "redo":
          editor.chain().focus().redo().run()
          return
        case "bold":
          editor.chain().focus().toggleBold().run()
          return
        case "italic":
          editor.chain().focus().toggleItalic().run()
          return
        case "underline":
          if (typeof document !== "undefined") document.execCommand("underline")
          return
        case "copy":
          if (typeof document !== "undefined") document.execCommand("copy")
          return
        case "cut":
          if (typeof document !== "undefined") document.execCommand("cut")
          return
        case "select-all":
          editor.commands.selectAll()
          return
        case "delete":
          editor.commands.deleteSelection()
          return
        case "paste": {
          if (typeof document !== "undefined" && document.execCommand("paste")) return
          const text = await readClipboardText()
          if (text) editor.chain().focus().insertContent(text).run()
          return
        }
        case "paste-plain": {
          // Bypass execCommand("paste") entirely — that path inserts rich
          // HTML and is exactly what the user is trying to avoid. Read the
          // clipboard as plain text and insert it as a bare string; TipTap
          // treats string content as plain text (no marks, no nodes), so
          // the destination's current paragraph styling is preserved.
          const text = await readClipboardText()
          if (text) editor.chain().focus().insertContent(text).run()
          return
        }
      }
    }

    window.addEventListener(EDITOR_COMMAND_EVENT, onEditorCommand as EventListener)
    return () => {
      window.removeEventListener(EDITOR_COMMAND_EVENT, onEditorCommand as EventListener)
    }
  }, [editor])

  // Cmd/Ctrl + Shift + V → "Paste Without Formatting" in the web build. In
  // Electron the native menu accelerator captures this keystroke before the
  // renderer sees it, so this listener only ever fires in the browser.
  useEffect(() => {
    const onPastePlainShortcut = (event: KeyboardEvent) => {
      if (event.repeat) return
      const hasPrimaryModifier = event.metaKey || event.ctrlKey
      if (!hasPrimaryModifier || !event.shiftKey || event.altKey) return
      const isVShortcut = event.code === "KeyV" || event.key.toLowerCase() === "v"
      if (!isVShortcut) return
      event.preventDefault()
      requestEditorCommand("paste-plain")
    }
    window.addEventListener("keydown", onPastePlainShortcut, true)
    return () => {
      window.removeEventListener("keydown", onPastePlainShortcut, true)
    }
  }, [])
}
