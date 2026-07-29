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
      onAnimationEnd={() => setPulse((prev) => (prev?.id === pulse.id ? null : prev))}
    />
  )
}
