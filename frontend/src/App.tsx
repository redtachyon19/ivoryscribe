import "./App.css"
import { useAppOrchestration } from "./core/useAppOrchestration"
import AppShell from "./webapp/components/layout/AppShell"
import AppLayout from "./webapp/components/layout/AppLayout"
import GlobalSettings from "./webapp/components/settings/GlobalSettings"
import GlobalCaretOverlay from "./webapp/components/layout/GlobalCaretOverlay"
import Home from "./landing/pages/Home"
import AuthPage from "./webapp/pages/AuthPage"
import EditorWorkspace from "./webapp/pages/EditorWorkspace"
import PasswordResetPage from "./webapp/pages/PasswordResetPage"
import ProjectLibrary from "./webapp/pages/ProjectLibrary"

export default function App() {
  const app = useAppOrchestration()

  if (app.currentPathname === "/reset-password") return <AppShell style={app.style}><PasswordResetPage {...app.passwordResetProps} /></AppShell>
  if (app.isAuthBootstrapping) return <AppShell style={app.style}><section className="app-loading"><p>Loading workspace...</p></section></AppShell>
  if (app.currentPathname === "/") return <AppShell style={app.style}><Home {...app.homeProps} /></AppShell>
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