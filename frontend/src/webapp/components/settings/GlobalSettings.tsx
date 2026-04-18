import { Palette, ScrollText, UserRound } from "lucide-react"
import { useEffect, useRef, useState, type ComponentType, type CSSProperties } from "react"
import type { ProjectKind } from "../../../core/projects"
import AccountSettings from "./AccountSettings"
import AppearanceSettings from "./AppearanceSettings"
import ProjectSettings from "./ProjectSettings"
import Button from "../ui/Button"
import "./GlobalSettings.css"

type PaletteOption = {
  value: string
  label: string
}

type FontOption = {
  value: string
  label: string
}

export type GlobalSettingsProps = {
  isOpen: boolean
  showProjectPreferences?: boolean
  menuBarEnabled: boolean
  flagsEnabled: boolean
  translucentNavPanel: boolean
  displayFont: string
  bodyFont: string
  uiFont: string
  showWordCount: boolean
  fontSize: number
  palette: string
  paletteOptions: PaletteOption[]
  fontOptions: FontOption[]
  onClose: () => void
  onRestoreDefaults: () => void
  onMenuBarEnabledChange: (enabled: boolean) => void
  onFlagsEnabledChange: (enabled: boolean) => void
  onTranslucentNavPanelChange: (enabled: boolean) => void
  onDisplayFontChange: (fontFamily: string) => void
  onBodyFontChange: (fontFamily: string) => void
  onUiFontChange: (fontFamily: string) => void
  onShowWordCountChange: (enabled: boolean) => void
  onFontSizeChange: (fontSize: number) => void
  onPaletteChange: (palette: string) => void
  customPaletteBackground: string
  customPaletteAccent: string
  onCustomPaletteBackgroundChange: (color: string) => void
  onCustomPaletteAccentChange: (color: string) => void
  accountFirstName: string
  accountLastName: string
  accountEmail: string
  activeProjectName: string
  activeProjectMarkdownEditorEnabled: boolean
  activeProjectColor: string
  activeProjectWallpaperEmojis: string
  activeProjectVersions?: Array<{
    id: string
    label: string
    saveKind: "manual" | "autosave"
    createdAt: string
    changedCharacters: number
    preview?: {
      projectName: string
      projectKind: ProjectKind
      entryCount: number
      activeDocumentTitle: string
      activeDocumentPreview: string
    }
  }>
  onActiveProjectNameChange: (name: string) => void
  onActiveProjectMarkdownEditorEnabledChange: (enabled: boolean) => void
  onActiveProjectColorChange: (color: string) => void
  onActiveProjectWallpaperEmojisChange: (wallpaperEmojis: string) => void
  onShowVersionHistory?: () => void
  onExportProject: () => void
  sessionToken?: string
  documentId?: string
  onSaveAccountProfile: (input: { firstName: string; lastName: string }) => Promise<void> | void
  onRequestAccountEmailChange: (email: string) => Promise<{ message: string; change: { currentEmail: string; newEmail: string; step: "verify-current-email" } }> | { message: string; change: { currentEmail: string; newEmail: string; step: "verify-current-email" } }
  onVerifyCurrentAccountEmailChange: (code: string) => Promise<{ message: string; change: { currentEmail: string; newEmail: string; step: "verify-new-email" } }> | { message: string; change: { currentEmail: string; newEmail: string; step: "verify-new-email" } }
  onConfirmAccountEmailChange: (code: string) => Promise<void> | void
  onRequestPasswordReset: () => Promise<{ message: string; reset: { username: string; email: string } }> | { message: string; reset: { username: string; email: string } }
  onRequestAccountDeletion: () => Promise<{ message: string; deletion: { userId: string; email: string } }> | { message: string; deletion: { userId: string; email: string } }
  onConfirmAccountDeletionCode: (input: { userId: string; code: string }) => Promise<void> | void
  onSignOut: () => void
}

