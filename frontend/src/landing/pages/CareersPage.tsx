import { Github, Instagram, Linkedin, Mail, Rocket, Youtube } from "lucide-react"
import "./Home.css"
import ScrollProgressBar from "../../core/components/ScrollProgressBar"
import type { HomeProps } from "./Home"

export default function CareersPage({
  isLoggedIn = false,
  onLaunchDashboard,
  onOpenAuth,
}: HomeProps) {
  const handleLogin = () => {
    if (isLoggedIn) {
      onLaunchDashboard?.()
      return
    }

    onOpenAuth?.()
  }

  const loginLabel = isLoggedIn ? "Launch" : "Log in"

  return (
    <div className="auth-gateway-page">
      <header className="auth-gateway__header auth-gateway__header--scrolled">
        <a href="/" className="app-brand auth-gateway__brand" aria-label="Go to home page">
          <span className="app-brand__name">ivoryscribe</span>
        </a>

        <nav className="auth-gateway__nav" aria-label="Landing navigation">
          <div className="auth-gateway__nav-group">
            <button type="button" className="auth-gateway__nav-trigger" aria-haspopup={true}>Organization</button>
            <div className="auth-gateway__nav-menu" role="menu" aria-label="Organization links">
              <a href="/mission" className="auth-gateway__nav-menu-link" role="menuitem">Our mission</a>
              <a href="/transparency" className="auth-gateway__nav-menu-link" role="menuitem">Transparency</a>
              <a href="/careers" className="auth-gateway__nav-menu-link" role="menuitem">Careers</a>
            </div>
          </div>

          <div className="auth-gateway__nav-group">
            <button type="button" className="auth-gateway__nav-trigger" aria-haspopup={true}>Products</button>
            <div className="auth-gateway__nav-menu" role="menu" aria-label="Products links">
              <a href="/download" className="auth-gateway__nav-menu-link" role="menuitem">Download</a>
              <a href="/auth" className="auth-gateway__nav-menu-link" role="menuitem">Launch in Browser</a>
            </div>
          </div>
        </nav>

        <button
          type="button"
          className={`auth-gateway__button ${isLoggedIn ? "auth-gateway__button--primary" : ""} auth-gateway__header-action`.trim()}
          onClick={handleLogin}
        >
          {isLoggedIn ? <Rocket size={16} aria-hidden={true} /> : null}
          <span>{loginLabel}</span>
        </button>

        <ScrollProgressBar source={{ kind: "window" }} />
      </header>

      <main className="auth-gateway auth-gateway--detail" aria-label="Careers page content">
        <section className="auth-gateway__detail-card">
          <h1>Careers</h1>
          <p>
            We are building a focused writing product that funds real-world conservation work. If you care about craft,
            product quality, and measurable impact, we would love to hear from you.
          </p>
          <p>
            Open roles are published quarterly across engineering, design, and storytelling operations.
          </p>
        </section>
      </main>

      <footer className="auth-gateway__footer" aria-label="Site footer">
        <div className="auth-gateway__footer-grid">
          <div className="auth-gateway__footer-left">
            <div className="auth-gateway__footer-brand" aria-label="Ivoryscribe">
              <p className="auth-gateway__footer-brand-name">ivoryscribe</p>
            </div>


            <div className="auth-gateway__footer-social" aria-label="Social links">
              <a href="https://github.com/redtachyon19/ivoryscribe" target="_blank" rel="noopener noreferrer" aria-label="GitHub" className="auth-gateway__footer-social-link"><Github size={16} aria-hidden={true} /></a>
              <a href="#" aria-label="LinkedIn" className="auth-gateway__footer-social-link"><Linkedin size={16} aria-hidden={true} /></a>
              <a href="#" aria-label="Instagram" className="auth-gateway__footer-social-link"><Instagram size={16} aria-hidden={true} /></a>
              <a href="#" aria-label="YouTube" className="auth-gateway__footer-social-link"><Youtube size={16} aria-hidden={true} /></a>
              <a href="mailto:contact@ivoryscribe.com" target="_blank" rel="noopener noreferrer" aria-label="Email" className="auth-gateway__footer-social-link"><Mail size={16} aria-hidden={true} /></a>
            </div>
          </div>


          <div className="auth-gateway__footer-right">
            <p className="auth-gateway__footer-copy">&copy;2026 ivoryscribe. all rights reserved</p>

            <div className="auth-gateway__footer-legal" aria-label="Legal">
              <a href="/transparency">privacy policy</a>
              <a href="/transparency">terms &amp; conditions</a>
              <a href="/transparency">cookie settings</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
