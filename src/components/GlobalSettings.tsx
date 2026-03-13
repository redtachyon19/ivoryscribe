import { AArrowDown, AArrowUp, ChevronDown, CornerDownRight, Palette, ScrollText, Settings, UserRound, X } from "lucide-react"
import { useEffect, useRef, useState, type ComponentType, type CSSProperties } from "react"
import type { ProjectKind } from "../core/projects"
import ProjectPreferencesFields from "./ProjectPreferencesFields"
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
  showProjectPreferences?: boolean
  menuBarEnabled: boolean
  flagsEnabled: boolean
  hideTrigger?: boolean
  selectedFont: string
  customFontName: string
  customFontSelected: boolean
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
  onCustomFontNameChange: (fontName: string) => void
  onCustomFontSelectedChange: (selected: boolean) => void
  onGlobalTextEnabledChange: (enabled: boolean) => void
  onFontSizeChange: (fontSize: number) => void
  onPaletteChange: (palette: string) => void
  customPaletteBackground: string
  customPaletteAccent: string
  onCustomPaletteBackgroundChange: (color: string) => void
  onCustomPaletteAccentChange: (color: string) => void
  activeProjectName: string
  activeProjectKind: ProjectKind
  activeProjectColor: string
  activeProjectWallpaperEmojis: string
  onActiveProjectNameChange: (name: string) => void
  onActiveProjectKindChange: (kind: ProjectKind) => void
  onActiveProjectColorChange: (color: string) => void
  onActiveProjectWallpaperEmojisChange: (wallpaperEmojis: string) => void
  onExportProjectAsPdf: () => void
}

