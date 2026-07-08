import { Download, Github, Instagram, Linkedin, Mail, Rocket, Youtube } from "lucide-react"
import { useEffect, useState } from "react"
import "./Home.css"
import ScrollProgressBar from "../../core/components/ScrollProgressBar"
import EditorPreview from "./EditorPreview"

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

  const handleBackToProjects = () => {
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
  )

  return (
    <div className="auth-gateway-page auth-gateway-page--home">
      {header}

      <section className="auth-gateway auth-gateway--landing" id="home" aria-label="Home">
        <div className="auth-gateway__hero">
          <div className="auth-gateway__hero-icon" aria-hidden={true}>IS</div>
          <h1>
            A minimalist, distraction free, writing canvas.
            <br />
            Open source, and free to write.
          </h1>
          <p>Perfect for book drafting. Built by an author, for authors.</p>

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
          <EditorPreview onBackToProjects={handleBackToProjects} />
        </section>

        <section className="auth-gateway__content-section auth-gateway__content-section--features" aria-label="Features">
          {/* Alternating feature rows (image side flips each row). Swap each
              placeholder <div> for:
              <img src="…" alt="…" className="auth-gateway__feature-shot-img" /> */}
          <div className="auth-gateway__feature-rows">
            <article className="auth-gateway__feature-row">
              <figure className="auth-gateway__feature-shot">
                <div className="auth-gateway__feature-shot-placeholder">Storage</div>
              </figure>
              <div className="auth-gateway__feature-copy">
                <h3>Cloud or local — your choice</h3>
                <p>Keep your projects synced in the cloud so they're on every device, or store them entirely on your own machine. Your writing stays wherever you want it.</p>
              </div>
            </article>

            <article className="auth-gateway__feature-row">
              <figure className="auth-gateway__feature-shot">
                <div className="auth-gateway__feature-shot-placeholder">Real-time collaboration</div>
              </figure>
              <div className="auth-gateway__feature-copy">
                <h3>Share &amp; collaborate in real time</h3>
                <p>Invite co-writers and editors to a project and work on the same draft together — everyone's changes appear live as they type.</p>
              </div>
            </article>

            <article className="auth-gateway__feature-row">
              <figure className="auth-gateway__feature-shot">
                <div className="auth-gateway__feature-shot-placeholder">Projects &amp; chapters</div>
              </figure>
              <div className="auth-gateway__feature-copy">
                <h3>Projects, chapters &amp; tabs</h3>
                <p>Organize an entire book — nest chapters, group drafts into folders, and move between open tabs without losing your place.</p>
              </div>
            </article>

            <article className="auth-gateway__feature-row">
              <figure className="auth-gateway__feature-shot">
                <div className="auth-gateway__feature-shot-placeholder">Version history</div>
              </figure>
              <div className="auth-gateway__feature-copy">
                <h3>Autosave &amp; version history</h3>
                <p>Your writing saves automatically as you go, with manual checkpoints whenever you want them. Every version is kept inside the one project — roll back to any moment without a folder full of "draft_final_v3" copies.</p>
              </div>
            </article>

            <article className="auth-gateway__feature-row">
              <figure className="auth-gateway__feature-shot">
                <div className="auth-gateway__feature-shot-placeholder">Customization</div>
              </figure>
              <div className="auth-gateway__feature-copy">
                <h3>Customization</h3>
                <p>Make the writing space your own — choose from a range of color palettes, pick your fonts, and fine-tune the interface until it feels just right.</p>
              </div>
            </article>

            <article className="auth-gateway__feature-row">
              <figure className="auth-gateway__feature-shot">
                <div className="auth-gateway__feature-shot-placeholder">Tusk AI</div>
              </figure>
              <div className="auth-gateway__feature-copy">
                <h3>Tusk AI <span className="auth-gateway__feature-tag">In testing</span></h3>
                <p>Brainstorm, tighten pacing, or rewrite a paragraph in a new tone — all without leaving the page. Currently available to select users during our testing phase.</p>
              </div>
            </article>
          </div>
        </section>

        <section className="auth-gateway__content-section auth-gateway__content-section--testimonials" aria-labelledby="testimonials-title">
          <h2 id="testimonials-title">What storytellers have said</h2>
          <div className="auth-gateway__testimonials">
            <article className="auth-gateway__testimonial-card">
              <p className="auth-gateway__testimonial-copy">"Ivoryscribe keeps me in flow. I draft faster and edit with more intention. The calm writing surface helps me stay with the story every single day."</p>
              <p className="auth-gateway__testimonial-author">- Ved Vyas, Author of the Mahabharatha</p>
            </article>
            <article className="auth-gateway__testimonial-card">
              <p className="auth-gateway__testimonial-copy">"Ivoryscribe keeps me in flow. I draft faster and edit with more intention. The calm writing surface helps me stay with the story every single day."</p>
              <p className="auth-gateway__testimonial-author">- Valmiki, Author of the Ramayana</p>
            </article>
            <article className="auth-gateway__testimonial-card">
              <p className="auth-gateway__testimonial-copy">"Ivoryscribe keeps me in flow. I draft faster and edit with more intention. The calm writing surface helps me stay with the story every single day."</p>
              <p className="auth-gateway__testimonial-author">- Ved Vyas, Author of the Mahabharatha</p>
            </article>
            <article className="auth-gateway__testimonial-card">
              <p className="auth-gateway__testimonial-copy">"Ivoryscribe keeps me in flow. I draft faster and edit with more intention. The calm writing surface helps me stay with the story every single day."</p>
              <p className="auth-gateway__testimonial-author">- Valmiki, Author of the Ramayana</p>
            </article>
            <article className="auth-gateway__testimonial-card">
              <p className="auth-gateway__testimonial-copy">"Ivoryscribe keeps me in flow. I draft faster and edit with more intention. The calm writing surface helps me stay with the story every single day."</p>
              <p className="auth-gateway__testimonial-author">- Ved Vyas, Author of the Mahabharatha</p>
            </article>
            <article className="auth-gateway__testimonial-card">
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
            </div>


            <div className="auth-gateway__footer-social" aria-label="Social links">
              <a href="https://github.com/redtachyon19/ivoryscribe" target="_blank" rel="noopener noreferrer" aria-label="GitHub" className="auth-gateway__footer-social-link">
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
              <a href="mailto:contact@ivoryscribe.com" target="_blank" rel="noopener noreferrer" aria-label="Email" className="auth-gateway__footer-social-link">
                <Mail size={16} aria-hidden={true} />
              </a>
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
