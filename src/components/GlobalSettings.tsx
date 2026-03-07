import { Settings, X } from "lucide-react"
import { useEffect, useState } from "react"
import "./GlobalSettings.css"

type PaletteOption = {
  value: string
  label: string
}

type FontOption = {
  value: string
  label: string
}

type GlobalSettingsProps = {
  isOpen: boolean
  menuBarEnabled: boolean
  flagsEnabled: boolean
  hideTrigger?: boolean
  selectedFont: string
  globalTextEnabled: boolean
  fontSize: number
  palette: string
  paletteOptions: PaletteOption[]
  fontOptions: FontOption[]
  onToggleOpen: () => void
  onClose: () => void
  onMenuBarEnabledChange: (enabled: boolean) => void
  onFlagsEnabledChange: (enabled: boolean) => void
  onFontChange: (fontFamily: string) => void
  onGlobalTextEnabledChange: (enabled: boolean) => void
  onFontSizeChange: (fontSize: number) => void
  onPaletteChange: (palette: string) => void
}

export default function GlobalSettings({
  isOpen,
  menuBarEnabled,
  flagsEnabled,
  hideTrigger = false,
  selectedFont,
  globalTextEnabled,
  fontSize,
  palette,
  paletteOptions,
  fontOptions,
  onToggleOpen,
  onClose,
  onMenuBarEnabledChange,
  onFlagsEnabledChange,
  onFontChange,
  onGlobalTextEnabledChange,
  onFontSizeChange,
  onPaletteChange,
}: GlobalSettingsProps) {
  const [isRendered, setIsRendered] = useState(isOpen)
  const [isClosing, setIsClosing] = useState(false)
  const triggerIsLayeredAboveOverlay = isOpen || isRendered
  const triggerLabel = isOpen ? "Close Settings" : "Open Settings"

  useEffect(() => {
    if (isOpen) {
      setIsRendered(true)
      setIsClosing(false)
      return
    }

    if (!isRendered) {
      return
    }

    setIsClosing(true)
    const timeoutId = window.setTimeout(() => {
      setIsRendered(false)
      setIsClosing(false)
    }, 170)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [isOpen, isRendered])

  const overlayStateClassName = isClosing ? "global-settings__overlay--closing" : "global-settings__overlay--opening"
  const modalStateClassName = isClosing ? "global-settings__modal--closing" : "global-settings__modal--opening"

  return (
    <>
      <button
        type="button"
        className={`global-settings__trigger ${triggerIsLayeredAboveOverlay ? "global-settings__trigger--open" : ""} ${menuBarEnabled ? "global-settings__trigger--with-menu" : ""} ${hideTrigger ? "global-settings__trigger--hidden" : ""}`.trim()}
        aria-label={triggerLabel}
        onClick={onToggleOpen}
      >
        {isOpen ? <X size={16} strokeWidth={2} aria-hidden={true} /> : <Settings size={16} strokeWidth={2} aria-hidden={true} />}
        <span className="global-settings__trigger-label">{triggerLabel}</span>
      </button>

      {isRendered ? (
        <>
          <button
            type="button"
            className={`global-settings__overlay ${overlayStateClassName}`}
            aria-label="Close settings"
            onClick={onClose}
          />
          <section
            className={`global-settings__modal ${modalStateClassName}`}
            role="dialog"
            aria-modal="true"
            aria-label="Global settings"
          >
            <h2>Settings</h2>

            <label className="global-settings__field global-settings__field--toggle" htmlFor="settings-menu-bar-toggle">
              <span>Menu Bar</span>
              <span className="global-settings__switch" aria-hidden="true">
                <input
                  id="settings-menu-bar-toggle"
                  type="checkbox"
                  checked={menuBarEnabled}
                  onChange={(event) => {
                    onMenuBarEnabledChange(event.target.checked)
                  }}
                />
                <span className="global-settings__switch-track" />
              </span>
            </label>

            <label className="global-settings__field global-settings__field--toggle" htmlFor="settings-flags-toggle">
              <span>Flags</span>
              <span className="global-settings__switch" aria-hidden="true">
                <input
                  id="settings-flags-toggle"
                  type="checkbox"
                  checked={flagsEnabled}
                  onChange={(event) => {
                    onFlagsEnabledChange(event.target.checked)
                  }}
                />
                <span className="global-settings__switch-track" />
              </span>
            </label>

            <label className="global-settings__field" htmlFor="settings-font-family">
              <span>Font</span>
              <select
                id="settings-font-family"
                value={selectedFont}
                onChange={(event) => {
                  onFontChange(event.target.value)
                }}
              >
                {fontOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="global-settings__field global-settings__field--toggle" htmlFor="settings-global-text-toggle">
              <span>Change global text</span>
              <span className="global-settings__switch" aria-hidden="true">
                <input
                  id="settings-global-text-toggle"
                  type="checkbox"
                  checked={globalTextEnabled}
                  onChange={(event) => {
                    onGlobalTextEnabledChange(event.target.checked)
                  }}
                />
                <span className="global-settings__switch-track" />
              </span>
            </label>

            <label className="global-settings__field" htmlFor="settings-font-size">
              <span>Font Size: {fontSize}</span>
              <input
                id="settings-font-size"
                type="range"
                min={20}
                max={84}
                step={1}
                value={fontSize}
                onChange={(event) => {
                  onFontSizeChange(Number(event.target.value))
                }}
              />
            </label>

            <label className="global-settings__field" htmlFor="settings-palette">
              <span>Color Palette</span>
              <select
                id="settings-palette"
                value={palette}
                onChange={(event) => {
                  onPaletteChange(event.target.value)
                }}
              >
                {paletteOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </section>
        </>
      ) : null}
    </>
  )
}
