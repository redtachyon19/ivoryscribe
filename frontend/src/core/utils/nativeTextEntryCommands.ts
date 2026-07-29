import type { EditorCommand } from "../events/editorEvents"

const EDITOR_SURFACE_SELECTOR = ".ProseMirror"

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

export function isNativeTextEntry(el: Element | null): boolean {
  if (!el || !(el instanceof HTMLElement)) return false
  if (el.closest(EDITOR_SURFACE_SELECTOR)) return false
  if (el instanceof HTMLInputElement) return TEXT_INPUT_TYPES.has(el.type ?? "text")
  if (el instanceof HTMLTextAreaElement) return true
  if (el.isContentEditable) return true
  return false
}

export async function readClipboardText(): Promise<string> {
  if (typeof window !== "undefined" && window.electronAPI?.clipboard?.readText) {
    try {
      return await window.electronAPI.clipboard.readText()
    } catch {
    }
  }
  if (typeof navigator !== "undefined" && navigator.clipboard?.readText) {
    try {
      return await navigator.clipboard.readText()
    } catch {
    }
  }
  return ""
}

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
