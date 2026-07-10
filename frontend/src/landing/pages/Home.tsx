import { Download, Github, Mail, Rocket } from "lucide-react"
import { useEffect, useState, type CSSProperties } from "react"
import "./Home.css"
import ScrollProgressBar from "../../core/components/ScrollProgressBar"
import EditorPreview from "./EditorPreview"
import type { Palette } from "../../core/utils/appearance"

export type HomeProps = {
  isLoggedIn?: boolean
  onLaunchDashboard?: () => void
  onOpenAuth?: () => void
}

// The six built-in colour themes, shown as clickable swatches under the editor
// preview so visitors can preview each theme regardless of sign-in state. Each
// swatch shows the theme's background + accent; clicking re-themes the preview.
const THEME_SWATCHES: { value: Palette; label: string; bg: string; accent: string }[] = [
  { value: "ivory", label: "Ivory Tusk", bg: "#f8f3e3", accent: "#ff306a" },
  { value: "elephant", label: "Elephant", bg: "#121212", accent: "#d9c2a1" },
  { value: "midnight", label: "Moon & Midnight", bg: "#000000", accent: "#ff306a" },
  { value: "sunset", label: "Sunset Savannah", bg: "#231715", accent: "#ffb38a" },
  { value: "woodland", label: "Woodland Forest", bg: "#122017", accent: "#b58b63" },
  { value: "glacier", label: "Glaciers & Waterfalls", bg: "#0d1a24", accent: "#ffffff" },
]

export default function Home({
  isLoggedIn = false,
  onLaunchDashboard,
  onOpenAuth,
}: HomeProps) {
  const [isHeaderScrolled, setIsHeaderScrolled] = useState(false)
  // Theme previewed in the editor mockup — independent of sign-in state.
  const [previewPalette, setPreviewPalette] = useState<Palette>("elephant")

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
          {/* `display: contents` wrapper — injects the selected palette's CSS
              variables into the preview without adding a layout box. */}
          <div className={`auth-gateway__preview-theme app--palette-${previewPalette}`}>
            <EditorPreview onBackToProjects={handleBackToProjects} />
          </div>

          <div className="auth-gateway__theme-swatches" role="group" aria-label="Preview a colour theme">
            {THEME_SWATCHES.map((swatch) => (
              <button
                key={swatch.value}
                type="button"
                className={`auth-gateway__theme-swatch ${previewPalette === swatch.value ? "auth-gateway__theme-swatch--active" : ""}`.trim()}
                style={{ "--sw-bg": swatch.bg, "--sw-accent": swatch.accent } as CSSProperties}
                onClick={() => setPreviewPalette(swatch.value)}
                aria-pressed={previewPalette === swatch.value}
                aria-label={`${swatch.label} theme`}
                title={swatch.label}
              />
            ))}
          </div>
        </section>

        <section className="auth-gateway__content-section auth-gateway__content-section--features" aria-label="Features">
          {/* Alternating feature rows (image side flips each row). Swap each
              placeholder <div> for:
              <img src="…" alt="…" className="auth-gateway__feature-shot-img" /> */}
          <div className="auth-gateway__feature-rows">
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
                <div className="auth-gateway__feature-shot-placeholder">Storage</div>
              </figure>
              <div className="auth-gateway__feature-copy">
                <h3>Cloud or local — your choice</h3>
                <p>Keep your projects synced in the cloud so they're on every device, or store them entirely on your own machine. Your writing stays wherever you want it.</p>
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
              <a href="mailto:contact@ivoryscribe.com" target="_blank" rel="noopener noreferrer" aria-label="Email" className="auth-gateway__footer-social-link">
                <Mail size={16} aria-hidden={true} />
              </a>
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
