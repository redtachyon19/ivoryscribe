// A non-interactive perimeter glow that pulses (fades in and out) whenever the
// app saves: white for a background autosave, the palette accent for a manual
// ⌘/Ctrl+S. Driven entirely by the SAVE_FLASH_EVENT bus (see saveEvents.ts).
//
// Each flash is keyed by an incrementing id so the same CSS animation replays
// on rapid, repeated saves (a fresh element restarts the keyframes); the
// element unmounts itself on animationend.

import { useEffect, useState } from "react"
import { onSaveFlash, type SaveFlashKind } from "../../../core/events/saveEvents"
import "./SaveGlowOverlay.css"

type Pulse = { kind: SaveFlashKind; id: number }

export default function SaveGlowOverlay() {
  const [pulse, setPulse] = useState<Pulse | null>(null)

  useEffect(() => onSaveFlash((kind) => {
    setPulse((prev) => ({ kind, id: (prev?.id ?? 0) + 1 }))
  }), [])

  if (!pulse) return null

  return (
    <div
      key={pulse.id}
      className={`save-glow save-glow--${pulse.kind}`}
      aria-hidden="true"
      // Clear only if no newer pulse has replaced this one.
      onAnimationEnd={() => setPulse((prev) => (prev?.id === pulse.id ? null : prev))}
    />
  )
}
