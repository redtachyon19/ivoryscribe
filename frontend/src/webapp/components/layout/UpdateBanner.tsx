import { useEffect, useState } from "react"
import type { UpdaterEvent } from "../../../electron"
import "./UpdateBanner.css"

/**
 * In-app desktop update prompt (Electron only). Listens to the main process
 * auto-updater and walks the user through available → download → restart.
 * Renders nothing in the web build (no `window.electronAPI.updater`) or when
 * there's no update to act on.
 */
export default function UpdateBanner() {
  const [event, setEvent] = useState<UpdaterEvent | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const updater = window.electronAPI?.updater
    if (!updater) return
    return updater.onEvent((next) => {
      setEvent(next)
      // A newly-available or ready-to-install update should resurface even if
      // the user dismissed an earlier prompt this session.
      if (next.status === "available" || next.status === "downloaded") {
        setDismissed(false)
      }
    })
  }, [])

  if (!event || dismissed) return null
  if (event.status !== "available" && event.status !== "downloading" && event.status !== "downloaded") {
    return null
  }

  const updater = window.electronAPI?.updater

  return (
    <div className="update-banner" role="status" aria-live="polite">
      {event.status === "available" && (
        <>
          <span className="update-banner__text">A new version ({event.version}) is available.</span>
          <div className="update-banner__actions">
            <button
              type="button"
              className="update-banner__btn update-banner__btn--primary"
              onClick={() => updater?.download()}
            >
              Download
            </button>
            <button type="button" className="update-banner__btn" onClick={() => setDismissed(true)}>
              Later
            </button>
          </div>
        </>
      )}

      {event.status === "downloading" && (
        <>
          <span className="update-banner__text">Downloading update… {event.percent}%</span>
          <div className="update-banner__progress" aria-hidden={true}>
            <div className="update-banner__progress-fill" style={{ width: `${event.percent}%` }} />
          </div>
        </>
      )}

      {event.status === "downloaded" && (
        <>
          <span className="update-banner__text">Update {event.version} is ready to install.</span>
          <div className="update-banner__actions">
            <button
              type="button"
              className="update-banner__btn update-banner__btn--primary"
              onClick={() => updater?.install()}
            >
              Restart &amp; install
            </button>
            <button type="button" className="update-banner__btn" onClick={() => setDismissed(true)}>
              Later
            </button>
          </div>
        </>
      )}
    </div>
  )
}
