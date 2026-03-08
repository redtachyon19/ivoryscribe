import { Palette, ScrollText, Settings, UserRound, X } from "lucide-react"
import { useEffect, useRef, useState, type ComponentType, type CSSProperties } from "react"
import type { ProjectKind } from "../core/projects"
import "./GlobalSettings.css"

type PaletteOption = {
  value: string
  label: string
}

type FontOption = {
  value: string
  label: string
}

type ProjectFolderOption = {
  id: string
  name: string
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
  activeProjectName: string
  activeProjectKind: ProjectKind
  activeProjectColor: string
  onActiveProjectNameChange: (name: string) => void
  onActiveProjectKindChange: (kind: ProjectKind) => void
  onActiveProjectColorChange: (color: string) => void
  activeProjectFolderId: string | null
  projectFolderOptions: ProjectFolderOption[]
  onActiveProjectFolderChange: (folderId: string | null) => void
  onDeleteActiveProject: () => void
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
  activeProjectName,
  activeProjectKind,
  activeProjectColor,
  onActiveProjectNameChange,
  onActiveProjectKindChange,
  onActiveProjectColorChange,
  activeProjectFolderId,
  projectFolderOptions,
  onActiveProjectFolderChange,
  onDeleteActiveProject,
}: GlobalSettingsProps) {
  const sectionIds = ["account", "appearance", "project-preferences"] as const
  type SectionId = (typeof sectionIds)[number]

  const contentRef = useRef<HTMLDivElement | null>(null)
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
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)
  const [deleteProjectNameInput, setDeleteProjectNameInput] = useState("")
  const [deleteProjectError, setDeleteProjectError] = useState("")
  const triggerIsLayeredAboveOverlay = isOpen || isRendered
  const triggerLabel = isOpen ? "Close Settings" : "Open Settings"

  const sectionNavItems: { id: SectionId; label: string; icon: ComponentType<{ size?: number; strokeWidth?: number; "aria-hidden"?: boolean }> }[] = [
    { id: "account", label: "Account Settings", icon: UserRound },
    { id: "appearance", label: "Appearance", icon: Palette },
    { id: "project-preferences", label: "Project Preferences", icon: ScrollText },
  ]

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
    setIsDeleteConfirmOpen(false)
    setDeleteProjectNameInput("")
    setDeleteProjectError("")
    const scroller = contentRef.current
    if (scroller) {
      scroller.scrollTo({ top: 0, behavior: "auto" })
    }
  }, [isOpen, isRendered])

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
                </section>

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

                  <label className="global-settings__field" htmlFor="settings-project-name">
                    <span>Project Name</span>
                    <input
                      id="settings-project-name"
                      type="text"
                      value={activeProjectName}
                      onChange={(event) => {
                        onActiveProjectNameChange(event.target.value)
                      }}
                    />
                  </label>

                  <label className="global-settings__field" htmlFor="settings-project-kind">
                    <span>Project Type</span>
                    <select
                      id="settings-project-kind"
                      value={activeProjectKind}
                      onChange={(event) => {
                        onActiveProjectKindChange(event.target.value as ProjectKind)
                      }}
                    >
                      <option value="Book">Book</option>
                      <option value="Blog">Blog</option>
                    </select>
                  </label>

                  <label className="global-settings__field" htmlFor="settings-project-folder">
                    <span>Folder</span>
                    <select
                      id="settings-project-folder"
                      value={activeProjectFolderId ?? ""}
                      onChange={(event) => {
                        onActiveProjectFolderChange(event.target.value || null)
                      }}
                    >
                      <option value="">No Folder</option>
                      {projectFolderOptions.map((folder) => (
                        <option key={folder.id} value={folder.id}>
                          {folder.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="global-settings__field" htmlFor="settings-project-color">
                    <span>Project Color</span>
                    <span className="global-settings__color-input-wrap">
                      <input
                        id="settings-project-color"
                        className="global-settings__color-input"
                        type="color"
                        value={activeProjectColor}
                        onChange={(event) => {
                          onActiveProjectColorChange(event.target.value)
                        }}
                      />
                      <span className="global-settings__color-value">{activeProjectColor}</span>
                    </span>
                  </label>

                  <div className="global-settings__danger-zone" role="group" aria-label="Danger zone">
                    <h4 className="global-settings__danger-zone-title">Danger Zone</h4>
                    <p className="global-settings__danger-zone-copy">
                      Deleting this project is permanent and cannot be undone.
                    </p>

                    {!isDeleteConfirmOpen ? (
                      <button
                        type="button"
                        className="global-settings__danger-button"
                        onClick={() => {
                          setIsDeleteConfirmOpen(true)
                          setDeleteProjectNameInput("")
                          setDeleteProjectError("")
                        }}
                      >
                        Delete Project
                      </button>
                    ) : (
                      <div className="global-settings__danger-confirm">
                        <label className="global-settings__field" htmlFor="settings-delete-project-confirm">
                          <span>
                            Type <strong>{activeProjectName}</strong> to confirm deletion.
                          </span>
                          <input
                            id="settings-delete-project-confirm"
                            type="text"
                            value={deleteProjectNameInput}
                            onChange={(event) => {
                              setDeleteProjectNameInput(event.target.value)
                              if (deleteProjectError) {
                                setDeleteProjectError("")
                              }
                            }}
                          />
                        </label>

                        {deleteProjectError ? <p className="global-settings__danger-error">{deleteProjectError}</p> : null}

                        <div className="global-settings__danger-actions">
                          <button
                            type="button"
                            className="global-settings__danger-cancel"
                            onClick={() => {
                              setIsDeleteConfirmOpen(false)
                              setDeleteProjectNameInput("")
                              setDeleteProjectError("")
                            }}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            className="global-settings__danger-button"
                            onClick={() => {
                              if (deleteProjectNameInput !== activeProjectName) {
                                setDeleteProjectError("Project name does not match.")
                                return
                              }

                              onDeleteActiveProject()
                              setIsDeleteConfirmOpen(false)
                              setDeleteProjectNameInput("")
                              setDeleteProjectError("")
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </section>
              </div>
            </div>
          </section>
        </>
      ) : null}
    </>
  )
}
