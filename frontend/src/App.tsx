import "./App.css"
import type { ReactNode } from "react"
import { useAppOrchestration } from "./core/useAppOrchestration"
import AppLayout from "./webapp/components/layout/AppLayout"
import GlobalSettings from "./webapp/components/settings/GlobalSettings"
import GlobalCaretOverlay from "./webapp/components/layout/GlobalCaretOverlay"
import Home from "./landing/pages/Home"
import MissionPage from "./landing/pages/MissionPage"
import TransparencyPage from "./landing/pages/TransparencyPage"
import ProductsPricingPage from "./landing/pages/ProductsPricingPage"
import DownloadPage from "./landing/pages/DownloadPage.tsx"
import CareersPage from "./landing/pages/CareersPage"
import AuthPage from "./webapp/pages/AuthPage"
import Editor from "./webapp/pages/Editor"
import PasswordResetPage from "./webapp/pages/PasswordResetPage"

export default function App() {
  const app = useAppOrchestration()
  const isElectron = Boolean(window.electronAPI)

  let content: ReactNode = null

  if (app.currentPathname === "/reset-password") {
    content = <PasswordResetPage {...app.passwordResetProps} />
  } else if (app.isAuthBootstrapping) {
    content = <section className="app-loading"><p>Loading workspace...</p></section>
  } else if (!isElectron && app.currentPathname === "/") {
    content = <Home {...app.homeProps} />
  } else if (!isElectron && app.currentPathname === "/mission") {
    content = <MissionPage {...app.homeProps} />
  } else if (!isElectron && app.currentPathname === "/transparency") {
    content = <TransparencyPage {...app.homeProps} />
  } else if (!isElectron && app.currentPathname === "/careers") {
    content = <CareersPage {...app.homeProps} />
  } else if (!isElectron && app.currentPathname === "/products-pricing") {
    content = <ProductsPricingPage {...app.homeProps} />
  } else if (!isElectron && app.currentPathname === "/download") {
    content = <DownloadPage {...app.homeProps} />
  } else if (app.currentPathname === "/auth" || !app.session) {
    content = <AuthPage {...app.authProps} />
  } else {
    content = (
      <>
        <Editor {...app.editorProps!} />
        <GlobalSettings {...app.settingsProps!} />
        <GlobalCaretOverlay />
      </>
    )
  }

  const landingRoutes = ["/", "/mission", "/transparency", "/careers", "/products-pricing", "/download", "/auth", "/reset-password"]
  const isWorkspace = app.session && (isElectron || !landingRoutes.includes(app.currentPathname))

  return (
    <AppLayout
      palette={app.style.palette}
      appStyleVariables={app.style.appStyleVariables}
      menuBarEnabled={app.menuBarProps.enabled}
      menuItems={app.menuBarProps.items}
      showBrand={Boolean(isWorkspace) && !isElectron}
      translucentNavPanel={app.isTranslucentNavPanel}
      onNavigateHome={app.brandProps.onNavigateHome}
    >
      {content}
    </AppLayout>
  )
}