export default function GlobalSettings({
  isOpen,
  showProjectPreferences = true,
  menuBarEnabled,
  flagsEnabled,
  translucentNavPanel,
  displayFont,
  bodyFont,
  uiFont,
  showWordCount,
  fontSize,
  palette,
  paletteOptions,
  fontOptions,
  onClose,
  onRestoreDefaults,
  onMenuBarEnabledChange,
  onFlagsEnabledChange,
  onTranslucentNavPanelChange,
  onDisplayFontChange,
  onBodyFontChange,
  onUiFontChange,
  onShowWordCountChange,
  onFontSizeChange,
  onPaletteChange,
  customPaletteBackground,
  customPaletteAccent,
  onCustomPaletteBackgroundChange,
  onCustomPaletteAccentChange,
  accountFirstName,
  accountLastName,
  accountEmail,
  activeProjectName,
  activeProjectMarkdownEditorEnabled,
  activeProjectColor,
  activeProjectWallpaperEmojis,
  activeProjectVersions = [],
  onActiveProjectNameChange,
  onActiveProjectMarkdownEditorEnabledChange,
  onActiveProjectColorChange,
  onActiveProjectWallpaperEmojisChange,
  onShowVersionHistory,
  onExportProject,
  sessionToken,
  documentId,
  onSaveAccountProfile,
  onRequestAccountEmailChange,
  onVerifyCurrentAccountEmailChange,
  onConfirmAccountEmailChange,
  onRequestPasswordReset,
  onRequestAccountDeletion,
  onConfirmAccountDeletionCode,
  onSignOut,
}: GlobalSettingsProps) {
  type SectionId = "account" | "appearance" | "project-preferences"
  const sectionIds: SectionId[] = showProjectPreferences ? ["account", "appearance", "project-preferences"] : ["account", "appearance"]

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
  const [isMarkdownPromptVisible, setIsMarkdownPromptVisible] = useState(false)
  const [isActionFeedbackVisible, setIsActionFeedbackVisible] = useState(false)

  const sectionNavItems: { id: SectionId; label: string; icon: ComponentType<{ size?: number; strokeWidth?: number; "aria-hidden"?: boolean }> }[] = [
    { id: "account", label: "Account Settings", icon: UserRound },
    { id: "appearance", label: "Appearance", icon: Palette },
  ]

  if (showProjectPreferences) {
    sectionNavItems.push({ id: "project-preferences", label: "Project Preferences", icon: ScrollText })
  }

  useEffect(() => {
    if (!showProjectPreferences && activeSection === "project-preferences") {
      setActiveSection("account")
    }
  }, [activeSection, showProjectPreferences])

  useEffect(() => {
    if (!isRendered) {
      setIsMarkdownPromptVisible(false)
      setIsActionFeedbackVisible(false)
    }
  }, [isRendered])

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
      {isRendered ? (
        <>
          <button
            type="button"
            className={`global-settings__overlay ${overlayStateClassName}`}
            aria-label="Close settings"
            onClick={onClose}
          />
          <section
            className={`global-settings__modal ${modalStateClassName} ${isMarkdownPromptVisible || isActionFeedbackVisible ? "global-settings__modal--background-hidden" : ""}`.trim()}
            role="dialog"
            aria-modal="true"
            aria-label="Global settings"
          >
            <header className="global-settings__header">
              <h2>Settings</h2>
              <div className="global-settings__header-actions">
                <Button
                  variant="footer"
                  className="global-settings__restore-btn"
                  onClick={onRestoreDefaults}
                >
                  Restore Defaults
                </Button>
              </div>
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
                <AccountSettings
                  accountFirstName={accountFirstName}
                  accountLastName={accountLastName}
                  accountEmail={accountEmail}
                  onSaveAccountProfile={onSaveAccountProfile}
                  onRequestAccountEmailChange={onRequestAccountEmailChange}
                  onVerifyCurrentAccountEmailChange={onVerifyCurrentAccountEmailChange}
                  onConfirmAccountEmailChange={onConfirmAccountEmailChange}
                  onRequestPasswordReset={onRequestPasswordReset}
                  onRequestAccountDeletion={onRequestAccountDeletion}
                  onConfirmAccountDeletionCode={onConfirmAccountDeletionCode}
                  onSignOut={onSignOut}
                  onClose={onClose}
                  sectionRef={(element) => {
                    sectionRefs.current.account = element
                  }}
                  onActionFeedbackVisibilityChange={setIsActionFeedbackVisible}
                />

                <AppearanceSettings
                  isOpen={isOpen}
                  isRendered={isRendered}
                  menuBarEnabled={menuBarEnabled}
                  flagsEnabled={flagsEnabled}
                  translucentNavPanel={translucentNavPanel}
                  showWordCount={showWordCount}
                  displayFont={displayFont}
                  bodyFont={bodyFont}
                  uiFont={uiFont}
                  fontSize={fontSize}
                  palette={palette}
                  paletteOptions={paletteOptions}
                  fontOptions={fontOptions}
                  customPaletteBackground={customPaletteBackground}
                  customPaletteAccent={customPaletteAccent}
                  onMenuBarEnabledChange={onMenuBarEnabledChange}
                  onFlagsEnabledChange={onFlagsEnabledChange}
                  onTranslucentNavPanelChange={onTranslucentNavPanelChange}
                  onDisplayFontChange={onDisplayFontChange}
                  onBodyFontChange={onBodyFontChange}
                  onUiFontChange={onUiFontChange}
                  onShowWordCountChange={onShowWordCountChange}
                  onFontSizeChange={onFontSizeChange}
                  onPaletteChange={onPaletteChange}
                  onCustomPaletteBackgroundChange={onCustomPaletteBackgroundChange}
                  onCustomPaletteAccentChange={onCustomPaletteAccentChange}
                  sectionRef={(element) => {
                    sectionRefs.current.appearance = element
                  }}
                />

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

                    <ProjectSettings
                      fieldClassName="global-settings__field"
                      projectName={activeProjectName}
                      markdownEditorEnabled={activeProjectMarkdownEditorEnabled}
                      projectColor={activeProjectColor}
                      projectWallpaperEmojis={activeProjectWallpaperEmojis}
                      projectVersions={activeProjectVersions}
                      onProjectNameChange={onActiveProjectNameChange}
                      onMarkdownEditorEnabledChange={onActiveProjectMarkdownEditorEnabledChange}
                      onProjectColorChange={onActiveProjectColorChange}
                      onProjectWallpaperEmojisChange={onActiveProjectWallpaperEmojisChange}
                      onShowVersionHistory={onShowVersionHistory}
                      onExportProject={onExportProject}
                      sessionToken={sessionToken}
                      documentId={documentId}
                      onMarkdownPromptVisibilityChange={setIsMarkdownPromptVisible}
                      onMarkdownPromptDismissed={onClose}
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
