import { AArrowDown, AArrowUp, ChevronDown, CornerDownRight, Palette } from "lucide-react"
import { useEffect, useRef, useState, type CSSProperties } from "react"

type PaletteOption = {
  value: string
  label: string
}

type FontOption = {
  value: string
  label: string
}

export type AppearanceSectionProps = {
  isOpen: boolean
  isRendered: boolean
  menuBarEnabled: boolean
  flagsEnabled: boolean
  showWordCount: boolean
  displayFont: string
  bodyFont: string
  uiFont: string
  fontSize: number
  palette: string
  paletteOptions: PaletteOption[]
  fontOptions: FontOption[]
  customPaletteBackground: string
  customPaletteAccent: string
  onMenuBarEnabledChange: (enabled: boolean) => void
  onFlagsEnabledChange: (enabled: boolean) => void
  onDisplayFontChange: (fontFamily: string) => void
  onBodyFontChange: (fontFamily: string) => void
  onUiFontChange: (fontFamily: string) => void
  onShowWordCountChange: (enabled: boolean) => void
  onFontSizeChange: (fontSize: number) => void
  onPaletteChange: (palette: string) => void
  onCustomPaletteBackgroundChange: (color: string) => void
  onCustomPaletteAccentChange: (color: string) => void
  sectionRef: (element: HTMLElement | null) => void
}

const MIN_FONT_SIZE = 20
const MAX_FONT_SIZE = 84

const normalizeHexInput = (value: string) => {
  const trimmed = value.trim()
  if (!trimmed) {
    return ""
  }

  const prefixed = trimmed.startsWith("#") ? trimmed : `#${trimmed}`
  const cleaned = prefixed.slice(1).replace(/[^0-9a-fA-F]/g, "").slice(0, 6)
  return `#${cleaned}`.toUpperCase()
}

const isCompleteHexColor = (value: string) => /^#[0-9A-F]{6}$/.test(value)

