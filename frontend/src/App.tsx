import "./App.css"
import { type ReactNode } from "react"
import { useAppOrchestration } from "./core/hooks/useAppOrchestration"
import { useEscapeToDeselect } from "./core/hooks/useEscapeToDeselect"
import { useManualSaveShortcut } from "./core/hooks/useManualSaveShortcut"
import { useLocalRoot } from "./core/electron/localWorkspace"
import AppLayout from "./webapp/components/layout/AppLayout"
import GlobalSettings from "./webapp/components/settings/GlobalSettings"
import GlobalCaretOverlay from "./webapp/components/layout/GlobalCaretOverlay"
import VersionHistory from "./webapp/components/version-history/VersionHistory"
import AlphaBanner from "./landing/components/AlphaBanner"
import Home from "./landing/pages/Home"
import AboutPage from "./landing/pages/AboutPage"
import OpenSourcePage from "./landing/pages/OpenSourcePage"
import DownloadPage from "./landing/pages/DownloadPage.tsx"
import AuthPage from "./webapp/pages/AuthPage"
import Editor from "./webapp/pages/Editor"
import VersionPreviewPage from "./webapp/pages/VersionPreviewPage"
import PasswordResetPage from "./webapp/pages/PasswordResetPage"

export default function App() {
  const app = useAppOrchestration()
  const isElectron = Boolean(window.electronAPI)
  const localRoot = useLocalRoot()
  // Escape clears any active text selection, everywhere in the app.
  useEscapeToDeselect()
  // ⌘/Ctrl+S triggers a manual save (and the accent perimeter glow).
  useManualSaveShortcut()

  let content: ReactNode = null

  // ─── Version preview window ─────────────────────────────────────────────
  // Standalone read-only view of a single saved version, opened in its own
  // window from Version History. Checked first (before the auth / electron
  // branches) so it renders regardless of session state; it reads its data
  // from a localStorage handoff (see openVersionPreviewWindow).
  const isVersionPreview = app.currentPathname === "/version-preview"
  if (isVersionPreview) {
    content = <VersionPreviewPage />
  }
  // ─── ELECTRON: local-first, no auth required ────────────────────────────
  // Renders the same Editor + Library used everywhere else. The local
  // filesystem sync wired into useAppOrchestration sources projects from the
  // user's workspace folder and writes edits back to disk. Sharing prompts an
  // auth overlay when the user is signed out.
  else if (isElectron) {
    if (!localRoot.isReady) {
      content = <section className="app-loading"><p>Opening workspace…</p></section>
    } else {
      content = (
        <>
          <Editor {...app.editorProps!} />
          <GlobalSettings {...app.settingsProps!} />
          <VersionHistory {...app.versionHistoryProps} />
          <GlobalCaretOverlay />
          {app.isAuthOverlayOpen && (
            <div className="auth-overlay" role="dialog" aria-modal="true">
              <button
                type="button"
                className="auth-overlay__close"
                onClick={app.closeAuthOverlay}
                aria-label="Back to app"
              >×</button>
              {/* Full-page sign-in over the (still-mounted) editor. Back/brand and
                  a successful sign-in both just close the overlay → back to the app. */}
              <AuthPage
                {...app.authProps}
                onBackToLanding={app.closeAuthOverlay}
                onLaunchDashboard={app.closeAuthOverlay}
              />
            </div>
          )}
        </>
      )
    }
  }
  // ─── WEB (browser) routing: landing, auth, cloud-backed editor ──────────
  else if (app.currentPathname === "/reset-password") {
    content = <PasswordResetPage {...app.passwordResetProps} />
  } else if (app.isAuthBootstrapping) {
    content = <section className="app-loading"><p>Loading workspace...</p></section>
  } else if (app.currentPathname === "/") {
    content = <Home {...app.homeProps} />
  } else if (app.currentPathname === "/about") {
    content = <AboutPage {...app.homeProps} />
  } else if (app.currentPathname === "/open-source") {
    content = <OpenSourcePage {...app.homeProps} />
  } else if (app.currentPathname === "/download") {
    content = <DownloadPage {...app.homeProps} />
  } else if (app.currentPathname === "/auth" || !app.session) {
    content = <AuthPage {...app.authProps} />
  } else {
    content = (
      <>
        <Editor {...app.editorProps!} />
        <GlobalSettings {...app.settingsProps!} />
        <VersionHistory {...app.versionHistoryProps} />
        <GlobalCaretOverlay />
      </>
    )
  }

  const landingRoutes = ["/", "/about", "/open-source", "/download", "/auth", "/reset-password"]
  const isWorkspace = isElectron || (app.session && !landingRoutes.includes(app.currentPathname))

  // The public marketing pages (the ones built on .auth-gateway-page) get the
  // dismissible alpha notice pinned to the top. Excludes the web /auth and
  // /reset-password screens, the editor, and the Electron app.
  const marketingRoutes = ["/", "/about", "/open-source", "/download"]
  const isMarketing =
    !isVersionPreview && !isElectron && !app.isAuthBootstrapping && marketingRoutes.includes(app.currentPathname)
  if (isMarketing) {
    content = (
      <>
        <AlphaBanner />
        {content}
      </>
    )
  }

  return (
    <AppLayout
      palette={app.style.palette}
      appStyleVariables={app.style.appStyleVariables}
      menuBarEnabled={app.menuBarProps.enabled}
      menuItems={app.menuBarProps.items}
      showBrand={!isVersionPreview && Boolean(isWorkspace) && !isElectron}
      translucentNavPanel={app.isTranslucentNavPanel}
      onNavigateHome={app.brandProps.onNavigateHome}
    >
      {content}
    </AppLayout>
  )
}
