// Window-perimeter "save flash" feedback bus.
//
// Two flavours, each rendered by SaveGlowOverlay as a perimeter glow that
// fades in and out:
//   • "auto"   — a background autosave just wrote to disk      → white glow
//   • "manual" — the user pressed ⌘/Ctrl+S (or File ▸ Save)    → accent glow
//
// Kept separate from editorEvents so the (large) editor bus doesn't have to
// own this purely-cosmetic signal. The manual-save *request* still rides on
// editorEvents' APP_SAVE_PROJECT_EVENT; this bus is only the visual ack.

export const SAVE_FLASH_EVENT = "app:save-flash"

export type SaveFlashKind = "auto" | "manual"

export function emitSaveFlash(kind: SaveFlashKind) {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent<{ kind: SaveFlashKind }>(SAVE_FLASH_EVENT, { detail: { kind } }))
}

/** Subscribe to save flashes. Returns an unsubscribe function. */
export function onSaveFlash(handler: (kind: SaveFlashKind) => void): () => void {
  if (typeof window === "undefined") return () => {}
  const listener = (event: Event) => {
    const kind = (event as CustomEvent<{ kind: SaveFlashKind }>).detail?.kind
    if (kind) handler(kind)
  }
  window.addEventListener(SAVE_FLASH_EVENT, listener as EventListener)
  return () => window.removeEventListener(SAVE_FLASH_EVENT, listener as EventListener)
}
