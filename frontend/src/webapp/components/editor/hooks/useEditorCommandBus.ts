// Bridges global menu commands (Edit menu, Format menu) to a TipTap editor
// instance via the EDITOR_COMMAND_EVENT bus.
//
// Electron's native menu has accelerators (Cmd+A, Cmd+C, Cmd+V, …) that fire
// regardless of which element has focus. Without the focus-aware routing
// below, Cmd+A in a regular `<input>` would steal focus to TipTap and select
// everything in the editor; Cmd+C in an input would copy the TipTap
// selection instead of the input's. So every command first checks where
// focus actually lives:
//
//   • TipTap surface OR nothing focused → run the editor command
//   • Plain text field / textarea / contentEditable outside TipTap → route to
//     the native equivalent (`input.select()`, `document.execCommand(...)`,
//     etc.) so the OS shortcut behaves like it would in any other app
//
// `paste` falls back to `navigator.clipboard.readText()` when
// `document.execCommand("paste")` returns false (most modern browsers).

import { useEffect } from "react"
import type { Editor as TiptapEditor } from "@tiptap/react"
import { EDITOR_COMMAND_EVENT, type EditorCommand } from "../../../../core/events/editorEvents"

type EditorCommandDetail = { command: EditorCommand }

/** Native text-entry input types that should receive Cmd+A as "select the
 *  field's text" rather than as the editor's select-all. */
const TEXT_INPUT_TYPES = new Set(["text", "search", "url", "tel", "password", "email", "number", ""])

/** True iff `el` is a regular text input / textarea / contentEditable that
 *  lives OUTSIDE the TipTap editor surface — i.e. somewhere a user expects
 *  native Cmd+A / copy / paste semantics. */
function isNativeTextEntry(el: Element | null, editor: TiptapEditor | null): boolean {
  if (!el || !(el instanceof HTMLElement)) return false
  if (editor?.view?.dom && editor.view.dom.contains(el)) return false
  if (el instanceof HTMLInputElement) return TEXT_INPUT_TYPES.has(el.type ?? "text")
  if (el instanceof HTMLTextAreaElement) return true
  if (el.isContentEditable) return true
  return false
}

export function useEditorCommandBus(editor: TiptapEditor | null) {
  useEffect(() => {
    if (!editor) return

    const onEditorCommand = async (event: Event) => {
      const command = (event as CustomEvent<EditorCommandDetail>).detail?.command
      if (!command) return

      // If the user is focused in a regular text field, defer to native
      // behavior. Crucially this does NOT call `editor.commands.focus()` —
      // that would yank focus away from the input before we could act on it.
      const activeElement = typeof document !== "undefined" ? document.activeElement : null
      if (isNativeTextEntry(activeElement, editor)) {
        switch (command) {
          case "select-all":
            if (activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement) {
              activeElement.select()
            } else if (typeof document !== "undefined") {
              document.execCommand("selectAll")
            }
            return
          case "copy":
          case "cut":
          case "paste":
          case "bold":
          case "italic":
          case "underline":
          case "delete":
            if (typeof document !== "undefined") document.execCommand(command)
            return
          case "undo":
          case "redo":
            if (typeof document !== "undefined") document.execCommand(command)
            return
        }
        return
      }

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
