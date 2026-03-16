import { AArrowDown, AArrowUp, ChevronDown, CornerDownRight, Lock, LockKeyhole, LockOpen, LogOut, Palette, ScrollText, Settings, Trash2, UserRound, X } from "lucide-react"
import { useEffect, useRef, useState, type ComponentType, type CSSProperties } from "react"
import type { ProjectKind } from "../../core/projects"
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
  accountFirstName: string
  accountLastName: string
  accountEmail: string
  activeProjectName: string
  activeProjectKind: ProjectKind
  activeProjectMarkdownEditorEnabled: boolean
  activeProjectColor: string
  activeProjectWallpaperEmojis: string
  onActiveProjectNameChange: (name: string) => void
  onActiveProjectKindChange: (kind: ProjectKind) => void
  onActiveProjectMarkdownEditorEnabledChange: (enabled: boolean) => void
  onActiveProjectColorChange: (color: string) => void
  onActiveProjectWallpaperEmojisChange: (wallpaperEmojis: string) => void
  onExportProject: () => void
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
  accountFirstName,
  accountLastName,
  accountEmail,
  activeProjectName,
  activeProjectKind,
  activeProjectMarkdownEditorEnabled,
  activeProjectColor,
  activeProjectWallpaperEmojis,
  onActiveProjectNameChange,
  onActiveProjectKindChange,
  onActiveProjectMarkdownEditorEnabledChange,
  onActiveProjectColorChange,
  onActiveProjectWallpaperEmojisChange,
  onExportProject,
  onSaveAccountProfile,
  onRequestAccountEmailChange,
  onVerifyCurrentAccountEmailChange,
  onConfirmAccountEmailChange,
  onRequestPasswordReset,
  onRequestAccountDeletion,
  onConfirmAccountDeletionCode,
  onSignOut,
}: GlobalSettingsProps) {
  type ActionFeedback = {
    kind: "password" | "delete"
    title: string
    message: string
    isError: boolean
    email?: string
    userId?: string
    code?: string
    isSubmitting?: boolean
  }

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
  const [accountFirstNameDraft, setAccountFirstNameDraft] = useState(accountFirstName)
  const [accountLastNameDraft, setAccountLastNameDraft] = useState(accountLastName)
  const [accountEmailDraft, setAccountEmailDraft] = useState(accountEmail)
  const [currentEmailCodeDraft, setCurrentEmailCodeDraft] = useState("")
  const [newEmailCodeDraft, setNewEmailCodeDraft] = useState("")
  const [pendingAccountEmail, setPendingAccountEmail] = useState("")
  const [emailChangeStep, setEmailChangeStep] = useState<"idle" | "verify-current-email" | "verify-new-email">("idle")
  const [accountEmailFeedback, setAccountEmailFeedback] = useState("")
  const [accountEmailError, setAccountEmailError] = useState("")
  const [isEmailFieldUnlocked, setIsEmailFieldUnlocked] = useState(false)
  const [accountError, setAccountError] = useState("")
  const [isRequestingEmailChange, setIsRequestingEmailChange] = useState(false)
  const [isVerifyingCurrentEmailChange, setIsVerifyingCurrentEmailChange] = useState(false)
  const [isConfirmingEmailChange, setIsConfirmingEmailChange] = useState(false)
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false)
  const [isDeletingAccount, setIsDeletingAccount] = useState(false)
  const [actionFeedback, setActionFeedback] = useState<ActionFeedback | null>(null)
  const [actionFeedbackSnapshot, setActionFeedbackSnapshot] = useState<ActionFeedback | null>(null)
  const [isActionFeedbackRendered, setIsActionFeedbackRendered] = useState(false)
  const [isActionFeedbackClosing, setIsActionFeedbackClosing] = useState(false)
  const accountAutoSaveRequestRef = useRef(0)
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
  const isActionFeedbackOpen = Boolean(actionFeedback)
  const activeActionFeedback = actionFeedback ?? actionFeedbackSnapshot
  const triggerIsLayeredAboveOverlay = isOpen || isRendered
  const triggerLabel = isOpen ? "Close Settings" : "Open Settings"

  const openActionFeedback = (nextFeedback: ActionFeedback) => {
    setActionFeedback(nextFeedback)
    setActionFeedbackSnapshot(nextFeedback)
  }

  const closeActionFeedback = () => {
    setActionFeedback(null)
  }

  const updateDeleteFeedback = (updater: (current: ActionFeedback) => ActionFeedback) => {
    setActionFeedback((current) => {
      if (!current || current.kind !== "delete") {
        return current
      }

      const next = updater(current)
      setActionFeedbackSnapshot(next)
      return next
    })
  }

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
    setAccountFirstNameDraft(accountFirstName)
  }, [accountFirstName])

  useEffect(() => {
    setAccountLastNameDraft(accountLastName)
  }, [accountLastName])

  useEffect(() => {
    setAccountEmailDraft(accountEmail)
    setIsEmailFieldUnlocked(false)
  }, [accountEmail])

  const hasEmailDraftChanged = accountEmailDraft.trim().toLowerCase() !== accountEmail.trim().toLowerCase()

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
    if (isActionFeedbackOpen) {
      setIsActionFeedbackRendered(true)
      setIsActionFeedbackClosing(false)
      return
    }

    if (!isActionFeedbackRendered) {
      return
    }

    setIsActionFeedbackClosing(true)
    const timeoutId = window.setTimeout(() => {
      setIsActionFeedbackRendered(false)
      setIsActionFeedbackClosing(false)
      setActionFeedbackSnapshot(null)
    }, 170)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [isActionFeedbackOpen, isActionFeedbackRendered])

  useEffect(() => {
    if (!isActionFeedbackRendered) {
      return
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeActionFeedback()
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [isActionFeedbackRendered])

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

  useEffect(() => {
    const nextFirstName = accountFirstNameDraft.trim()
    const nextLastName = accountLastNameDraft.trim()
    const currentFirstName = accountFirstName.trim()
    const currentLastName = accountLastName.trim()

    if (!nextFirstName || !nextLastName) {
      return
    }

    if (nextFirstName.length > 80 || nextLastName.length > 80) {
      setAccountError("First and last name must be 80 characters or fewer.")
      return
    }

    if (nextFirstName === currentFirstName && nextLastName === currentLastName) {
      return
    }

    setAccountError("")

    const requestId = accountAutoSaveRequestRef.current + 1
    accountAutoSaveRequestRef.current = requestId

    const timeoutId = window.setTimeout(async () => {
      try {
        await onSaveAccountProfile({
          firstName: nextFirstName,
          lastName: nextLastName,
        })
      } catch (error) {
        if (accountAutoSaveRequestRef.current === requestId) {
          setAccountError(error instanceof Error ? error.message : "Failed to update account details")
        }
      } finally {
        if (accountAutoSaveRequestRef.current === requestId) {
        }
      }
    }, 420)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [accountFirstNameDraft, accountLastNameDraft, accountFirstName, accountLastName, onSaveAccountProfile])

  const requestAccountEmailChange = async () => {
    const nextEmail = accountEmailDraft.trim().toLowerCase()

    if (!nextEmail) {
      setAccountEmailError("Email is required.")
      setAccountEmailFeedback("")
      return
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
      setAccountEmailError("Enter a valid email address.")
      setAccountEmailFeedback("")
      return
    }

    if (nextEmail === accountEmail.toLowerCase()) {
      setAccountEmailError("This is already your current email.")
      setAccountEmailFeedback("")
      return
    }

    setIsRequestingEmailChange(true)
    setAccountEmailError("")
    setAccountEmailFeedback("")

    try {
      const result = await onRequestAccountEmailChange(nextEmail)
      setPendingAccountEmail(result.change.newEmail)
      setEmailChangeStep("verify-current-email")
      setCurrentEmailCodeDraft("")
      setNewEmailCodeDraft("")
      setAccountEmailFeedback(`Code sent to your current email (${result.change.currentEmail}). Enter it to continue.`)
    } catch (error) {
      setAccountEmailError(error instanceof Error ? error.message : "Failed to request email change")
    } finally {
      setIsRequestingEmailChange(false)
    }
  }

  const verifyCurrentAccountEmailChange = async () => {
    const code = currentEmailCodeDraft.trim()
    if (!/^\d{6}$/.test(code)) {
      setAccountEmailError("Enter the 6-digit code sent to your current email.")
      setAccountEmailFeedback("")
      return
    }

    setIsVerifyingCurrentEmailChange(true)
    setAccountEmailError("")
    setAccountEmailFeedback("")

    try {
      const result = await onVerifyCurrentAccountEmailChange(code)
      setEmailChangeStep("verify-new-email")
      setPendingAccountEmail(result.change.newEmail)
      setNewEmailCodeDraft("")
      setAccountEmailFeedback(`Current email verified. Enter the 6-digit code sent to ${result.change.newEmail}.`)
    } catch (error) {
      setAccountEmailError(error instanceof Error ? error.message : "Failed to verify current email")
    } finally {
      setIsVerifyingCurrentEmailChange(false)
    }
  }

  const confirmAccountEmailChange = async () => {
    const code = newEmailCodeDraft.trim()
    if (!/^\d{6}$/.test(code)) {
      setAccountEmailError("Enter the 6-digit code sent to your new email.")
      setAccountEmailFeedback("")
      return
    }

    setIsConfirmingEmailChange(true)
    setAccountEmailError("")
    setAccountEmailFeedback("")

    try {
      await onConfirmAccountEmailChange(code)
      setPendingAccountEmail("")
      setEmailChangeStep("idle")
      setCurrentEmailCodeDraft("")
      setNewEmailCodeDraft("")
      setAccountEmailFeedback("Email updated successfully.")
    } catch (error) {
      setAccountEmailError(error instanceof Error ? error.message : "Failed to confirm email change")
    } finally {
      setIsConfirmingEmailChange(false)
    }
  }

  const requestPasswordReset = async () => {
    setIsUpdatingPassword(true)
    onClose()

    openActionFeedback({
      kind: "password",
      title: "Reset Password",
      message: "Sending password reset email...",
      isError: false,
    })

    try {
      const result = await onRequestPasswordReset()
      openActionFeedback({
        kind: "password",
        title: "Reset Link Sent",
        message: `Password reset email sent to ${result.reset.email}. Open the link in that email to set your new password.`,
        isError: false,
      })
    } catch (error) {
      openActionFeedback({
        kind: "password",
        title: "Unable To Send Reset Link",
        message: error instanceof Error ? error.message : "Failed to request password reset",
        isError: true,
      })
    } finally {
      setIsUpdatingPassword(false)
    }
  }

  const requestAccountDeletion = async () => {
    setIsDeletingAccount(true)
    onClose()

    openActionFeedback({
      kind: "delete",
      title: "Delete Account",
      message: "Sending deletion confirmation email...",
      isError: false,
      email: "",
      userId: "",
      code: "",
      isSubmitting: false,
    })

    try {
      const result = await onRequestAccountDeletion()
      updateDeleteFeedback((current) => ({
        ...current,
        title: "Delete Account",
        message: `A delete confirmation email was sent to ${result.deletion.email}. Enter the 6-digit code from that email to delete your account now, or use the email link.`,
        isError: false,
        email: result.deletion.email,
        userId: result.deletion.userId,
        code: current.code ?? "",
        isSubmitting: false,
      }))
    } catch (error) {
      updateDeleteFeedback((current) => ({
        ...current,
        title: "Unable To Send Deletion Link",
        message: error instanceof Error ? error.message : "Failed to delete account",
        isError: true,
        isSubmitting: false,
      }))
    } finally {
      setIsDeletingAccount(false)
    }
  }

  const confirmDeleteAccountWithCode = async () => {
    if (!activeActionFeedback || activeActionFeedback.kind !== "delete") {
      return
    }

    const userId = (activeActionFeedback.userId ?? "").trim()
    const code = (activeActionFeedback.code ?? "").trim()

    if (!userId) {
      updateDeleteFeedback((current) => ({
        ...current,
        isError: true,
        message: "Missing deletion request. Please request account deletion again.",
      }))
      return
    }

    if (!/^\d{6}$/.test(code)) {
      updateDeleteFeedback((current) => ({
        ...current,
        isError: true,
        message: "Enter the 6-digit code from your deletion email.",
      }))
      return
    }

    updateDeleteFeedback((current) => ({
      ...current,
      isSubmitting: true,
      isError: false,
    }))

    try {
      await onConfirmAccountDeletionCode({ userId, code })
      closeActionFeedback()
    } catch (error) {
      updateDeleteFeedback((current) => ({
        ...current,
        isSubmitting: false,
        isError: true,
        message: error instanceof Error ? error.message : "Failed to confirm account deletion",
      }))
    }
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

                  <div className="global-settings__name-row">
                    <label className="global-settings__field" htmlFor="settings-account-first-name">
                      <span>First name</span>
                      <input
                        id="settings-account-first-name"
                        type="text"
                        value={accountFirstNameDraft}
                        onChange={(event) => {
                          setAccountFirstNameDraft(event.target.value)
                        }}
                        onBlur={() => {
                          if (!accountFirstNameDraft.trim()) {
                            setAccountFirstNameDraft(accountFirstName)
                          }
                        }}
                        maxLength={80}
                        autoComplete="given-name"
                      />
                    </label>

                    <label className="global-settings__field" htmlFor="settings-account-last-name">
                      <span>Last name</span>
                      <input
                        id="settings-account-last-name"
                        type="text"
                        value={accountLastNameDraft}
                        onChange={(event) => {
                          setAccountLastNameDraft(event.target.value)
                        }}
                        onBlur={() => {
                          if (!accountLastNameDraft.trim()) {
                            setAccountLastNameDraft(accountLastName)
                          }
                        }}
                        maxLength={80}
                        autoComplete="family-name"
                      />
                    </label>
                  </div>

                  <div className="global-settings__field">
                    <span>Email</span>
                    <div className="global-settings__email-field-row">
                      <input
                        className={`global-settings__email-input ${isEmailFieldUnlocked ? "global-settings__email-input--unlocked" : "global-settings__email-input--locked"}`.trim()}
                        id="settings-account-email"
                        type="text"
                        value={accountEmailDraft}
                        onChange={(event) => {
                          setAccountEmailDraft(event.target.value)
                        }}
                        autoComplete="email"
                        spellCheck={false}
                        disabled={!isEmailFieldUnlocked || isRequestingEmailChange || isVerifyingCurrentEmailChange || isConfirmingEmailChange}
                      />
                      <button
                        type="button"
                        className="global-settings__email-lock-btn"
                        aria-label={isEmailFieldUnlocked ? "Lock email field" : "Unlock email field"}
                        title={isEmailFieldUnlocked ? "Lock email field" : "Unlock email field"}
                        onClick={() => {
                          setIsEmailFieldUnlocked((current) => !current)
                        }}
                        disabled={isRequestingEmailChange || isVerifyingCurrentEmailChange || isConfirmingEmailChange}
                      >
                        {isEmailFieldUnlocked ? <LockOpen size={15} strokeWidth={2} aria-hidden={true} /> : <Lock size={15} strokeWidth={2} aria-hidden={true} />}
                      </button>
                    </div>
                  </div>

                  <div className="global-settings__account-actions">
                    {hasEmailDraftChanged ? (
                      <button
                        type="button"
                        className="global-settings__account-action"
                        onClick={() => {
                          void requestAccountEmailChange()
                        }}
                        disabled={!isEmailFieldUnlocked || isRequestingEmailChange || isVerifyingCurrentEmailChange || isConfirmingEmailChange}
                      >
                        {isRequestingEmailChange ? "Sending..." : "Save email change"}
                      </button>
                    ) : null}

                    {emailChangeStep === "verify-current-email" ? (
                      <label className="global-settings__field" htmlFor="settings-account-email-current-code">
                        <span>Current email code</span>
                        <input
                          id="settings-account-email-current-code"
                          type="text"
                          inputMode="numeric"
                          value={currentEmailCodeDraft}
                          onChange={(event) => {
                            setCurrentEmailCodeDraft(event.target.value.replace(/\D/g, "").slice(0, 6))
                          }}
                          autoComplete="one-time-code"
                          placeholder="123456"
                          disabled={isVerifyingCurrentEmailChange}
                        />
                      </label>
                    ) : null}

                    {emailChangeStep === "verify-current-email" ? (
                      <button
                        type="button"
                        className="global-settings__account-action"
                        onClick={() => {
                          void verifyCurrentAccountEmailChange()
                        }}
                        disabled={isVerifyingCurrentEmailChange}
                      >
                        {isVerifyingCurrentEmailChange ? "Verifying..." : "Verify current email"}
                      </button>
                    ) : null}

                    {emailChangeStep === "verify-new-email" ? (
                      <label className="global-settings__field" htmlFor="settings-account-email-new-code">
                        <span>New email code</span>
                        <input
                          id="settings-account-email-new-code"
                          type="text"
                          inputMode="numeric"
                          value={newEmailCodeDraft}
                          onChange={(event) => {
                            setNewEmailCodeDraft(event.target.value.replace(/\D/g, "").slice(0, 6))
                          }}
                          autoComplete="one-time-code"
                          placeholder="123456"
                          disabled={isConfirmingEmailChange}
                        />
                      </label>
                    ) : null}

                    {emailChangeStep === "verify-new-email" ? (
                      <button
                        type="button"
                        className="global-settings__account-action"
                        onClick={() => {
                          void confirmAccountEmailChange()
                        }}
                        disabled={isConfirmingEmailChange}
                      >
                        {isConfirmingEmailChange ? "Confirming..." : "Confirm email change"}
                      </button>
                    ) : null}

                    {pendingAccountEmail ? <p className="global-settings__section-copy">Pending new email: {pendingAccountEmail}</p> : null}

                    {accountEmailFeedback ? <p className="global-settings__account-feedback">{accountEmailFeedback}</p> : null}
                    {accountEmailError ? <p className="global-settings__account-error">{accountEmailError}</p> : null}
                  </div>

                  {accountError ? <p className="global-settings__account-error">{accountError}</p> : null}

                  <div className="global-settings__account-footer-actions">
                    <button
                      type="button"
                      className="global-settings__account-action global-settings__account-action--minimal"
                      onClick={() => {
                        void requestPasswordReset()
                      }}
                      disabled={isUpdatingPassword}
                    >
                      <LockKeyhole size={14} strokeWidth={2} aria-hidden={true} />
                      {isUpdatingPassword ? "Sending..." : "Change password"}
                    </button>
                    <button
                      type="button"
                      className="global-settings__account-action global-settings__account-action--minimal"
                      onClick={onSignOut}
                    >
                      <LogOut size={14} strokeWidth={2} aria-hidden={true} />
                      Sign out
                    </button>
                    <button
                      type="button"
                      className="global-settings__account-action global-settings__account-action--danger-minimal"
                      onClick={() => {
                        void requestAccountDeletion()
                      }}
                      disabled={isDeletingAccount}
                    >
                      <Trash2 size={14} strokeWidth={2} aria-hidden={true} />
                      {isDeletingAccount ? "Sending..." : "Delete"}
                    </button>
                  </div>

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
                      markdownEditorEnabled={activeProjectMarkdownEditorEnabled}
                      projectColor={activeProjectColor}
                      projectWallpaperEmojis={activeProjectWallpaperEmojis}
                      onProjectNameChange={onActiveProjectNameChange}
                      onProjectKindChange={onActiveProjectKindChange}
                      onMarkdownEditorEnabledChange={onActiveProjectMarkdownEditorEnabledChange}
                      onProjectColorChange={onActiveProjectColorChange}
                      onProjectWallpaperEmojisChange={onActiveProjectWallpaperEmojisChange}
                      onExportProject={onExportProject}
                    />
                  </section>
                ) : null}
              </div>
            </div>
          </section>

        </>
      ) : null}

      {isActionFeedbackRendered && activeActionFeedback ? (
        <>
          <div
            className={`project-settings-modal__overlay ${isActionFeedbackClosing ? "project-settings-modal__overlay--closing" : "project-settings-modal__overlay--opening"}`.trim()}
            onMouseDown={closeActionFeedback}
            aria-hidden="true"
          />
          <div className="project-settings-modal__frame">
            <button
              type="button"
              className={`project-settings-modal__floating-close ${isActionFeedbackClosing ? "project-settings-modal__floating-close--closing" : "project-settings-modal__floating-close--opening"}`.trim()}
              onClick={closeActionFeedback}
              aria-label="Close action result"
            >
              <X size={16} strokeWidth={2} aria-hidden={true} />
              <span className="project-settings-modal__floating-close-label">Close Settings</span>
            </button>

            <div
              className={`project-settings-modal__modal ${isActionFeedbackClosing ? "project-settings-modal__modal--closing" : "project-settings-modal__modal--opening"} ${activeActionFeedback.kind === "delete" ? "project-delete-modal__modal" : ""}`.trim()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="global-settings-action-feedback-title"
            >
              <div className="project-settings-modal__header">
                <h3 id="global-settings-action-feedback-title" className="project-settings-modal__title">
                  {activeActionFeedback.kind === "delete" ? <Trash2 size={19} strokeWidth={1.9} aria-hidden={true} /> : <LockKeyhole size={19} strokeWidth={1.9} aria-hidden={true} />}
                  <span>{activeActionFeedback.title}</span>
                </h3>
              </div>

              <p className={activeActionFeedback.isError ? "project-settings-modal__error" : "project-delete-modal__copy"}>{activeActionFeedback.message}</p>

              {activeActionFeedback.kind === "delete" ? (
                <label className="global-settings__delete-code-field" htmlFor="settings-delete-account-code">
                  <span>6-digit code</span>
                  <input
                    id="settings-delete-account-code"
                    className="global-settings__delete-code-input"
                    type="text"
                    inputMode="numeric"
                    value={activeActionFeedback.code ?? ""}
                    onChange={(event) => {
                      const nextCode = event.target.value.replace(/\D/g, "").slice(0, 6)
                      updateDeleteFeedback((current) => ({
                        ...current,
                        code: nextCode,
                      }))
                    }}
                    autoComplete="one-time-code"
                    placeholder="123456"
                    disabled={Boolean(activeActionFeedback.isSubmitting)}
                  />
                </label>
              ) : null}

              {activeActionFeedback.kind === "delete" ? (
                <div className="project-settings-modal__actions">
                  <button
                    type="button"
                    className="project-settings-modal__btn project-settings-modal__btn--danger"
                    onClick={() => {
                      void confirmDeleteAccountWithCode()
                    }}
                    disabled={Boolean(activeActionFeedback.isSubmitting)}
                  >
                    <Trash2 size={14} strokeWidth={2} aria-hidden={true} />
                    {activeActionFeedback.isSubmitting ? "Deleting..." : "Delete Account"}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </>
      ) : null}
    </>
  )
}
