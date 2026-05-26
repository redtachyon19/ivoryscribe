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
//
// Pass `editor = null` from non-TipTap editors (Markdown, plaintext) — the
// hook still installs a listener so the native text-entry branch handles
// the menu accelerators correctly, and TipTap-only commands simply no-op.

import { useEffect } from "react"
import type { Editor as TiptapEditor } from "@tiptap/react"
import {
  EDITOR_COMMAND_EVENT,
  requestEditorCommand,
  type EditorCommand,
} from "../../../../core/events/editorEvents"

type EditorCommandDetail = { command: EditorCommand }

/** Read clipboard text, preferring Electron's main-process clipboard
 *  (which never gets blocked for permission) and falling back to the
 *  renderer's async clipboard API for the web build. Returns "" on any
 *  failure so callers can `if (!text) return` cleanly. */
async function readClipboardText(): Promise<string> {
  if (typeof window !== "undefined" && window.electronAPI?.clipboard?.readText) {
    try {
      return await window.electronAPI.clipboard.readText()
    } catch {
      /* fall through to the web API */
    }
  }
  if (typeof navigator !== "undefined" && navigator.clipboard?.readText) {
    try {
      return await navigator.clipboard.readText()
    } catch {
      /* permission unavailable */
    }
  }
  return ""
}

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
          case "paste":
          case "paste-plain": {
            // Textareas / inputs are plain-text surfaces, so regular paste
            // and paste-plain are equivalent here. execCommand("paste") is
            // blocked in modern Electron renderer contexts (no user
            // activation when fired from a menu accelerator), so we read
            // the clipboard via the Electron main process (always works)
            // and inject via execCommand("insertText", …) which fires the
            // input event so React's controlled <textarea> updates.
            const text = await readClipboardText()
            if (text && typeof document !== "undefined") {
              document.execCommand("insertText", false, text)
            }
            return
          }
          case "copy":
          case "cut":
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

      // No TipTap editor mounted — the textarea-based editors (Markdown,
      // plaintext) call this hook with `editor = null`. Without a TipTap
      // surface there's nothing to do for commands that target it, so we
      // bail rather than crash.
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
