import { useState } from "react"
import { Brain, X } from "lucide-react"
import "./TuskAiTab.css"

type TuskAiTabProps = {
  hideToggle?: boolean
}

export default function TuskAiTab({ hideToggle = false }: TuskAiTabProps) {
  const [isOpen, setIsOpen] = useState(false)
  const toggleLabel = isOpen ? "Close Tusk AI" : "Open Tusk AI"

  return (
    <div className="tuskai-tab" aria-hidden={!isOpen}>
      <button
        type="button"
        className={`tuskai-tab__toggle ${isOpen ? "tuskai-tab__toggle--open tuskai-tab__toggle--shifted" : ""} ${hideToggle ? "tuskai-tab__toggle--hidden" : ""}`.trim()}
        aria-label={toggleLabel}
        onClick={() => {
          setIsOpen((open) => !open)
        }}
      >
        {isOpen ? <X size={14} strokeWidth={2} aria-hidden={true} /> : <Brain size={14} strokeWidth={2} aria-hidden={true} />}
        <span className="tuskai-tab__toggle-label">{toggleLabel}</span>
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
