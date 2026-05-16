import { useEffect, useState, type CSSProperties, type ReactNode } from "react"
import type { MenuItem } from "../../../core/utils/menu"
import WebMenu from "./WebMenu"

type AppLayoutProps = {
  palette: string
  appStyleVariables: CSSProperties
  menuBarEnabled: boolean
  menuItems: MenuItem[]
  showBrand: boolean
  translucentNavPanel: boolean
  onNavigateHome: () => void
  children: ReactNode
}

export default function AppLayout({
  palette,
  appStyleVariables,
  menuBarEnabled,
  menuItems,
  showBrand,
  translucentNavPanel,
  onNavigateHome,
  children,
}: AppLayoutProps) {
  const isElectronMac = Boolean(window.electronAPI) && window.electronAPI?.platform === "darwin"
  const [isWindowFullscreen, setIsWindowFullscreen] = useState(false)

  useEffect(() => {
    if (!isElectronMac || !window.electronAPI?.isFullScreen) {
      setIsWindowFullscreen(false)
      return
    }

    let isActive = true

    const syncWindowState = async () => {
      const fullscreen = await window.electronAPI?.isFullScreen()
      if (isActive) {
        setIsWindowFullscreen(Boolean(fullscreen))
      }
    }

    const handleWindowStateChange = () => {
      void syncWindowState()
    }

    handleWindowStateChange()
    window.addEventListener("resize", handleWindowStateChange)
    window.addEventListener("focus", handleWindowStateChange)

    return () => {
      isActive = false
      window.removeEventListener("resize", handleWindowStateChange)
      window.removeEventListener("focus", handleWindowStateChange)
    }
  }, [isElectronMac])

  const appClassName = [
    "app",
    `app--palette-${palette}`,
    isElectronMac ? "app--electron-mac" : "",
    isElectronMac && isWindowFullscreen ? "app--window-fullscreen" : "",
    isElectronMac && translucentNavPanel ? "app--translucent-nav" : "",
  ].filter(Boolean).join(" ")

  // Toggle translucent-nav class on <html> for global CSS
  useEffect(() => {
    if (isElectronMac) {
      document.documentElement.classList.toggle("translucent-nav", translucentNavPanel)
    }
    return () => {
      if (isElectronMac) {
        document.documentElement.classList.remove("translucent-nav")
      }
    }
  }, [isElectronMac, translucentNavPanel])

  return (
    <div className={appClassName} style={appStyleVariables}>
      <main className="app-main">
        {menuBarEnabled && !isElectronMac && <WebMenu items={menuItems} />}
        {showBrand && (
          <button
            type="button"
            className={`app-brand ${menuBarEnabled && !isElectronMac ? "app-brand--with-menu" : ""}`.trim()}
            aria-label="Go to home page"
            onClick={onNavigateHome}
          >
            <span className="app-brand__name">ivoryscribe</span>
            <span className="app-brand__tagline">write an epic. save a species.</span>
          </button>
        )}
        <div className="app-view">
          {children}
        </div>
      </main>
    </div>
  )
}