export default function AppearanceSettings({
  isOpen,
  isRendered,
  menuBarEnabled,
  flagsEnabled,
  showWordCount,
  displayFont,
  bodyFont,
  uiFont,
  fontSize,
  palette,
  paletteOptions,
  fontOptions,
  customPaletteBackground,
  customPaletteAccent,
  onMenuBarEnabledChange,
  onFlagsEnabledChange,
  onDisplayFontChange,
  onBodyFontChange,
  onUiFontChange,
  onShowWordCountChange,
  onFontSizeChange,
  onPaletteChange,
  onCustomPaletteBackgroundChange,
  onCustomPaletteAccentChange,
  sectionRef,
}: AppearanceSectionProps) {
  const displayFontMenuRef = useRef<HTMLDivElement | null>(null)
  const bodyFontMenuRef = useRef<HTMLDivElement | null>(null)
  const uiFontMenuRef = useRef<HTMLDivElement | null>(null)
  const paletteMenuRef = useRef<HTMLDivElement | null>(null)

  const [activeFontMenu, setActiveFontMenu] = useState<"display" | "body" | "ui" | null>(null)
  const [isPaletteMenuOpen, setIsPaletteMenuOpen] = useState(false)
  const [customBackgroundHexDraft, setCustomBackgroundHexDraft] = useState(customPaletteBackground.toUpperCase())
  const [customAccentHexDraft, setCustomAccentHexDraft] = useState(customPaletteAccent.toUpperCase())

  const stepFontSize = (direction: "increase" | "decrease") => {
    const delta = direction === "increase" ? 1 : -1
    const nextSize = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, fontSize + delta))
    onFontSizeChange(nextSize)
  }

  useEffect(() => {
    setCustomBackgroundHexDraft(customPaletteBackground.toUpperCase())
  }, [customPaletteBackground])

  useEffect(() => {
    setCustomAccentHexDraft(customPaletteAccent.toUpperCase())
  }, [customPaletteAccent])

  useEffect(() => {
    if (!isOpen || !isRendered) {
      setActiveFontMenu(null)
      setIsPaletteMenuOpen(false)
    }
  }, [isOpen, isRendered])

  useEffect(() => {
    if (!activeFontMenu && !isPaletteMenuOpen) {
      return
    }

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null
      if (!target) {
        return
      }

      if (
        displayFontMenuRef.current?.contains(target) ||
        bodyFontMenuRef.current?.contains(target) ||
        uiFontMenuRef.current?.contains(target) ||
        paletteMenuRef.current?.contains(target)
      ) {
        return
      }

      setActiveFontMenu(null)
      setIsPaletteMenuOpen(false)
    }

    window.addEventListener("mousedown", onPointerDown)
    return () => {
      window.removeEventListener("mousedown", onPointerDown)
    }
  }, [activeFontMenu, isPaletteMenuOpen])

  return (
    <section
      className="global-settings__section"
      data-settings-section="appearance"
      ref={sectionRef}
    >
      <h3 className="global-settings__section-title">
        <Palette size={18} strokeWidth={2} aria-hidden={true} />
        <span>Appearance</span>
      </h3>

      <label className="global-settings__field" htmlFor="settings-display-font-trigger">
        <span>Display Font</span>
        <div className="global-settings__palette-menu-wrap" ref={displayFontMenuRef}>
          <button
            id="settings-display-font-trigger"
            type="button"
            className="global-settings__palette-trigger"
            aria-haspopup="listbox"
            aria-expanded={activeFontMenu === "display"}
            onClick={() => {
              setIsPaletteMenuOpen(false)
              setActiveFontMenu((current) => (current === "display" ? null : "display"))
            }}
          >
            <span>{fontOptions.find((option) => option.value === displayFont)?.label ?? "Select Font"}</span>
            <ChevronDown size={15} strokeWidth={2} aria-hidden="true" />
          </button>

          <div
            className={`global-settings__palette-menu ${activeFontMenu === "display" ? "global-settings__palette-menu--open" : "global-settings__palette-menu--closed"}`.trim()}
            role="listbox"
            aria-label="Display Font"
          >
            {fontOptions.map((option) => (
              <button
                key={`display-${option.value}`}
                type="button"
                role="option"
                aria-selected={option.value === displayFont}
                className={`global-settings__palette-option ${option.value === displayFont ? "global-settings__palette-option--active" : ""}`.trim()}
                onClick={() => {
                  onDisplayFontChange(option.value)
                  setActiveFontMenu(null)
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </label>

      <label className="global-settings__field" htmlFor="settings-body-font-trigger">
        <span>Body Font</span>
        <div className="global-settings__palette-menu-wrap" ref={bodyFontMenuRef}>
          <button
            id="settings-body-font-trigger"
            type="button"
            className="global-settings__palette-trigger"
            aria-haspopup="listbox"
            aria-expanded={activeFontMenu === "body"}
            onClick={() => {
              setIsPaletteMenuOpen(false)
              setActiveFontMenu((current) => (current === "body" ? null : "body"))
            }}
          >
            <span>{fontOptions.find((option) => option.value === bodyFont)?.label ?? "Select Font"}</span>
            <ChevronDown size={15} strokeWidth={2} aria-hidden="true" />
          </button>

          <div
            className={`global-settings__palette-menu ${activeFontMenu === "body" ? "global-settings__palette-menu--open" : "global-settings__palette-menu--closed"}`.trim()}
            role="listbox"
            aria-label="Body Font"
          >
            {fontOptions.map((option) => (
              <button
                key={`body-${option.value}`}
                type="button"
                role="option"
                aria-selected={option.value === bodyFont}
                className={`global-settings__palette-option ${option.value === bodyFont ? "global-settings__palette-option--active" : ""}`.trim()}
                onClick={() => {
                  onBodyFontChange(option.value)
                  setActiveFontMenu(null)
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </label>

      <label className="global-settings__field" htmlFor="settings-ui-font-trigger">
        <span>UI Font</span>
        <div className="global-settings__palette-menu-wrap" ref={uiFontMenuRef}>
          <button
            id="settings-ui-font-trigger"
            type="button"
            className="global-settings__palette-trigger"
            aria-haspopup="listbox"
            aria-expanded={activeFontMenu === "ui"}
            onClick={() => {
              setIsPaletteMenuOpen(false)
              setActiveFontMenu((current) => (current === "ui" ? null : "ui"))
            }}
          >
            <span>{fontOptions.find((option) => option.value === uiFont)?.label ?? "Select Font"}</span>
            <ChevronDown size={15} strokeWidth={2} aria-hidden="true" />
          </button>

          <div
            className={`global-settings__palette-menu ${activeFontMenu === "ui" ? "global-settings__palette-menu--open" : "global-settings__palette-menu--closed"}`.trim()}
            role="listbox"
            aria-label="UI Font"
          >
            {fontOptions.map((option) => (
              <button
                key={`ui-${option.value}`}
                type="button"
                role="option"
                aria-selected={option.value === uiFont}
                className={`global-settings__palette-option ${option.value === uiFont ? "global-settings__palette-option--active" : ""}`.trim()}
                onClick={() => {
                  onUiFontChange(option.value)
                  setActiveFontMenu(null)
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </label>

      <label className="global-settings__field" htmlFor="settings-font-size">
        <span>Font Size: {fontSize}</span>
        <div className="global-settings__font-size-control" aria-label="Font size controls">
          <button
            type="button"
            className="global-settings__font-size-action"
            onClick={() => {
              stepFontSize("decrease")
            }}
            aria-label="Decrease font size"
          >
            <AArrowDown size={16} strokeWidth={2} aria-hidden="true" />
            <span className="global-settings__font-size-action-label">Decrease font size</span>
          </button>

          <input
            id="settings-font-size"
            className="global-settings__font-size-slider"
            type="range"
            min={MIN_FONT_SIZE}
            max={MAX_FONT_SIZE}
            step={1}
            value={fontSize}
            style={{ "--settings-range-progress": `${((fontSize - MIN_FONT_SIZE) / (MAX_FONT_SIZE - MIN_FONT_SIZE)) * 100}%` } as CSSProperties}
            onChange={(event) => {
              onFontSizeChange(Number(event.target.value))
            }}
          />

          <button
            type="button"
            className="global-settings__font-size-action"
            onClick={() => {
              stepFontSize("increase")
            }}
            aria-label="Increase font size"
          >
            <AArrowUp size={16} strokeWidth={2} aria-hidden="true" />
            <span className="global-settings__font-size-action-label">Increase font size</span>
          </button>
        </div>
      </label>

      <label className="global-settings__field" htmlFor="settings-palette-trigger">
        <span>Color Palette</span>
        <div className="global-settings__palette-menu-wrap" ref={paletteMenuRef}>
          <button
            id="settings-palette-trigger"
            type="button"
            className="global-settings__palette-trigger"
            aria-haspopup="listbox"
            aria-expanded={isPaletteMenuOpen}
            onClick={() => {
              setActiveFontMenu(null)
              setIsPaletteMenuOpen((current) => !current)
            }}
          >
            <span>{paletteOptions.find((option) => option.value === palette)?.label ?? "Select Palette"}</span>
            <ChevronDown size={15} strokeWidth={2} aria-hidden="true" />
          </button>

          <div
            className={`global-settings__palette-menu ${isPaletteMenuOpen ? "global-settings__palette-menu--open" : "global-settings__palette-menu--closed"}`.trim()}
            role="listbox"
            aria-label="Color Palette"
          >
            {paletteOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={option.value === palette}
                className={`global-settings__palette-option ${option.value === palette ? "global-settings__palette-option--active" : ""}`.trim()}
                onClick={() => {
                  onPaletteChange(option.value)
                  setIsPaletteMenuOpen(false)
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </label>

      {palette === "custom" ? (
        <>
          <label className="global-settings__field" htmlFor="settings-custom-background">
            <span className="global-settings__subfield-label">
              <CornerDownRight size={14} strokeWidth={2} aria-hidden="true" />
              <span>Custom Background Color</span>
            </span>
            <div className="global-settings__color-input-wrap">
              <input
                id="settings-custom-background"
                className="global-settings__color-input"
                type="color"
                value={customPaletteBackground}
                onChange={(event) => {
                  const nextValue = event.target.value.toUpperCase()
                  onCustomPaletteBackgroundChange(nextValue)
                  setCustomBackgroundHexDraft(nextValue)
                }}
              />
              <input
                className="global-settings__color-value-input"
                type="text"
                inputMode="text"
                autoComplete="off"
                spellCheck={false}
                value={customBackgroundHexDraft}
                onChange={(event) => {
                  const nextDraft = normalizeHexInput(event.target.value)
                  setCustomBackgroundHexDraft(nextDraft)
                  if (isCompleteHexColor(nextDraft)) {
                    onCustomPaletteBackgroundChange(nextDraft)
                  }
                }}
                onBlur={() => {
                  if (!isCompleteHexColor(customBackgroundHexDraft)) {
                    setCustomBackgroundHexDraft(customPaletteBackground.toUpperCase())
                  }
                }}
                placeholder="#000000"
                aria-label="Custom background color hex"
              />
            </div>
          </label>

          <label className="global-settings__field" htmlFor="settings-custom-accent">
            <span className="global-settings__subfield-label">
              <CornerDownRight size={14} strokeWidth={2} aria-hidden="true" />
              <span>Custom Accent Color</span>
            </span>
            <div className="global-settings__color-input-wrap">
              <input
                id="settings-custom-accent"
                className="global-settings__color-input"
                type="color"
                value={customPaletteAccent}
                onChange={(event) => {
                  const nextValue = event.target.value.toUpperCase()
                  onCustomPaletteAccentChange(nextValue)
                  setCustomAccentHexDraft(nextValue)
                }}
              />
              <input
                className="global-settings__color-value-input"
                type="text"
                inputMode="text"
                autoComplete="off"
                spellCheck={false}
                value={customAccentHexDraft}
                onChange={(event) => {
                  const nextDraft = normalizeHexInput(event.target.value)
                  setCustomAccentHexDraft(nextDraft)
                  if (isCompleteHexColor(nextDraft)) {
                    onCustomPaletteAccentChange(nextDraft)
                  }
                }}
                onBlur={() => {
                  if (!isCompleteHexColor(customAccentHexDraft)) {
                    setCustomAccentHexDraft(customPaletteAccent.toUpperCase())
                  }
                }}
                placeholder="#000000"
                aria-label="Custom accent color hex"
              />
            </div>
          </label>
        </>
      ) : null}

      <label className="global-settings__field global-settings__field--toggle" htmlFor="settings-menu-bar-toggle-appearance">
        <span>Menu Bar Visibility</span>
        <span className="global-settings__switch" aria-hidden="true">
          <input
            id="settings-menu-bar-toggle-appearance"
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

      <label className="global-settings__field global-settings__field--toggle" htmlFor="settings-word-count-toggle">
        <span>Show Word Count</span>
        <span className="global-settings__switch" aria-hidden="true">
          <input
            id="settings-word-count-toggle"
            type="checkbox"
            checked={showWordCount}
            onChange={(event) => {
              onShowWordCountChange(event.target.checked)
            }}
          />
          <span className="global-settings__switch-track" />
        </span>
      </label>
    </section>
  )
}
