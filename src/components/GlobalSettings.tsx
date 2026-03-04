import { Settings } from "lucide-react"
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
  hideTrigger?: boolean
  selectedFont: string
  fontSize: number
  palette: string
  paletteOptions: PaletteOption[]
  fontOptions: FontOption[]
  onToggleOpen: () => void
  onClose: () => void
  onMenuBarEnabledChange: (enabled: boolean) => void
  onFontChange: (fontFamily: string) => void
  onFontSizeChange: (fontSize: number) => void
  onPaletteChange: (palette: string) => void
}

export default function GlobalSettings({
  isOpen,
  menuBarEnabled,
  hideTrigger = false,
  selectedFont,
  fontSize,
  palette,
  paletteOptions,
  fontOptions,
  onToggleOpen,
  onClose,
  onMenuBarEnabledChange,
  onFontChange,
  onFontSizeChange,
  onPaletteChange,
}: GlobalSettingsProps) {
  return (
    <>
      <button
        type="button"
        className={`global-settings__trigger ${menuBarEnabled ? "global-settings__trigger--with-menu" : ""} ${hideTrigger ? "global-settings__trigger--hidden" : ""}`.trim()}
        aria-label="Open settings"
        onClick={onToggleOpen}
      >
        <Settings size={16} strokeWidth={2} aria-hidden={true} />
        Settings
      </button>

      {isOpen ? (
        <>
          <button type="button" className="global-settings__overlay" aria-label="Close settings" onClick={onClose} />
          <section className="global-settings__modal" role="dialog" aria-modal="true" aria-label="Global settings">
            <h2>Settings</h2>

            <label className="global-settings__field" htmlFor="settings-menu-bar-toggle">
              <span>Menu Bar</span>
              <select
                id="settings-menu-bar-toggle"
                value={menuBarEnabled ? "on" : "off"}
                onChange={(event) => {
                  onMenuBarEnabledChange(event.target.value === "on")
                }}
              >
                <option value="on">On</option>
                <option value="off">Off</option>
              </select>
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
