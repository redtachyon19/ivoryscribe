import "./App.css"
import { type ReactNode } from "react"
import { useAppOrchestration } from "./core/hooks/useAppOrchestration"
import { useLocalRoot } from "./core/electron/localWorkspace"
import AppLayout from "./webapp/components/layout/AppLayout"
import GlobalSettings from "./webapp/components/settings/GlobalSettings"
import GlobalCaretOverlay from "./webapp/components/layout/GlobalCaretOverlay"
import VersionHistory from "./webapp/components/version-history/VersionHistory"
import Home from "./landing/pages/Home"
import MissionPage from "./landing/pages/MissionPage"
import TransparencyPage from "./landing/pages/TransparencyPage"
import ProductsPricingPage from "./landing/pages/ProductsPricingPage"
import DownloadPage from "./landing/pages/DownloadPage.tsx"
import CareersPage from "./landing/pages/CareersPage"
import AuthPage from "./webapp/pages/AuthPage"
import Editor from "./webapp/pages/Editor"
import VersionPreviewPage from "./webapp/pages/VersionPreviewPage"
import PasswordResetPage from "./webapp/pages/PasswordResetPage"

export default function App() {
  const app = useAppOrchestration()
  const isElectron = Boolean(window.electronAPI)
  const localRoot = useLocalRoot()

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
                className="auth-overlay__backdrop"
                aria-label="Close sign-in"
                onClick={app.closeAuthOverlay}
              />
              <div className="auth-overlay__panel">
                <button
                  type="button"
                  className="auth-overlay__close"
                  onClick={app.closeAuthOverlay}
                  aria-label="Close"
                >×</button>
                <AuthPage {...app.authProps} />
              </div>
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
  } else if (app.currentPathname === "/mission") {
    content = <MissionPage {...app.homeProps} />
  } else if (app.currentPathname === "/transparency") {
    content = <TransparencyPage {...app.homeProps} />
  } else if (app.currentPathname === "/careers") {
    content = <CareersPage {...app.homeProps} />
  } else if (app.currentPathname === "/products-pricing") {
    content = <ProductsPricingPage {...app.homeProps} />
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

  const landingRoutes = ["/", "/mission", "/transparency", "/careers", "/products-pricing", "/download", "/auth", "/reset-password"]
  const isWorkspace = isElectron || (app.session && !landingRoutes.includes(app.currentPathname))

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