export default function GlobalSettings({
  isOpen,
  showProjectPreferences = true,
  menuBarEnabled,
  flagsEnabled,
  hideTrigger = false,
  selectedFont,
  customFontName,
  customFontSelected,
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
  onCustomFontNameChange,
  onCustomFontSelectedChange,
  onGlobalTextEnabledChange,
  onFontSizeChange,
  onPaletteChange,
  customPaletteBackground,
  customPaletteAccent,
  onCustomPaletteBackgroundChange,
  onCustomPaletteAccentChange,
  activeProjectName,
  activeProjectKind,
  activeProjectColor,
  activeProjectWallpaperEmojis,
  onActiveProjectNameChange,
  onActiveProjectKindChange,
  onActiveProjectColorChange,
  onActiveProjectWallpaperEmojisChange,
  onExportProjectAsPdf,
}: GlobalSettingsProps) {
  type SectionId = "account" | "appearance" | "project-preferences"
  const sectionIds: SectionId[] = showProjectPreferences ? ["account", "appearance", "project-preferences"] : ["account", "appearance"]

  const contentRef = useRef<HTMLDivElement | null>(null)
  const fontMenuRef = useRef<HTMLDivElement | null>(null)
  const paletteMenuRef = useRef<HTMLDivElement | null>(null)
  const sectionNavRef = useRef<HTMLElement | null>(null)
  const sectionRefs = useRef<Record<SectionId, HTMLElement | null>>({
    account: null,
    appearance: null,
    "project-preferences": null,
  })
  const sectionNavItemRefs = useRef<Record<SectionId, HTMLButtonElement | null>>({
    account: null,
    appearance: null,
    "project-preferences": null,
  })
  const scrollIntentSectionRef = useRef<SectionId | null>(null)

  const [activeSection, setActiveSection] = useState<SectionId>("account")
  const [sectionIndicatorStyle, setSectionIndicatorStyle] = useState<{ top: number; height: number; visible: boolean }>({
    top: 0,
    height: 0,
    visible: false,
  })
  const [isRendered, setIsRendered] = useState(isOpen)
  const [isClosing, setIsClosing] = useState(false)
  const [isFontMenuOpen, setIsFontMenuOpen] = useState(false)
  const [isPaletteMenuOpen, setIsPaletteMenuOpen] = useState(false)
  const [customFontDraft, setCustomFontDraft] = useState(customFontName)
  const [customBackgroundHexDraft, setCustomBackgroundHexDraft] = useState(customPaletteBackground.toUpperCase())
  const [customAccentHexDraft, setCustomAccentHexDraft] = useState(customPaletteAccent.toUpperCase())
  const CUSTOM_FONT_OPTION_VALUE = "__custom_local_font__"
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
  const triggerIsLayeredAboveOverlay = isOpen || isRendered
  const triggerLabel = isOpen ? "Close Settings" : "Open Settings"

  const sectionNavItems: { id: SectionId; label: string; icon: ComponentType<{ size?: number; strokeWidth?: number; "aria-hidden"?: boolean }> }[] = [
    { id: "account", label: "Account Settings", icon: UserRound },
    { id: "appearance", label: "Appearance", icon: Palette },
  ]

  if (showProjectPreferences) {
    sectionNavItems.push({ id: "project-preferences", label: "Project Preferences", icon: ScrollText })
  }

  const stepFontSize = (direction: "increase" | "decrease") => {
    const delta = direction === "increase" ? 1 : -1
    const nextSize = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, fontSize + delta))
    onFontSizeChange(nextSize)
  }

  useEffect(() => {
    if (!showProjectPreferences && activeSection === "project-preferences") {
      setActiveSection("account")
    }
  }, [activeSection, showProjectPreferences])

  useEffect(() => {
    setCustomFontDraft(customFontName)
  }, [customFontName])

  useEffect(() => {
    setCustomBackgroundHexDraft(customPaletteBackground.toUpperCase())
  }, [customPaletteBackground])

  useEffect(() => {
    setCustomAccentHexDraft(customPaletteAccent.toUpperCase())
  }, [customPaletteAccent])

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

  useEffect(() => {
    if (!isOpen || !isRendered) {
      return
    }

    setActiveSection("account")
    const scroller = contentRef.current
    if (scroller) {
      scroller.scrollTo({ top: 0, behavior: "auto" })
    }
  }, [isOpen, isRendered])

  useEffect(() => {
    if (!isOpen || !isRendered) {
      setIsFontMenuOpen(false)
      setIsPaletteMenuOpen(false)
    }
  }, [isOpen, isRendered])

  useEffect(() => {
    if (!isFontMenuOpen && !isPaletteMenuOpen) {
      return
    }

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null
      if (!target) {
        return
      }

      if (fontMenuRef.current?.contains(target) || paletteMenuRef.current?.contains(target)) {
        return
      }

      setIsFontMenuOpen(false)
      setIsPaletteMenuOpen(false)
    }

    window.addEventListener("mousedown", onPointerDown)
    return () => {
      window.removeEventListener("mousedown", onPointerDown)
    }
  }, [isFontMenuOpen, isPaletteMenuOpen])

  useEffect(() => {
    if (!isOpen || !isRendered) {
      return
    }

    const nav = sectionNavRef.current
    const activeNavItem = sectionNavItemRefs.current[activeSection]
    if (!nav || !activeNavItem) {
      return
    }

    activeNavItem.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
    })
  }, [activeSection, isOpen, isRendered])

  useEffect(() => {
    if (!isOpen || !isRendered) {
      setSectionIndicatorStyle((current) => (current.visible ? { top: 0, height: 0, visible: false } : current))
      return
    }

    const nav = sectionNavRef.current
    const activeNavItem = sectionNavItemRefs.current[activeSection]
    if (!nav || !activeNavItem) {
      return
    }

    const syncIndicator = () => {
      const navRect = nav.getBoundingClientRect()
      const itemRect = activeNavItem.getBoundingClientRect()
      const top = itemRect.top - navRect.top + nav.scrollTop
      const height = itemRect.height

      setSectionIndicatorStyle((current) => {
        if (current.top === top && current.height === height && current.visible) {
          return current
        }

        return {
          top,
          height,
          visible: true,
        }
      })
    }

    syncIndicator()
    nav.addEventListener("scroll", syncIndicator, { passive: true })
    window.addEventListener("resize", syncIndicator)

    return () => {
      nav.removeEventListener("scroll", syncIndicator)
      window.removeEventListener("resize", syncIndicator)
    }
  }, [activeSection, isOpen, isRendered])

  useEffect(() => {
    if (!isOpen || !isRendered) {
      return
    }

    const scroller = contentRef.current
    if (!scroller) {
      return
    }

    const getSectionForScrollPosition = () => {
      const activationOffset = 18
      const currentTop = scroller.scrollTop + activationOffset
      let nextSection: SectionId = sectionIds[0]

      sectionIds.forEach((id) => {
        const section = sectionRefs.current[id]
        if (!section) {
          return
        }

        if (section.offsetTop <= currentTop) {
          nextSection = id
        }
      })

      return nextSection
    }

    let frameId: number | null = null

    const syncActiveSection = () => {
      const nextSection = getSectionForScrollPosition()
      const intendedSection = scrollIntentSectionRef.current
      if (intendedSection) {
        if (nextSection !== intendedSection) {
          setActiveSection((current) => (current === intendedSection ? current : intendedSection))
          return
        }

        scrollIntentSectionRef.current = null
      }
      setActiveSection((current) => (current === nextSection ? current : nextSection))
    }

    const onScroll = () => {
      if (frameId !== null) {
        return
      }

      frameId = window.requestAnimationFrame(() => {
        frameId = null
        syncActiveSection()
      })
    }

    syncActiveSection()

    scroller.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", syncActiveSection)

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId)
      }
      scroller.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", syncActiveSection)
    }
  }, [isOpen, isRendered])

  const scrollToSection = (sectionId: SectionId) => {
    scrollIntentSectionRef.current = sectionId
    setActiveSection(sectionId)

    const section = sectionRefs.current[sectionId]
    if (!section) {
      return
    }

    section.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  const overlayStateClassName = isClosing ? "global-settings__overlay--closing" : "global-settings__overlay--opening"
  const modalStateClassName = isClosing ? "global-settings__modal--closing" : "global-settings__modal--opening"
  const sectionIndicatorInlineStyle = {
    top: `${sectionIndicatorStyle.top}px`,
    height: `${sectionIndicatorStyle.height}px`,
    opacity: sectionIndicatorStyle.visible ? 1 : 0,
  } satisfies CSSProperties

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
            <header className="global-settings__header">
              <h2>Settings</h2>
            </header>

            <div className="global-settings__layout">
              <nav className="global-settings__section-nav" aria-label="Settings sections" ref={sectionNavRef}>
                <span className="global-settings__section-nav-indicator" style={sectionIndicatorInlineStyle} aria-hidden={true} />
                {sectionNavItems.map((item) => {
                  const Icon = item.icon

                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`global-settings__section-nav-item ${activeSection === item.id ? "global-settings__section-nav-item--active" : ""}`.trim()}
                      ref={(element) => {
                        sectionNavItemRefs.current[item.id] = element
                      }}
                      onClick={() => {
                        scrollToSection(item.id)
                      }}
                    >
                      <Icon size={16} strokeWidth={2} aria-hidden={true} />
                      <span>{item.label}</span>
                    </button>
                  )
                })}
              </nav>

              <div className="global-settings__content" ref={contentRef}>
                <section
                  className="global-settings__section"
                  data-settings-section="account"
                  ref={(element) => {
                    sectionRefs.current.account = element
                  }}
                >
                  <h3 className="global-settings__section-title">
                    <UserRound size={18} strokeWidth={2} aria-hidden={true} />
                    <span>Account Settings</span>
                  </h3>
                  <p className="global-settings__section-copy">
                    Account tools are reserved for identity and sync features. More account controls are coming soon.
                  </p>
                </section>

                <section
                  className="global-settings__section"
                  data-settings-section="appearance"
                  ref={(element) => {
                    sectionRefs.current.appearance = element
                  }}
                >
                  <h3 className="global-settings__section-title">
                    <Palette size={18} strokeWidth={2} aria-hidden={true} />
                    <span>Appearance</span>
                  </h3>

                  <label className="global-settings__field" htmlFor="settings-font-family-trigger">
                    <span>Font</span>
                    <div className="global-settings__palette-menu-wrap" ref={fontMenuRef}>
                      <button
                        id="settings-font-family-trigger"
                        type="button"
                        className="global-settings__palette-trigger"
                        aria-haspopup="listbox"
                        aria-expanded={isFontMenuOpen}
                        onClick={() => {
                          setIsPaletteMenuOpen(false)
                          setIsFontMenuOpen((current) => !current)
                        }}
                      >
                        <span>
                          {customFontSelected
                            ? customFontName
                              ? `Custom: ${customFontName}`
                              : "Custom Local Font"
                            : (fontOptions.find((option) => option.value === selectedFont)?.label ?? "Select Font")}
                        </span>
                        <ChevronDown size={15} strokeWidth={2} aria-hidden="true" />
                      </button>

                      <div
                        className={`global-settings__palette-menu ${isFontMenuOpen ? "global-settings__palette-menu--open" : "global-settings__palette-menu--closed"}`.trim()}
                        role="listbox"
                        aria-label="Font"
                      >
                        {fontOptions.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            role="option"
                            aria-selected={option.value === selectedFont}
                            className={`global-settings__palette-option ${option.value === selectedFont ? "global-settings__palette-option--active" : ""}`.trim()}
                            onClick={() => {
                              onCustomFontSelectedChange(false)
                              onFontChange(option.value)
                              setIsFontMenuOpen(false)
                            }}
                          >
                            {option.label}
                          </button>
                        ))}
                        <button
                          type="button"
                          role="option"
                          aria-selected={customFontSelected}
                          className={`global-settings__palette-option ${customFontSelected ? "global-settings__palette-option--active" : ""}`.trim()}
                          onClick={() => {
                            onCustomFontSelectedChange(true)
                            setIsFontMenuOpen(false)
                          }}
                          data-value={CUSTOM_FONT_OPTION_VALUE}
                        >
                          Custom Local Font
                        </button>
                      </div>
                    </div>
                  </label>

                  {customFontSelected ? (
                    <label className="global-settings__field" htmlFor="settings-custom-font-name">
                      <span className="global-settings__subfield-label">
                        <CornerDownRight size={14} strokeWidth={2} aria-hidden="true" />
                        <span>Custom Local Font Name</span>
                      </span>
                      <div className="global-settings__subfield-control">
                        <input
                          id="settings-custom-font-name"
                          type="text"
                          value={customFontDraft}
                          onChange={(event) => {
                            setCustomFontDraft(event.target.value)
                          }}
                          onBlur={() => {
                            onCustomFontNameChange(customFontDraft)
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault()
                              onCustomFontNameChange(customFontDraft)
                            }
                          }}
                          placeholder="Exact installed font name (e.g. Avenir Next)"
                          spellCheck={false}
                        />
                      </div>
                    </label>
                  ) : null}

                  <label className="global-settings__field global-settings__field--toggle" htmlFor="settings-global-text-toggle">
                    <span>Change global font</span>
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
                          setIsFontMenuOpen(false)
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
                </section>

                {showProjectPreferences ? (
                  <section
                    className="global-settings__section"
                    data-settings-section="project-preferences"
                    ref={(element) => {
                      sectionRefs.current["project-preferences"] = element
                    }}
                  >
                    <h3 className="global-settings__section-title">
                      <ScrollText size={18} strokeWidth={2} aria-hidden={true} />
                      <span>Project Preferences</span>
                    </h3>

                    <ProjectPreferencesFields
                      fieldClassName="global-settings__field"
                      projectName={activeProjectName}
                      projectKind={activeProjectKind}
                      projectColor={activeProjectColor}
                      projectWallpaperEmojis={activeProjectWallpaperEmojis}
                      onProjectNameChange={onActiveProjectNameChange}
                      onProjectKindChange={onActiveProjectKindChange}
                      onProjectColorChange={onActiveProjectColorChange}
                      onProjectWallpaperEmojisChange={onActiveProjectWallpaperEmojisChange}
                      onExportAsPdf={onExportProjectAsPdf}
                    />
                  </section>
                ) : null}
              </div>
            </div>
          </section>
        </>
      ) : null}
    </>
  )
}
