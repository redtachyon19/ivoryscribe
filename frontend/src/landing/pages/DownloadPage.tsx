import { Mail, Rocket } from "lucide-react"
import GithubMark from "../../webapp/components/ui/GithubMark"
import { useEffect, useState } from "react"
import "../landing.css"
import "./DownloadPage.css"
import ScrollProgressBar from "../../core/components/ScrollProgressBar"
import type { HomeProps } from "./Home"

function AppleLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 384 512" role="img" aria-label="Apple macOS" focusable="false">
      <path
        fill="currentColor"
        d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zM262.1 104.5c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"
      />
    </svg>
  )
}

function WindowsLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 448 512" role="img" aria-label="Windows" focusable="false">
      <path
        fill="currentColor"
        d="M0 93.7l183.6-25.3v177.4H0V93.7zm0 324.6l183.6 25.3V268.4H0v149.9zm203.8 28.4L448 480V268.4H203.8v177.7zm0-380.6v180.1H448V32L203.8 65.7z"
      />
    </svg>
  )
}

const MAC_ARM64_DMG_URL = "https://github.com/redtachyon19/ivoryscribe/releases/latest/download/Ivoryscribe-arm64.dmg"
const WIN_X64_EXE_URL = "https://github.com/redtachyon19/ivoryscribe/releases/latest/download/Ivoryscribe-x64.exe"

export default function DownloadPage({
  isLoggedIn = false,
  onLaunchDashboard,
  onOpenAuth,
}: HomeProps) {
  const [isHeaderScrolled, setIsHeaderScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => {
      setIsHeaderScrolled(window.scrollY > 24)
    }

    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })

    return () => {
      window.removeEventListener("scroll", onScroll)
    }
  }, [])

  const handleLogin = () => {
    if (isLoggedIn) {
      onLaunchDashboard?.()
      return
    }

    onOpenAuth?.()
  }

  const loginLabel = isLoggedIn ? "Launch" : "Log in"

  return (
    <div className="auth-gateway-page auth-gateway-page--download">
      <header className={`auth-gateway__header ${isHeaderScrolled ? "auth-gateway__header--scrolled" : ""}`.trim()}>
        <a href="/" className="app-brand auth-gateway__brand" aria-label="Go to home page">
          <span className="app-brand__mark" aria-hidden={true} />
          <span className="app-brand__name">ivoryscribe</span>
        </a>

        <nav className="auth-gateway__nav" aria-label="Landing navigation">
          <div className="auth-gateway__nav-group">
            <button type="button" className="auth-gateway__nav-trigger" aria-haspopup={true}>Organization</button>
            <div className="auth-gateway__nav-menu" role="menu" aria-label="Organization links">
              <a href="/about" className="auth-gateway__nav-menu-link" role="menuitem">About</a>
              <a href="/transparency" className="auth-gateway__nav-menu-link" role="menuitem">Transparency</a>
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

      <main className="download-main" aria-label="Download IvoryScribe">
        <div className="download-intro">
          <h1>Write your epic on the platform of your choice.</h1>
          <p>Mobile and more platforms coming soon.</p>
        </div>

        <div className="download-sections">
          <section className="download-section download-section--mac" aria-label="macOS">
            <div className="download-section__inner">
              <div className="download-section__info">
                <h2 className="download-option__title">Download for macOS</h2>
                <p className="download-option__note">Apple Silicon &amp; Intel · Universal .dmg</p>
                <a
                  href={MAC_ARM64_DMG_URL}
                  download
                  aria-label="Download for macOS"
                  className="auth-gateway__cta-button auth-gateway__cta-button--primary download-option__cta"
                >
                  <AppleLogo className="download-option__cta-logo" />
                  <span>Download</span>
                </a>
              </div>
              <figure className="download-shot">
                <div className="download-shot__placeholder">macOS screenshot</div>
                <figcaption className="download-shot__caption">macOS</figcaption>
              </figure>
            </div>
          </section>

          <hr className="download-divider" />

          <section className="download-section download-section--windows" aria-label="Windows">
            <div className="download-section__inner">
              <div className="download-section__info">
                <h2 className="download-option__title">Download for Windows</h2>
                <p className="download-option__note">Windows 10 &amp; 11 · 64-bit installer (.exe)</p>
                <a
                  href={WIN_X64_EXE_URL}
                  download
                  aria-label="Download for Windows"
                  className="auth-gateway__cta-button auth-gateway__cta-button--primary download-option__cta"
                >
                  <WindowsLogo className="download-option__cta-logo" />
                  <span>Download</span>
                </a>
              </div>
              <figure className="download-shot">
                <div className="download-shot__placeholder">Windows screenshot</div>
                <figcaption className="download-shot__caption">Windows</figcaption>
              </figure>
            </div>
          </section>
        </div>

        <p className="download-browser-hint">
          Prefer not to install?{" "}
          <button type="button" className="download-browser-link" onClick={handleLogin}>
            <Rocket size={14} strokeWidth={2} aria-hidden={true} />
            <span>Launch in your browser</span>
          </button>
        </p>
      </main>

      <footer className="auth-gateway__footer" aria-label="Site footer">
        <div className="auth-gateway__footer-grid">
          <div className="auth-gateway__footer-left">
            <div className="auth-gateway__footer-brand" aria-label="Ivoryscribe">
              <p className="auth-gateway__footer-brand-name">ivoryscribe</p>
            </div>

            <div className="auth-gateway__footer-social" aria-label="Social links">
              <a href="https://github.com/redtachyon19/ivoryscribe" target="_blank" rel="noopener noreferrer" aria-label="GitHub" className="auth-gateway__footer-social-link"><GithubMark size={16} /></a>
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
