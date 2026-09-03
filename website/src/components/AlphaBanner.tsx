import { X } from "lucide-react"
import { useEffect, useState } from "react"
import "./AlphaBanner.css"

const STORAGE_KEY = "ivoryscribe:alpha-banner-dismissed"

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
