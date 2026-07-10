import { Code2, Github, Heart, Mail, MessageSquare, Rocket } from "lucide-react"
import { useEffect, useState } from "react"
import "./Home.css"
import ScrollProgressBar from "../../core/components/ScrollProgressBar"
import type { HomeProps } from "./Home"

const REPO_URL = "https://github.com/redtachyon19/ivoryscribe"
const CONTACT_EMAIL = "contact@ivoryscribe.com"
// TODO: swap these for your real donation links (GitHub Sponsors / Open
// Collective / Ko-fi / a Stripe payment link).
const SPONSOR_URL = "https://github.com/sponsors/redtachyon19"
const DONATE_URL = "https://github.com/sponsors/redtachyon19"
// Yearly running-cost goal + what the community has covered so far. Update
// these as costs and contributions change (or wire them to a funding API).
const FUNDING_GOAL_USD = 1200
const FUNDING_RAISED_USD = 0

export default function TransparencyPage({
  isLoggedIn = false,
  onLaunchDashboard,
  onOpenAuth,
}: HomeProps) {
  // Header is transparent at the top and gains the translucent blur once the
  // page scrolls — same behaviour as the Home page.
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
  const fundingPct = Math.min(100, Math.round((FUNDING_RAISED_USD / FUNDING_GOAL_USD) * 100))

  return (
    <div className="auth-gateway-page">
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

      <main className="opensource-main" aria-label="Open source and support">
        <div className="opensource-content">
          <section className="opensource-section">
            <h1>Transparency</h1>
            <p>
              Ivoryscribe is open source under the MIT license, and it always will be. Every line that makes the app
              work is public — you can read it, learn from it, fork it, run your own copy, or send a change back. Nothing
              about how it works is hidden behind a company's closed doors.
            </p>
            <p>
              That openness isn't a marketing checkbox; it's the whole point. A writing tool holds your words, and you
              deserve to trust the thing you trust your manuscript to. When the code is open, that trust is earned in the
              daylight: no surprise lock-in, no black box, no way for the app to quietly turn against the people who use
              it. If Ivoryscribe ever stopped being something you'd want to use, you could take the code and keep going
              without me.
            </p>
            <p>
              It also means Ivoryscribe belongs, in a real way, to the people who write in it — not just to whoever
              happens to be editing the code today.
            </p>
            <div className="auth-gateway__actions">
              <a
                href={REPO_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="auth-gateway__cta-button auth-gateway__cta-button--primary"
              >
                <Github size={17} strokeWidth={2} aria-hidden={true} />
                <span>View on GitHub</span>
              </a>
            </div>
          </section>

          <section className="opensource-section">
            <h2>Bring the features you want</h2>
            <p>
              This is your tool as much as mine. If there's something you wish Ivoryscribe did — a shortcut, an export, a
              whole workflow — you don't have to hope I get around to it. There are two ways to make it real:
            </p>
            <div className="opensource-ways">
              <div className="opensource-way">
                <span className="opensource-way-icon"><MessageSquare size={22} aria-hidden={true} /></span>
                <h3>Suggest it</h3>
                <p>
                  Not a coder? Just tell me. Email the feature you'd love and it goes straight onto the list — same
                  address as the one at the bottom of every page.
                </p>
                <a href={`mailto:${CONTACT_EMAIL}`}>Email a suggestion →</a>
              </div>
              <div className="opensource-way">
                <span className="opensource-way-icon"><Code2 size={22} aria-hidden={true} /></span>
                <h3>Build it</h3>
                <p>
                  Comfortable in code? The entire project is on GitHub. Fork it, build the thing, and open a pull request
                  — good ideas get merged, and your name lives in the app's history forever.
                </p>
                <a href={REPO_URL} target="_blank" rel="noopener noreferrer">Open a pull request →</a>
              </div>
            </div>
          </section>

          <section className="opensource-section">
            <h2>Thank you</h2>
            <p>
              Ivoryscribe only exists because of the people around it. Everyone who's downloaded it, filed a bug, floated
              an idea, starred the repo, self-hosted a copy, or just told another writer "you should try this" — you're
              the reason this project is alive and getting better.
            </p>
            <p>
              An open-source tool is really a small community wearing the costume of an app, and I'm grateful for every
              person in it. Thank you for letting this thing exist.
            </p>
          </section>

          <section className="opensource-section" id="support">
            <h2>Support the project</h2>
            <p>
              Keeping Ivoryscribe running isn't free. There are servers and a database hosting your cloud projects, a
              domain, storage, email, and the AI models behind Tusk — all of which cost real money every month, whether
              ten people use the app or ten thousand. Ivoryscribe is free to write in, and I'd like to keep it that way.
              If it's earned a place in your writing, chipping in keeps the lights on.
            </p>
            <p>
              Here's the honest math: it costs roughly <strong>${FUNDING_GOAL_USD.toLocaleString()}</strong> a year to
              keep Ivoryscribe alive and open. So far, this community has covered
              {" "}<strong>${FUNDING_RAISED_USD.toLocaleString()}</strong> of it.
            </p>

            <div className="opensource-fund" role="group" aria-label="Funding progress">
              <div className="opensource-fund-head">
                <span className="opensource-fund-raised">${FUNDING_RAISED_USD.toLocaleString()}</span>
                <span className="opensource-fund-goal">raised of ${FUNDING_GOAL_USD.toLocaleString()} / year</span>
              </div>
              <div
                className="opensource-fund-bar"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={fundingPct}
              >
                <div className="opensource-fund-fill" style={{ width: `${fundingPct}%` }} />
              </div>
              <p className="opensource-fund-note">
                {fundingPct}% of what it costs to keep Ivoryscribe running this year.
              </p>
            </div>

            <p>
              And here's the part I care most about. The tusk in our name comes from a story about an elephant-headed god
              who broke off his own ivory to finish an epic — so we owe elephants a debt, and we mean to pay it. Once
              donations pass what it actually costs to run Ivoryscribe, every dollar beyond that goal goes to elephant
              conservation. Not "a portion." All of it.
            </p>

            <div className="opensource-pledge">
              <span className="opensource-pledge-icon"><Heart size={20} aria-hidden={true} /></span>
              <p>
                We stand for elephant conservation. Below the goal, your donation keeps a free, open-source writing tool
                alive; above it, it protects the animal we named ourselves after. Either way, it does something good.
              </p>
            </div>

            <div className="auth-gateway__actions">
              <a
                href={SPONSOR_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="auth-gateway__cta-button auth-gateway__cta-button--primary"
              >
                <Heart size={17} strokeWidth={2} aria-hidden={true} />
                <span>Sponsor the project</span>
              </a>
              <a
                href={DONATE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="auth-gateway__cta-button auth-gateway__cta-button--outline"
              >
                <span>Make a one-time donation</span>
              </a>
            </div>
          </section>
        </div>
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
