// Shared handling for Edit-menu commands (Cmd+A, Cmd+C, Cmd+V, …) when
// focus is sitting in a regular text input rather than in a document editor
// (TipTap, Markdown, plaintext).
//
// In Electron, the native menu's accelerators consume the keystroke before
// the browser can apply its built-in `<input>` behavior — so without an
// explicit handler, Cmd+A in a rename modal or settings field does nothing.
// The per-editor command bus used to cover this, but only when an editor
// happened to be mounted. Lifting the native-input branch into a single
// shared module lets us install one global listener (see
// `useNativeTextEntryCommandBus`) that is *always* active, and lets the
// per-editor bus reuse the same focus check to bail cleanly when the global
// handler has already done its job.

import type { EditorCommand } from "../events/editorEvents"

/** TipTap mounts its contenteditable with the ProseMirror class. Anything
 *  inside that subtree is owned by the editor — `isNativeTextEntry` returns
 *  false so the per-editor bus can apply TipTap-native commands instead. */
const EDITOR_SURFACE_SELECTOR = ".ProseMirror"

/** `<input>` types that behave like text fields and therefore expect
 *  Cmd+A / copy / paste semantics. Anything else (checkbox, radio, range, …)
 *  is left alone. */
const TEXT_INPUT_TYPES = new Set([
  "text",
  "search",
  "url",
  "tel",
  "password",
  "email",
  "number",
  "",
])

/** True iff `el` is a plain text input / textarea / contentEditable that
 *  lives OUTSIDE any TipTap editor — i.e. somewhere a user expects native
 *  Cmd+A / copy / paste semantics. */
export function isNativeTextEntry(el: Element | null): boolean {
  if (!el || !(el instanceof HTMLElement)) return false
  if (el.closest(EDITOR_SURFACE_SELECTOR)) return false
  if (el instanceof HTMLInputElement) return TEXT_INPUT_TYPES.has(el.type ?? "text")
  if (el instanceof HTMLTextAreaElement) return true
  if (el.isContentEditable) return true
  return false
}

/** Read clipboard text, preferring Electron's main-process clipboard (which
 *  never gets blocked for permission) and falling back to the renderer's
 *  async clipboard API for the web build. Returns "" on any failure so
 *  callers can `if (!text) return` cleanly. */
export async function readClipboardText(): Promise<string> {
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

/** Apply an editor command directly to a focused native text input. Safe to
 *  call for every EditorCommand — unsupported variants no-op. */
export async function runNativeTextEntryCommand(
  command: EditorCommand,
  activeElement: HTMLElement,
): Promise<void> {
  if (typeof document === "undefined") return

  switch (command) {
    case "select-all":
      if (activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement) {
        activeElement.select()
      } else {
        document.execCommand("selectAll")
      }
      return
    case "paste":
    case "paste-plain": {
      // Textareas / inputs are plain-text surfaces, so regular paste and
      // paste-plain are equivalent here. execCommand("paste") is blocked in
      // modern Electron renderer contexts (no user activation when fired
      // from a menu accelerator), so we read the clipboard via the Electron
      // main process (always works) and inject via execCommand("insertText",
      // …) which fires the input event so React's controlled <textarea>
      // updates.
      const text = await readClipboardText()
      if (text) document.execCommand("insertText", false, text)
      return
    }
    case "copy":
    case "cut":
    case "bold":
    case "italic":
    case "underline":
    case "delete":
    case "undo":
    case "redo":
      document.execCommand(command)
      return
  }
}
