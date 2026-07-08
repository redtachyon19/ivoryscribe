import { ArrowLeft, ChevronDown, CornerDownRight, PanelLeft, PanelRight, Settings } from "lucide-react"
import { useEffect, useRef, useState } from "react"

type EditorPreviewProps = {
  onBackToProjects: () => void
}

export default function EditorPreview({ onBackToProjects }: EditorPreviewProps) {
  const [isCanvasRailCollapsed, setIsCanvasRailCollapsed] = useState(false)
  const [isCanvasRightRailCollapsed, setIsCanvasRightRailCollapsed] = useState(false)
  const [isCharacterSheetsExpanded, setIsCharacterSheetsExpanded] = useState(true)
  const [isRoughDraftExpanded, setIsRoughDraftExpanded] = useState(true)
  const [leftPanelWidth, setLeftPanelWidth] = useState(240)
  const [rightPanelWidth, setRightPanelWidth] = useState(250)
  const [draggingPanel, setDraggingPanel] = useState<"left" | "right" | null>(null)
  const canvasBodyRef = useRef<HTMLDivElement | null>(null)

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

  return (
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
          <button type="button" className="auth-gateway__canvas-rail-back" onClick={onBackToProjects}>
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
            <span>Tusk AI</span>
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
  )
}
