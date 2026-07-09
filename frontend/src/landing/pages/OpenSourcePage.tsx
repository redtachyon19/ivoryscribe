import { Download, Github, Mail, Rocket } from "lucide-react"
import "./Home.css"
import ScrollProgressBar from "../../core/components/ScrollProgressBar"
import type { HomeProps } from "./Home"

const REPO_URL = "https://github.com/redtachyon19/ivoryscribe"

export default function OpenSourcePage({
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
      <header className="auth-gateway__header">
        <a href="/" className="app-brand auth-gateway__brand" aria-label="Go to home page">
          <span className="app-brand__name">ivoryscribe</span>
        </a>

        <nav className="auth-gateway__nav" aria-label="Landing navigation">
          <div className="auth-gateway__nav-group">
            <button type="button" className="auth-gateway__nav-trigger" aria-haspopup={true}>Organization</button>
            <div className="auth-gateway__nav-menu" role="menu" aria-label="Organization links">
              <a href="/about" className="auth-gateway__nav-menu-link" role="menuitem">About</a>
              <a href="/open-source" className="auth-gateway__nav-menu-link" role="menuitem">Open source</a>
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

      <main className="auth-gateway auth-gateway--detail" aria-label="Open source page content">
        <section className="auth-gateway__detail-card">
          <h1>Open source</h1>
          <p>
            IvoryScribe is open source under the MIT license — the code is public. Read it, fork it, run your own copy,
            or help shape where it goes.
          </p>
          <ul className="auth-gateway__feature-list">
            <li>Browse the source and releases on GitHub</li>
            <li>Report bugs and request features through issues</li>
            <li>Open a pull request to contribute</li>
            <li>Self-host your own instance</li>
          </ul>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="auth-gateway__cta-button auth-gateway__cta-button--primary"
          >
            <Github size={17} strokeWidth={2} aria-hidden={true} />
            <span>View on GitHub</span>
          </a>

          <h2 id="support" className="auth-gateway__detail-subheading">Support the project</h2>
          <p>
            IvoryScribe is free and open source. If it's useful to you, here are a few ways to keep it growing:
          </p>
          <ul className="auth-gateway__feature-list">
            <li>Star and share the repo on GitHub</li>
            <li>Contribute code, docs, or bug reports</li>
            <li>Upgrade to a paid plan for cloud sync and Tusk AI</li>
            <li>Tell other writers about it</li>
          </ul>
          <div className="auth-gateway__actions">
            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="auth-gateway__cta-button auth-gateway__cta-button--primary"
            >
              <Github size={17} strokeWidth={2} aria-hidden={true} />
              <span>Star on GitHub</span>
            </a>
            <a href="/download" className="auth-gateway__cta-button auth-gateway__cta-button--outline">
              <Download size={17} strokeWidth={2} aria-hidden={true} />
              <span>Download</span>
            </a>
          </div>
        </section>
      </main>

      <footer className="auth-gateway__footer" aria-label="Site footer">
        <div className="auth-gateway__footer-grid">
          <div className="auth-gateway__footer-left">
            <div className="auth-gateway__footer-brand" aria-label="Ivoryscribe">
              <p className="auth-gateway__footer-brand-name">ivoryscribe</p>
            </div>

            <div className="auth-gateway__footer-social" aria-label="Social links">
              <a href={REPO_URL} target="_blank" rel="noopener noreferrer" aria-label="GitHub" className="auth-gateway__footer-social-link"><Github size={16} aria-hidden={true} /></a>
              <a href="mailto:contact@ivoryscribe.com" target="_blank" rel="noopener noreferrer" aria-label="Email" className="auth-gateway__footer-social-link"><Mail size={16} aria-hidden={true} /></a>
            </div>
          </div>

          <div className="auth-gateway__footer-right">
            <p className="auth-gateway__footer-copy">&copy;2026 ivoryscribe. all rights reserved</p>

            <div className="auth-gateway__footer-legal" aria-label="Legal">
              <a href="#">privacy policy</a>
              <a href="#">terms &amp; conditions</a>
              <a href="#">cookie settings</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
