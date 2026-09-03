import "./App.css"
import { type CSSProperties, type ReactNode } from "react"
import { useAppOrchestration } from "./core/hooks/useAppOrchestration"
import { useEscapeToDeselect } from "./core/hooks/useEscapeToDeselect"
import { useManualSaveShortcut } from "./core/hooks/useManualSaveShortcut"
import AppLayout from "./webapp/components/layout/AppLayout"
import UpdateBanner from "./webapp/components/layout/UpdateBanner"
import GlobalSettings from "./webapp/components/settings/GlobalSettings"
import GlobalCaretOverlay from "./webapp/components/layout/GlobalCaretOverlay"
import VersionHistory from "./webapp/components/version-history/VersionHistory"
import AuthPage from "./webapp/pages/AuthPage"
import Editor from "./webapp/pages/Editor"
import VersionPreviewPage from "./webapp/pages/VersionPreviewPage"
import PasswordResetPage from "./webapp/pages/PasswordResetPage"

export default function App() {
  const app = useAppOrchestration()
  const isElectron = Boolean(window.electronAPI)
  useEscapeToDeselect()
  useManualSaveShortcut()

  let content: ReactNode = null

  const isVersionPreview = app.currentPathname === "/version-preview"
  if (isVersionPreview) {
    content = <VersionPreviewPage />
  }
  else if (isElectron) {
    if (!app.isLocalRootReady) {
      content = <section className="app-loading"><p>Opening workspace…</p></section>
    } else {
      content = (
        <>
          <Editor {...app.editorProps!} />
          <GlobalSettings {...app.settingsProps!} />
          <VersionHistory {...app.versionHistoryProps} />
          <GlobalCaretOverlay />
          <UpdateBanner />
          {app.isAuthOverlayOpen && (
            <div className="auth-overlay" role="dialog" aria-modal="true">
              <button
                type="button"
                className="auth-overlay__close"
                onClick={app.closeAuthOverlay}
                aria-label="Back to app"
              >×</button>
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
  else if (app.currentPathname === "/reset-password") {
    content = <PasswordResetPage {...app.passwordResetProps} />
  } else if (app.isAuthBootstrapping) {
    content = <section className="app-loading"><p>Loading workspace...</p></section>
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

  // Marketing routes ( /, /about, /transparency, /download ) now live in the
  // standalone website/ app. The product app's only unauthenticated routes are
  // auth and password reset.
  const publicRoutes = ["/auth", "/reset-password"]
  const isWorkspace = isElectron || (app.session && !publicRoutes.includes(app.currentPathname))

  const layoutPalette = app.style.palette
  const layoutStyleVariables = app.style.appStyleVariables as CSSProperties

  return (
    <AppLayout
      palette={layoutPalette}
      appStyleVariables={layoutStyleVariables}
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
