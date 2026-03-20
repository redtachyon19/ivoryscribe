import { ArrowLeft, ChevronDown, CornerDownRight, Download, Github, Instagram, Linkedin, Mail, PanelLeft, PanelRight, Rocket, Settings, Youtube } from "lucide-react"
import { useEffect, useRef, useState } from "react"
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
  const [isCharacterSheetsExpanded, setIsCharacterSheetsExpanded] = useState(true)
  const [isRoughDraftExpanded, setIsRoughDraftExpanded] = useState(true)
  const [leftPanelWidth, setLeftPanelWidth] = useState(240)
  const [rightPanelWidth, setRightPanelWidth] = useState(250)
  const [draggingPanel, setDraggingPanel] = useState<"left" | "right" | null>(null)
  const canvasBodyRef = useRef<HTMLDivElement | null>(null)

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

  useEffect(() => {
    if (!draggingPanel) return

    const onMouseMove = (event: MouseEvent) => {
      const bounds = canvasBodyRef.current?.getBoundingClientRect()
      if (!bounds) return

      if (draggingPanel === "left") {
        const nextWidth = Math.max(180, Math.min(360, event.clientX - bounds.left))
        setLeftPanelWidth(nextWidth)
        return
      }

      const nextWidth = Math.max(190, Math.min(420, bounds.right - event.clientX))
      setRightPanelWidth(nextWidth)
    }

    const onMouseUp = () => {
      setDraggingPanel(null)
    }

    window.addEventListener("mousemove", onMouseMove)
    window.addEventListener("mouseup", onMouseUp)

    return () => {
      window.removeEventListener("mousemove", onMouseMove)
      window.removeEventListener("mouseup", onMouseUp)
    }
  }, [draggingPanel])

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
    <div className="auth-gateway-page auth-gateway-page--home">
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
            <div
              ref={canvasBodyRef}
              className={`auth-gateway__canvas-body ${isCanvasRailCollapsed ? "auth-gateway__canvas-body--collapsed-left" : ""} ${isCanvasRightRailCollapsed ? "auth-gateway__canvas-body--collapsed-right" : ""}`.trim()}
              style={{
                gridTemplateColumns: `${isCanvasRailCollapsed ? 0 : leftPanelWidth}px ${isCanvasRailCollapsed ? 0 : 8}px 1fr ${isCanvasRightRailCollapsed ? 0 : 8}px ${isCanvasRightRailCollapsed ? 0 : rightPanelWidth}px`,
              }}
            >
              <aside className="auth-gateway__canvas-rail">
                <button type="button" className="auth-gateway__canvas-rail-back" onClick={handleBackToProjects}>
                  <ArrowLeft size={13} aria-hidden={true} />
                  <span>Back to Projects</span>
                </button>
                <p className="auth-gateway__canvas-rail-project">Fish out of Water</p>
                <span className="auth-gateway__canvas-rail-item">Brainstorming</span>
                <span className="auth-gateway__canvas-rail-item">Worldbuilding</span>
                <span className="auth-gateway__canvas-rail-item">Whiteboard</span>
                <button
                  type="button"
                  className="auth-gateway__canvas-rail-parent"
                  onClick={() => setIsCharacterSheetsExpanded((prev) => !prev)}
                  aria-expanded={isCharacterSheetsExpanded}
                >
                  <span>Character Sheets</span>
                  <ChevronDown className={`auth-gateway__canvas-rail-chevron ${isCharacterSheetsExpanded ? "auth-gateway__canvas-rail-chevron--open" : ""}`.trim()} size={14} aria-hidden={true} />
                </button>
                {isCharacterSheetsExpanded ? (
                  <>
                    <span className="auth-gateway__canvas-rail-subitem">
                      <CornerDownRight size={12} aria-hidden={true} />
                      <span>Karthik</span>
                    </span>
                    <span className="auth-gateway__canvas-rail-subitem">
                      <CornerDownRight size={12} aria-hidden={true} />
                      <span>Srivalli</span>
                    </span>
                    <span className="auth-gateway__canvas-rail-subitem">
                      <CornerDownRight size={12} aria-hidden={true} />
                      <span>Krithika</span>
                    </span>
                  </>
                ) : null}
                <button
                  type="button"
                  className="auth-gateway__canvas-rail-parent"
                  onClick={() => setIsRoughDraftExpanded((prev) => !prev)}
                  aria-expanded={isRoughDraftExpanded}
                >
                  <span>Rough Draft</span>
                  <ChevronDown className={`auth-gateway__canvas-rail-chevron ${isRoughDraftExpanded ? "auth-gateway__canvas-rail-chevron--open" : ""}`.trim()} size={14} aria-hidden={true} />
                </button>
                {isRoughDraftExpanded ? (
                  <>
                    <span className="auth-gateway__canvas-rail-subitem">
                      <CornerDownRight size={12} aria-hidden={true} />
                      <span>Chapter 1</span>
                    </span>
                    <span className="auth-gateway__canvas-rail-subitem">
                      <CornerDownRight size={12} aria-hidden={true} />
                      <span>Chapter 2</span>
                    </span>
                    <span className="auth-gateway__canvas-rail-subitem">
                      <CornerDownRight size={12} aria-hidden={true} />
                      <span>Chapter 3</span>
                    </span>
                  </>
                ) : null}
              </aside>
              <div
                className={`auth-gateway__canvas-resizer auth-gateway__canvas-resizer--left ${isCanvasRailCollapsed ? "auth-gateway__canvas-resizer--hidden" : ""}`.trim()}
                role="separator"
                aria-label="Resize left panel"
                onMouseDown={() => setDraggingPanel("left")}
              />
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
              <div
                className={`auth-gateway__canvas-resizer auth-gateway__canvas-resizer--right ${isCanvasRightRailCollapsed ? "auth-gateway__canvas-resizer--hidden" : ""}`.trim()}
                role="separator"
                aria-label="Resize right panel"
                onMouseDown={() => setDraggingPanel("right")}
              />
              <aside className="auth-gateway__canvas-right-rail">
                <div className="auth-gateway__chat-header">
                  <span>Tusk AI Chat</span>
                  <button type="button" className="auth-gateway__chat-model-trigger">
                    <span>Claude 3.7</span>
                    <ChevronDown size={12} aria-hidden={true} />
                  </button>
                </div>

                <div className="auth-gateway__chat-thread" aria-label="Chat thread preview">
                  <div className="auth-gateway__chat-bubble auth-gateway__chat-bubble--assistant">
                    Draft looks strong. Want me to tighten Chapter 2 pacing?
                  </div>
                  <div className="auth-gateway__chat-bubble auth-gateway__chat-bubble--user">
                    Yes. Keep the emotional beat with Srivalli.
                  </div>
                  <div className="auth-gateway__chat-bubble auth-gateway__chat-bubble--assistant">
                    Great. I can suggest a rewrite in 3 tones: epic, intimate, or cinematic.
                  </div>
                </div>

                <div className="auth-gateway__chat-composer">
                  <div className="auth-gateway__chat-input" aria-label="Message input preview">
                    Ask Tusk AI to rewrite this paragraph...
                  </div>
                  <div className="auth-gateway__chat-controls">
                    <button type="button" className="auth-gateway__chat-control-button">
                      <span>GPT-4.1</span>
                      <ChevronDown size={12} aria-hidden={true} />
                    </button>
                    <button type="button" className="auth-gateway__chat-control-button auth-gateway__chat-control-button--send">
                      Send
                    </button>
                  </div>
                </div>
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
