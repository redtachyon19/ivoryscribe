import { Download, Github, Instagram, Linkedin, Mail, Rocket, Youtube } from "lucide-react"
import "./Home.css"

type HomeProps = {
  isLoggedIn?: boolean
  onLaunchDashboard?: () => void
  onOpenAuth?: () => void
}

export default function Home({
  isLoggedIn = false,
  onLaunchDashboard,
  onOpenAuth,
}: HomeProps) {
  const handleHeaderAction = () => {
    if (isLoggedIn) {
      onLaunchDashboard?.()
      return
    }

    onOpenAuth?.()
  }

  const headerActionLabel = isLoggedIn ? "Launch" : "Log in"
  const header = (
    <header className="auth-gateway__header">
      <button type="button" className="app-brand auth-gateway__brand" aria-label="Go to home page">
        <span className="app-brand__name">ivoryscribe</span>
        <span className="app-brand__tagline">write an epic. save a species.</span>
      </button>

      <button
        type="button"
        className={`auth-gateway__button ${isLoggedIn ? "auth-gateway__button--primary" : ""} auth-gateway__header-action`.trim()}
        onClick={handleHeaderAction}
      >
        {isLoggedIn ? <Rocket size={16} aria-hidden={true} /> : null}
        <span>{headerActionLabel}</span>
      </button>
    </header>
  )

  return (
    <div className="auth-gateway-page">
      {header}

      <section className="auth-gateway auth-gateway--landing">
        <div className="auth-gateway__hero">
          <h1>
            A minimalist, distraction free, writing canvas.
            <br />
            100% of profits go to elephant conservation.
          </h1>
          <p>
            Perfect for book &amp; blog drafting
            <br />
            Built by an author, for authors.
          </p>

          <div className="auth-gateway__actions">
            <button type="button" className="auth-gateway__cta-button">
              <Download size={17} strokeWidth={2} aria-hidden={true} />
              <span>Download</span>
            </button>
            <button
              type="button"
              className="auth-gateway__cta-button"
              onClick={() => {
                if (isLoggedIn) {
                  onLaunchDashboard?.()
                  return
                }

                onOpenAuth?.()
              }}
            >
              <Rocket size={17} strokeWidth={2} aria-hidden={true} />
              <span>Launch in Browser</span>
            </button>
          </div>
        </div>
      </section>

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
              <p>about</p>
              <p>mission</p>
              <p>conservation</p>
              <p>transparency</p>
            </section>

            <section className="auth-gateway__footer-group" aria-label="Products">
              <h2>products</h2>
              <p>web</p>
              <p>mobile</p>
              <p>desktop</p>
            </section>
          </div>

          <div className="auth-gateway__footer-right">
            <p className="auth-gateway__footer-copy">&copy;2026 ivoryscribe. all rights reserved</p>

            <div className="auth-gateway__footer-legal" aria-label="Legal">
              <p>privacy policy</p>
              <p>terms &amp; conditions</p>
              <p>cookie settings</p>
              <p>site map</p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
