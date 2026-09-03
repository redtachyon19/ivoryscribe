import "./App.css"
import { useEffect, useState, type CSSProperties } from "react"
import Home from "./pages/Home"
import AboutPage from "./pages/AboutPage"
import TransparencyPage from "./pages/TransparencyPage"
import DownloadPage from "./pages/DownloadPage"
import AlphaBanner from "./components/AlphaBanner"

// Where the product app lives. The marketing site links to it for auth and the
// dashboard. In dev the app runs on :5180; in prod set VITE_APP_URL at build.
const APP_URL =
  (import.meta.env.VITE_APP_URL as string | undefined)?.replace(/\/$/, "") || "http://localhost:5180"

// The marketing site renders in the fixed "elephant" (dark) palette. These are
// the same defaults the app filtered down to when it rendered landing routes.
const MARKETING_FONT_VARS = {
  "--app-display-font": '"EB Garamond", serif',
  "--app-body-font": '"Times", "Times New Roman", serif',
  "--app-ui-font": '"Lato", sans-serif',
} as CSSProperties

// Paths that belong to the product app, not the marketing site. The pages hard-
// link to /auth ("Launch in Browser"); we forward those to the app deployment.
function isAppRoute(pathname: string) {
  return pathname === "/auth" || pathname === "/app" || pathname.startsWith("/app/")
}

export default function App() {
  const [pathname, setPathname] = useState(() => window.location.pathname)

  useEffect(() => {
    const onPopState = () => setPathname(window.location.pathname)
    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [])

  useEffect(() => {
    if (isAppRoute(pathname)) {
      window.location.href = `${APP_URL}${pathname}`
    }
  }, [pathname])

  const marketingProps = {
    isLoggedIn: false,
    onLaunchDashboard: () => { window.location.href = `${APP_URL}/app` },
    onOpenAuth: () => { window.location.href = `${APP_URL}/auth` },
  }

  if (isAppRoute(pathname)) {
    // Redirecting to the app — render nothing to avoid a flash of the home page.
    return null
  }

  let page
  switch (pathname) {
    case "/about":
      page = <AboutPage {...marketingProps} />
      break
    case "/transparency":
      page = <TransparencyPage {...marketingProps} />
      break
    case "/download":
      page = <DownloadPage {...marketingProps} />
      break
    case "/":
    default:
      page = <Home {...marketingProps} />
      break
  }

  return (
    <div className="app app--palette-elephant" style={MARKETING_FONT_VARS}>
      <AlphaBanner />
      {page}
    </div>
  )
}
