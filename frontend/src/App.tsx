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

  let content: ReactNode = null

  if (app.currentPathname === "/reset-password") {
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
        <GlobalCaretOverlay />
      </>
    )
  }

  return (
    <AppLayout
      palette={app.style.palette}
      appStyleVariables={app.style.appStyleVariables}
      menuBarEnabled={app.menuBarProps.enabled}
      menuItems={app.menuBarProps.items}
      onNavigateHome={app.brandProps.onNavigateHome}
    >
      {content}
    </AppLayout>
  )
}