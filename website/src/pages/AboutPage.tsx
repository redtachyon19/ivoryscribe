import { Mail, Rocket } from "lucide-react"
import GithubMark from "../components/GithubMark"
import { useEffect, useState } from "react"
import "../landing.css"
import "./AboutPage.css"
import ScrollProgressBar from "../components/ScrollProgressBar"
import type { HomeProps } from "./Home"

export default function AboutPage({
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
    <div className="auth-gateway-page">
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

      <main className="auth-gateway auth-gateway--detail" aria-label="About page content">
        <section className="auth-gateway__detail-card auth-gateway__detail-card--plain">
          <h1>About</h1>
          <p>
            Ivoryscribe is inspired by my Indian cultural roots. The name itself comes from one of the oldest stories
            ever told about writing — the story of how the Mahabharata came to be written down.
          </p>
          <p>
            As it's told, the sage Ved Vyas held an epic in his mind so vast that he could not commit it to the page
            alone. He needed a scribe who could keep pace with him — someone who would not falter, would not pause,
            would not lose the thread. He found that scribe in Ganesha. Ganesha agreed to write the Mahabharata on a
            single condition: that the narration must never once break its flow. Word had to follow word, and verse
            follow verse, without interruption, until the whole of it was set down.
          </p>
          <p>
            And so they wrote. In some tellings of the story, when Ganesha's pen ran dry in the middle of a verse, he
            refused to stop. So moved by Ved Vyas, and so unwilling to break the flow he had promised to keep, he snapped
            off one of his own tusks and wrote on with the ivory. That is where this app takes both its name and its
            heart. Ganesha is the ivoryscribe — the one who gives up a part of himself so that the story is never
            interrupted.
          </p>
          <p>
            That image — of writing that simply does not stop — is the whole idea behind this canvas. I wanted a place
            where you could write the way Ved Vyas dictated: continuously, without ever having to break flow. Everything
            a long-form writer does should happen right here, on the page — drafting, editing, saving, renaming,
            organizing your chapters — so you never have to leave your words to manage the work around them. And I wanted
            it to be a place where you never once feel alone while you write.
          </p>
          <p>
            So the design is deliberately spare. Minimalism here isn't really an aesthetic choice so much as a functional
            one: strip away the menus, the third-party clutter, the endless panels and notifications, and surface only
            what a long-form writer actually needs, exactly when they need it. The aim is to reduce distraction to almost
            nothing, and to let the little you do need rise quietly to meet you — never to overwhelm.
          </p>
          <p>
            To be frank, I didn't build this for anyone else. I built it for myself — to edit my first manuscript, and
            to write my second (the one quietly teased by the Moon &amp; Midnight theme, which happens to be my personal
            favorite). I've been writing in it every day since. I hope you'll find a home in it too.
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
