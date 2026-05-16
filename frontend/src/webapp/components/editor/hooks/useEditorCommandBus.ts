// Bridges global menu commands (Edit menu, Format menu) to a TipTap editor
// instance via the EDITOR_COMMAND_EVENT bus. Each command name maps to a
// chain operation, except for `underline`, `copy`, `cut`, `paste` which fall
// back to `document.execCommand` so OS clipboard and native shortcuts behave
// consistently.
//
// `paste` additionally tries `navigator.clipboard.readText()` as a fallback
// for browsers where `execCommand("paste")` returns false (most modern
// browsers).

import { useEffect } from "react"
import type { Editor as TiptapEditor } from "@tiptap/react"
import { EDITOR_COMMAND_EVENT, type EditorCommand } from "../../../../core/events/editorEvents"

type EditorCommandDetail = { command: EditorCommand }

export function useEditorCommandBus(editor: TiptapEditor | null) {
  useEffect(() => {
    if (!editor) return

    const onEditorCommand = async (event: Event) => {
      const command = (event as CustomEvent<EditorCommandDetail>).detail?.command
      if (!command) return

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
        case "paste":
          if (typeof document !== "undefined" && document.execCommand("paste")) return
          if (typeof navigator !== "undefined" && navigator.clipboard?.readText) {
            try {
              const text = await navigator.clipboard.readText()
              if (text) editor.chain().focus().insertContent(text).run()
            } catch {
              /* clipboard permission unavailable */
            }
          }
          return
      }
    }

    window.addEventListener(EDITOR_COMMAND_EVENT, onEditorCommand as EventListener)
    return () => {
      window.removeEventListener(EDITOR_COMMAND_EVENT, onEditorCommand as EventListener)
    }
  }, [editor])
}
