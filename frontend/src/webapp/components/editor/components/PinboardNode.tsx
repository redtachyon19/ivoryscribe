// Renders a single PinboardNode (text / image / link / file / drawing) and
// owns the per-node interactions (mousedown to drag, double-click to edit
// text or open a link, resize-handle drag).
//
// Drawings live as text nodes with `[drawing:<json>]` content — the parent
// detects that and we render an SVG polyline instead of a textarea.

import type { PinboardNode } from "../utils/pinboardData"
import { tryParseDrawingPoints } from "../utils/pinboardData"

type PinboardNodeViewProps = {
  node: PinboardNode
  isSelected: boolean
  isEditing: boolean
  onMouseDown: (event: React.MouseEvent, nodeId: string) => void
  onResizeMouseDown: (event: React.MouseEvent, nodeId: string) => void
  onStartEditing: (nodeId: string) => void
  onStopEditing: () => void
  onTextChange: (nodeId: string, value: string) => void
  onOpenLink: (url: string) => void
}

export function PinboardNodeView({
  node,
  isSelected,
  isEditing,
  onMouseDown,
  onResizeMouseDown,
  onStartEditing,
  onStopEditing,
  onTextChange,
  onOpenLink,
}: PinboardNodeViewProps) {
  const drawPts = tryParseDrawingPoints(node)
  const isDrawingNode = drawPts !== null

  return (
    <div
      className={`pinboard-node pinboard-node--${node.type} ${isDrawingNode ? "pinboard-node--drawing" : ""} ${isSelected ? "pinboard-node--selected" : ""}`}
      style={{ left: node.x, top: node.y, width: node.width, height: node.height }}
      onMouseDown={(e) => onMouseDown(e, node.id)}
      onDoubleClick={(e) => {
        e.stopPropagation()
        if (node.type === "text" && !isDrawingNode) onStartEditing(node.id)
        if (node.type === "link") onOpenLink(node.url)
      }}
    >
      {isDrawingNode && drawPts ? (
        <svg className="pinboard-node__drawing-svg" viewBox={`0 0 ${node.width} ${node.height}`} preserveAspectRatio="none">
          <polyline
            className="pinboard-node__drawing-stroke"
            points={drawPts.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke={isSelected ? "var(--app-accent, #7ea8ff)" : "#fff"}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : node.type === "text" ? (
        isEditing ? (
          <textarea
            className="pinboard-node__textarea"
            autoFocus
            value={node.content}
            onChange={(e) => onTextChange(node.id, e.target.value)}
            onBlur={onStopEditing}
            onKeyDown={(e) => {
              if (e.key === "Escape") onStopEditing()
            }}
          />
        ) : (
          <div className="pinboard-node__text-display">{node.content || "Double-click to edit…"}</div>
        )
      ) : node.type === "image" ? (
        <img className="pinboard-node__image" src={node.src} alt="" draggable={false} />
      ) : node.type === "link" ? (
        <div className="pinboard-node__link">
          <span className="pinboard-node__link-icon">🔗</span>
          <span className="pinboard-node__link-label">{node.label}</span>
        </div>
      ) : node.type === "file" ? (
        <div className="pinboard-node__file">
          <span className="pinboard-node__file-icon">📄</span>
          <span className="pinboard-node__file-name">{node.fileName}</span>
        </div>
      ) : null}

      {isSelected && !isDrawingNode ? (
        <div className="pinboard-node__resize" onMouseDown={(e) => onResizeMouseDown(e, node.id)} />
      ) : null}
    </div>
  )
}
