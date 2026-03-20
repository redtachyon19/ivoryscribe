import { Download, Github, Instagram, Linkedin, Mail, PanelLeft, PanelRight, Rocket, Settings, Youtube } from "lucide-react"
import { useEffect, useState } from "react"
import "./Home.css"

export type HomeProps = {
  isLoggedIn?: boolean
  onLaunchDashboard?: () => void
  onOpenAuth?: () => void
}

export default function Home({
  isLoggedIn = false,
  onLaunchDashboard,
  onOpenAuth,
}: HomeProps) {
  const [isHeaderScrolled, setIsHeaderScrolled] = useState(false)
  const [isCanvasRailCollapsed, setIsCanvasRailCollapsed] = useState(false)
  const [isCanvasRightRailCollapsed, setIsCanvasRightRailCollapsed] = useState(false)

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

  const header = (
    <header className={`auth-gateway__header ${isHeaderScrolled ? "auth-gateway__header--scrolled" : ""}`.trim()}>
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
  )

  return (
    <div className="auth-gateway-page">
      {header}

      <section className="auth-gateway auth-gateway--landing" id="home" aria-label="Home">
        <div className="auth-gateway__hero">
          <div className="auth-gateway__hero-icon" aria-hidden={true}>IS</div>
          <h1>
            A minimalist, distraction free, writing canvas.
            <br />
            100% of profits go to elephant conservation.
          </h1>
          <p>Perfect for book &amp; blog drafting. Built by an author, for authors.</p>

          <div className="auth-gateway__actions">
            <a href="/download" className="auth-gateway__cta-button auth-gateway__cta-button--outline">
              <Download size={17} strokeWidth={2} aria-hidden={true} />
              <span>Download</span>
            </a>
            <button
              type="button"
              className="auth-gateway__cta-button auth-gateway__cta-button--primary"
              onClick={handleLogin}
            >
              <Rocket size={17} strokeWidth={2} aria-hidden={true} />
              <span>Launch in Browser</span>
            </button>
          </div>
        </div>
      </section>

      <main className="auth-gateway__sections" aria-label="Landing content sections">
        <section className="auth-gateway__content-section auth-gateway__content-section--preview" aria-label="Writing canvas preview">
          <div className="auth-gateway__canvas-preview">
            <div className="auth-gateway__canvas-topbar">
              <span className="auth-gateway__canvas-dot" />
              <span className="auth-gateway__canvas-dot" />
              <span className="auth-gateway__canvas-dot" />
              <button
                type="button"
                className="auth-gateway__canvas-toggle"
                aria-label={isCanvasRailCollapsed ? "Expand left panel" : "Collapse left panel"}
                onClick={() => setIsCanvasRailCollapsed((prev) => !prev)}
              >
                <PanelLeft size={14} aria-hidden={true} />
              </button>
              <div className="auth-gateway__canvas-tabs">
                <span>Draft 1</span>
                <span className="auth-gateway__canvas-tab-active">Chapter 2</span>
                <span>Notes</span>
              </div>
              <button
                type="button"
                className="auth-gateway__canvas-toggle"
                aria-label={isCanvasRightRailCollapsed ? "Expand right panel" : "Collapse right panel"}
                onClick={() => setIsCanvasRightRailCollapsed((prev) => !prev)}
              >
                <PanelRight size={14} aria-hidden={true} />
              </button>
            </div>
            <div className={`auth-gateway__canvas-body ${isCanvasRailCollapsed ? "auth-gateway__canvas-body--collapsed-left" : ""} ${isCanvasRightRailCollapsed ? "auth-gateway__canvas-body--collapsed-right" : ""}`.trim()}>
              <aside className="auth-gateway__canvas-rail">
                <span>Project A</span>
                <span>Character sheet</span>
                <span>Timeline</span>
              </aside>
              <div className="auth-gateway__canvas-editor">
                <button type="button" className="auth-gateway__canvas-editor-settings" aria-label="Canvas settings">
                  <Settings size={14} aria-hidden={true} />
                </button>
                <div className="auth-gateway__canvas-line auth-gateway__canvas-line--title" />
                <div className="auth-gateway__canvas-line" />
                <div className="auth-gateway__canvas-line" />
                <div className="auth-gateway__canvas-line auth-gateway__canvas-line--short" />
                <div className="auth-gateway__canvas-line" />
              </div>
              <aside className="auth-gateway__canvas-right-rail">
                <span>AI notes</span>
                <span>Word count</span>
                <span>Outline</span>
              </aside>
            </div>
          </div>
        </section>

        <section className="auth-gateway__content-section auth-gateway__content-section--orgs" aria-labelledby="orgs-title">
          <h2 id="orgs-title">Organizations we have donated to</h2>
          <div className="auth-gateway__ticker" aria-label="Partner organizations">
            <div className="auth-gateway__ticker-track">
              <span>Save the Elephants</span>
              <span>Wildlife Conservation Network</span>
              <span>Big Life Foundation</span>
              <span>Sheldrick Wildlife Trust</span>
              <span>African Wildlife Foundation</span>
              <span>Save the Elephants</span>
              <span>Wildlife Conservation Network</span>
              <span>Big Life Foundation</span>
              <span>Sheldrick Wildlife Trust</span>
              <span>African Wildlife Foundation</span>
            </div>
          </div>
        </section>

        <section className="auth-gateway__content-section" aria-labelledby="features-title">
          <h2 id="features-title">List of features</h2>
          <ul className="auth-gateway__feature-list">
            <li>Distraction-free writing canvas</li>
            <li>Project folders and tabbed drafting</li>
            <li>Markdown-first editing with fast export</li>
            <li>Seamless web launch and desktop workflow</li>
          </ul>
        </section>

        <section className="auth-gateway__content-section auth-gateway__content-section--testimonials" aria-labelledby="testimonials-title">
          <h2 id="testimonials-title">What storytellers have said</h2>
          <div className="auth-gateway__testimonials">
            <article className="auth-gateway__testimonial-card">
              <img src="/vite.svg" alt="Storyteller avatar" className="auth-gateway__testimonial-avatar" />
              <p className="auth-gateway__testimonial-copy">"Ivoryscribe keeps me in flow. I draft faster and edit with more intention. The calm writing surface helps me stay with the story every single day."</p>
              <p className="auth-gateway__testimonial-author">- Ved Vyas, Author of the Mahabharatha</p>
            </article>
            <article className="auth-gateway__testimonial-card">
              <img src="/vite.svg" alt="Storyteller avatar" className="auth-gateway__testimonial-avatar" />
              <p className="auth-gateway__testimonial-copy">"Ivoryscribe keeps me in flow. I draft faster and edit with more intention. The calm writing surface helps me stay with the story every single day."</p>
              <p className="auth-gateway__testimonial-author">- Valmiki, Author of the Ramayana</p>
            </article>
            <article className="auth-gateway__testimonial-card">
              <img src="/vite.svg" alt="Storyteller avatar" className="auth-gateway__testimonial-avatar" />
              <p className="auth-gateway__testimonial-copy">"Ivoryscribe keeps me in flow. I draft faster and edit with more intention. The calm writing surface helps me stay with the story every single day."</p>
              <p className="auth-gateway__testimonial-author">- Ved Vyas, Author of the Mahabharatha</p>
            </article>
            <article className="auth-gateway__testimonial-card">
              <img src="/vite.svg" alt="Storyteller avatar" className="auth-gateway__testimonial-avatar" />
              <p className="auth-gateway__testimonial-copy">"Ivoryscribe keeps me in flow. I draft faster and edit with more intention. The calm writing surface helps me stay with the story every single day."</p>
              <p className="auth-gateway__testimonial-author">- Valmiki, Author of the Ramayana</p>
            </article>
            <article className="auth-gateway__testimonial-card">
              <img src="/vite.svg" alt="Storyteller avatar" className="auth-gateway__testimonial-avatar" />
              <p className="auth-gateway__testimonial-copy">"Ivoryscribe keeps me in flow. I draft faster and edit with more intention. The calm writing surface helps me stay with the story every single day."</p>
              <p className="auth-gateway__testimonial-author">- Ved Vyas, Author of the Mahabharatha</p>
            </article>
            <article className="auth-gateway__testimonial-card">
              <img src="/vite.svg" alt="Storyteller avatar" className="auth-gateway__testimonial-avatar" />
              <p className="auth-gateway__testimonial-copy">"Ivoryscribe keeps me in flow. I draft faster and edit with more intention. The calm writing surface helps me stay with the story every single day."</p>
              <p className="auth-gateway__testimonial-author">- Valmiki, Author of the Ramayana</p>
            </article>
          </div>
        </section>

        <section className="auth-gateway__content-section auth-gateway__content-section--cta" aria-labelledby="final-cta-title">
          <h2 id="final-cta-title">Write your epic with IvoryScribe</h2>
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
              <a href="#" aria-label="GitHub" className="auth-gateway__footer-social-link">
                <Github size={16} aria-hidden={true} />
              </a>
              <a href="#" aria-label="LinkedIn" className="auth-gateway__footer-social-link">
                <Linkedin size={16} aria-hidden={true} />
              </a>
              <a href="#" aria-label="Instagram" className="auth-gateway__footer-social-link">
                <Instagram size={16} aria-hidden={true} />
              </a>
              <a href="#" aria-label="YouTube" className="auth-gateway__footer-social-link">
                <Youtube size={16} aria-hidden={true} />
              </a>
              <a href="#" aria-label="Email" className="auth-gateway__footer-social-link">
                <Mail size={16} aria-hidden={true} />
              </a>
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
