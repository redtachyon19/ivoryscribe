import { X } from "lucide-react"
import { useEffect, useState } from "react"
import "./AlphaBanner.css"

const STORAGE_KEY = "ivoryscribe:alpha-banner-dismissed"

/**
 * Dismissible accent-coloured notice pinned to the top of the marketing site.
 * Rendered only on the landing routes (see App.tsx). While it's visible it adds
 * `has-alpha-banner` to <html> so the fixed landing header + page reserve room
 * for it; dismissal is remembered in localStorage so it doesn't nag on reload.
 */
export default function AlphaBanner() {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "1"
    } catch {
      return false
    }
  })

  useEffect(() => {
    const root = document.documentElement
    if (dismissed) {
      root.classList.remove("has-alpha-banner")
      return
    }

    root.classList.add("has-alpha-banner")
    return () => {
      root.classList.remove("has-alpha-banner")
    }
  }, [dismissed])

  if (dismissed) {
    return null
  }

  const handleDismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, "1")
    } catch {
      // Storage may be unavailable (private mode) — dismiss for this session only.
    }
    setDismissed(true)
  }

  return (
    <div className="alpha-banner" role="status">
      <p className="alpha-banner__text">
        ivoryscribe is in <strong>alpha</strong> — things may change or break while we polish. Thanks for testing!
      </p>
      <button
        type="button"
        className="alpha-banner__close"
        aria-label="Dismiss alpha notice"
        onClick={handleDismiss}
      >
        <X size={16} aria-hidden={true} />
      </button>
    </div>
  )
}
