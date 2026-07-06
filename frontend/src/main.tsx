// Must run before React commits anything — installs a dev-only guard around
// performance.measure (see the file for why).
import './core/devPerfMeasureGuard'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Unable to find #root mount element')
}

const showStartupError = (title: string, details: string) => {
  rootElement.innerHTML = `
    <div style="min-height:100vh;display:grid;place-items:center;padding:24px;background:#120f0d;color:#f5e8de;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;">
      <div style="max-width:900px;width:100%;border:1px solid #6e3d2a;background:#1a1411;border-radius:10px;padding:18px 20px;">
        <h1 style="margin:0 0 10px;font-size:18px;line-height:1.3;">${title}</h1>
        <pre style="margin:0;white-space:pre-wrap;word-break:break-word;font-size:13px;line-height:1.45;opacity:.95;">${details}</pre>
      </div>
    </div>
  `
}

window.addEventListener('error', (event) => {
  const errorMessage = event.error instanceof Error ? event.error.stack ?? event.error.message : String(event.message)
  showStartupError('Ivoryscribe crashed during startup', errorMessage)
})

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason
  const details = reason instanceof Error ? reason.stack ?? reason.message : JSON.stringify(reason, null, 2)
  showStartupError('Ivoryscribe failed with an unhandled promise rejection', details)
})

createRoot(rootElement).render(
  <App />,
)
