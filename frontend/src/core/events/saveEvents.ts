export const SAVE_FLASH_EVENT = "app:save-flash"

export type SaveFlashKind = "auto" | "manual"

export function emitSaveFlash(kind: SaveFlashKind) {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent<{ kind: SaveFlashKind }>(SAVE_FLASH_EVENT, { detail: { kind } }))
}

export function onSaveFlash(handler: (kind: SaveFlashKind) => void): () => void {
  if (typeof window === "undefined") return () => {}
  const listener = (event: Event) => {
    const kind = (event as CustomEvent<{ kind: SaveFlashKind }>).detail?.kind
    if (kind) handler(kind)
  }
  window.addEventListener(SAVE_FLASH_EVENT, listener as EventListener)
  return () => window.removeEventListener(SAVE_FLASH_EVENT, listener as EventListener)
}
