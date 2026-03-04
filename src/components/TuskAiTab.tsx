import { useState } from "react"
import "./TuskAiTab.css"

type TuskAiTabProps = {
  hideToggle?: boolean
}

export default function TuskAiTab({ hideToggle = false }: TuskAiTabProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="tuskai-tab" aria-hidden={!isOpen}>
      <button
        type="button"
        className={`tuskai-tab__toggle ${isOpen ? "tuskai-tab__toggle--shifted" : ""} ${hideToggle ? "tuskai-tab__toggle--hidden" : ""}`.trim()}
        onClick={() => {
          setIsOpen((open) => !open)
        }}
      >
        {isOpen ? "Hide Tusk AI" : "Show Tusk AI"}
      </button>

      <button
        type="button"
        className={`tuskai-tab__overlay ${isOpen ? "tuskai-tab__overlay--open" : ""}`.trim()}
        onClick={() => {
          setIsOpen(false)
        }}
        aria-label="Close Tusk AI tab"
      />

      <aside className={`tuskai-tab__panel ${isOpen ? "tuskai-tab__panel--open" : ""}`.trim()}>
        <header className="tuskai-tab__header">
          <h2>TUSKAI TAB</h2>
        </header>
        <p className="tuskai-tab__message">Oops. Looks like you haven't activated Tusk AI yet.</p>
      </aside>
    </div>
  )
}
