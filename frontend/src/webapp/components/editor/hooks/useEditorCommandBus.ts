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

      const activeElement = typeof document !== "undefined" ? document.activeElement : null
      if (isNativeTextEntry(activeElement)) return

      if (!editor) return

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
