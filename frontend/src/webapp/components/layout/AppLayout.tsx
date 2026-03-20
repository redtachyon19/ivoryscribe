import type { ReactNode } from "react"
import type { MenuItem } from "../../../core/menu"
import WebMenu from "./WebMenu"

type AppLayoutProps = {
  menuBar: { enabled: boolean; items: MenuItem[] }
  brand: { hasMenu: boolean; onNavigateHome: () => void }
  fadePhase: "idle" | "fading-out" | "fading-in"
  children: ReactNode
}

export default function AppLayout({ menuBar, brand, fadePhase, children }: AppLayoutProps) {
  return (
    <main className="app-main">
      {menuBar.enabled && <WebMenu items={menuBar.items} />}
      <button
        type="button"
        className={`app-brand ${brand.hasMenu ? "app-brand--with-menu" : ""}`.trim()}
        aria-label="Go to home page"
        onClick={brand.onNavigateHome}
      >
        <span className="app-brand__name">ivoryscribe</span>
        <span className="app-brand__tagline">write an epic. save a species.</span>
      </button>
      <div className={`app-view ${fadePhase === "fading-out" ? "app-view--fade-out" : ""} ${fadePhase === "fading-in" ? "app-view--fade-in" : ""}`.trim()}>
        {children}
      </div>
    </main>
  )
}
