import { useEffect, useState } from "react"

const VIEW_FADE_DURATION_MS = 240

export function useViewTransition(setView: (v: "projects" | "editor") => void) {
  const [viewFadePhase, setViewFadePhase] = useState<"idle" | "fading-out" | "fading-in">("idle")

  useEffect(() => {
    if (viewFadePhase !== "fading-out") return
    const id = window.setTimeout(() => { setView("projects"); setViewFadePhase("fading-in") }, VIEW_FADE_DURATION_MS)
    return () => { window.clearTimeout(id) }
  }, [viewFadePhase, setView])

  useEffect(() => {
    if (viewFadePhase !== "fading-in") return
    const id = window.requestAnimationFrame(() => { setViewFadePhase("idle") })
    return () => { window.cancelAnimationFrame(id) }
  }, [viewFadePhase])

  const returnToLibrary = () => { if (viewFadePhase === "idle") setViewFadePhase("fading-out") }

  return { viewFadePhase, returnToLibrary }
}
