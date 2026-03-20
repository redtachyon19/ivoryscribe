import "./App.css"
import { useAppOrchestration } from "./core/useAppOrchestration"
import AppShell from "./webapp/components/layout/AppShell"
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
import EditorWorkspace from "./webapp/pages/EditorWorkspace"
import PasswordResetPage from "./webapp/pages/PasswordResetPage"
import ProjectLibrary from "./webapp/pages/ProjectLibrary"

export default function App() {
  const app = useAppOrchestration()

  if (app.currentPathname === "/reset-password") return <AppShell style={app.style}><PasswordResetPage {...app.passwordResetProps} /></AppShell>
  if (app.isAuthBootstrapping) return <AppShell style={app.style}><section className="app-loading"><p>Loading workspace...</p></section></AppShell>
  if (app.currentPathname === "/") return <AppShell style={app.style}><Home {...app.homeProps} /></AppShell>
  if (app.currentPathname === "/mission") return <AppShell style={app.style}><MissionPage {...app.homeProps} /></AppShell>
  if (app.currentPathname === "/transparency") return <AppShell style={app.style}><TransparencyPage {...app.homeProps} /></AppShell>
  if (app.currentPathname === "/careers") return <AppShell style={app.style}><CareersPage {...app.homeProps} /></AppShell>
  if (app.currentPathname === "/products-pricing") return <AppShell style={app.style}><ProductsPricingPage {...app.homeProps} /></AppShell>
  if (app.currentPathname === "/download") return <AppShell style={app.style}><DownloadPage {...app.homeProps} /></AppShell>
  if (app.currentPathname === "/auth" || !app.session) return <AppShell style={app.style}><AuthPage {...app.authProps} /></AppShell>

  return (
    <AppShell style={app.style}>
      <AppLayout
        menuBar={app.menuBarProps}
        brand={app.brandProps}
        fadePhase={app.viewFadePhase}
      >
        {app.view === "projects" || !app.activeProject
          ? <ProjectLibrary {...app.projectLibraryProps} />
          : <EditorWorkspace {...app.editorProps!} />
        }
      </AppLayout>
      <GlobalSettings {...app.settingsProps!} />
      <GlobalCaretOverlay />
    </AppShell>
  )
}