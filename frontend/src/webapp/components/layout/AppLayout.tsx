import type { CSSProperties, ReactNode } from "react"
import type { MenuItem } from "../../../core/menu"
import WebMenu from "./WebMenu"

type AppLayoutProps = {
  palette: string
  appStyleVariables: CSSProperties
  menuBarEnabled: boolean
  menuItems: MenuItem[]
  showBrand: boolean
  onNavigateHome: () => void
  children: ReactNode
}

export default function AppLayout({
  palette,
  appStyleVariables,
  menuBarEnabled,
  menuItems,
  showBrand,
  onNavigateHome,
  children,
}: AppLayoutProps) {
  return (
    <div className={`app app--palette-${palette}`} style={appStyleVariables}>
      <main className="app-main">
        {menuBarEnabled && <WebMenu items={menuItems} />}
        {showBrand && (
          <button
            type="button"
            className={`app-brand ${menuBarEnabled ? "app-brand--with-menu" : ""}`.trim()}
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

