import { Download, Github, Instagram, Linkedin, Mail, Rocket, Youtube } from "lucide-react"
import "./Home.css"
import type { HomeProps } from "./Home"

export default function ProductsPricingPage({
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
          <span className="app-brand__tagline">write an epic. save a species.</span>
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
              <a href="/products-pricing" className="auth-gateway__nav-menu-link" role="menuitem">Products</a>
              <a href="/products-pricing" className="auth-gateway__nav-menu-link" role="menuitem">Pricing</a>
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
      </header>

      <main className="auth-gateway auth-gateway--detail" aria-label="Products and pricing page content">
        <section className="auth-gateway__detail-card">
          <h1>Products &amp; pricing</h1>
          <div className="auth-gateway__plans" role="list" aria-label="Products and pricing plans">
            <article className="auth-gateway__plan" role="listitem">
              <h3>Web</h3>
              <p>Free</p>
              <span>Write from any modern browser with project sync and markdown editing.</span>
            </article>
            <article className="auth-gateway__plan" role="listitem">
              <h3>Desktop</h3>
              <p>$12/mo</p>
              <span>Offline-ready writing, export workflows, and priority support.</span>
            </article>
            <article className="auth-gateway__plan" role="listitem">
              <h3>Conservation tier</h3>
              <p>$24/mo</p>
              <span>Everything in Desktop with an expanded direct conservation contribution.</span>
            </article>
          </div>
          <a href="/download" className="auth-gateway__cta-button auth-gateway__cta-button--primary">
            <Download size={17} strokeWidth={2} aria-hidden={true} />
            <span>Download</span>
          </a>
        </section>
      </main>

      <footer className="auth-gateway__footer" aria-label="Site footer">
        <div className="auth-gateway__footer-grid">
          <div className="auth-gateway__footer-left">
            <div className="auth-gateway__footer-brand" aria-label="Ivoryscribe">
              <p className="auth-gateway__footer-brand-name">ivoryscribe</p>
              <p className="auth-gateway__footer-brand-tagline">write an epic. save a species.</p>
            </div>

            <p className="auth-gateway__footer-address">1457 Cedar Quill Avenue, Portland, OR 97205</p>

            <div className="auth-gateway__footer-social" aria-label="Social links">
              <a href="#" aria-label="GitHub" className="auth-gateway__footer-social-link"><Github size={16} aria-hidden={true} /></a>
              <a href="#" aria-label="LinkedIn" className="auth-gateway__footer-social-link"><Linkedin size={16} aria-hidden={true} /></a>
              <a href="#" aria-label="Instagram" className="auth-gateway__footer-social-link"><Instagram size={16} aria-hidden={true} /></a>
              <a href="#" aria-label="YouTube" className="auth-gateway__footer-social-link"><Youtube size={16} aria-hidden={true} /></a>
              <a href="#" aria-label="Email" className="auth-gateway__footer-social-link"><Mail size={16} aria-hidden={true} /></a>
            </div>
          </div>

          <div className="auth-gateway__footer-columns">
            <section className="auth-gateway__footer-group" aria-label="Organization">
              <h2>organization</h2>
              <a href="/">about</a>
              <a href="/mission">mission</a>
              <a href="/mission">conservation</a>
              <a href="/transparency">transparency</a>
            </section>

            <section className="auth-gateway__footer-group" aria-label="Products">
              <h2>products</h2>
              <a href="/products-pricing">web</a>
              <a href="/products-pricing">mobile</a>
              <a href="/products-pricing">desktop</a>
            </section>
          </div>

          <div className="auth-gateway__footer-right">
            <p className="auth-gateway__footer-copy">&copy;2026 ivoryscribe. all rights reserved</p>

            <div className="auth-gateway__footer-legal" aria-label="Legal">
              <a href="/transparency">privacy policy</a>
              <a href="/transparency">terms &amp; conditions</a>
              <a href="/transparency">cookie settings</a>
              <a href="/">site map</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
