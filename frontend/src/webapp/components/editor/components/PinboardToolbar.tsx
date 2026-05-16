// Floating toolbar for PinboardEditor — tool selection (select / text / line
// / draw / marquee), quick-add buttons (image / link), and zoom controls.

import type { RefObject } from "react"
import { Brush, ImageUp, Link as LinkIcon, SquareDashed, TextInitial } from "lucide-react"
import type { PinboardTool } from "../utils/pinboardData"

type PinboardToolbarProps = {
  toolbarRef: RefObject<HTMLDivElement | null>
  toolbarPos: { x: number; y: number } | null
  isDragging: boolean
  onGripMouseDown: (event: React.MouseEvent) => void

  activeTool: PinboardTool
  onSelectTool: (tool: PinboardTool) => void

  onAddImage: () => void
  onAddLink: () => void

  zoomPercent: number
  onZoomIn: () => void
  onZoomOut: () => void
  onResetZoom: () => void
}

export function PinboardToolbar({
  toolbarRef,
  toolbarPos,
  isDragging,
  onGripMouseDown,
  activeTool,
  onSelectTool,
  onAddImage,
  onAddLink,
  zoomPercent,
  onZoomIn,
  onZoomOut,
  onResetZoom,
}: PinboardToolbarProps) {
  return (
    <div
      ref={toolbarRef}
      className={`pinboard-toolbar ${isDragging ? "pinboard-toolbar--dragging" : ""}`}
      style={toolbarPos ? { left: toolbarPos.x, top: toolbarPos.y, bottom: "auto", transform: "none" } : undefined}
    >
      <div className="pinboard-toolbar__grip" onMouseDown={onGripMouseDown} title="Drag to reposition">
        ⠿
      </div>
      <button
        type="button"
        className={`pinboard-toolbar__btn ${activeTool === "select" ? "pinboard-toolbar__btn--active" : ""}`}
        onClick={() => onSelectTool("select")}
        aria-label="Select tool"
        title="Select"
      >
        ↖
      </button>
      <button
        type="button"
        className={`pinboard-toolbar__btn ${activeTool === "text" ? "pinboard-toolbar__btn--active" : ""}`}
        onClick={() => onSelectTool("text")}
        aria-label="Text tool"
        title="Text box"
      >
        <TextInitial size={16} />
      </button>
      <button
        type="button"
        className={`pinboard-toolbar__btn ${activeTool === "line" ? "pinboard-toolbar__btn--active" : ""}`}
        onClick={() => onSelectTool("line")}
        aria-label="Line tool"
        title="Connect nodes"
      >
        ╱
      </button>
      <button
        type="button"
        className={`pinboard-toolbar__btn ${activeTool === "draw" ? "pinboard-toolbar__btn--active" : ""}`}
        onClick={() => onSelectTool("draw")}
        aria-label="Draw tool"
        title="Freehand draw"
      >
        <Brush size={16} />
      </button>
      <button
        type="button"
        className={`pinboard-toolbar__btn ${activeTool === "marquee" ? "pinboard-toolbar__btn--active" : ""}`}
        onClick={() => onSelectTool("marquee")}
        aria-label="Marquee select"
        title="Marquee select"
      >
        <SquareDashed size={16} />
      </button>
      <span className="pinboard-toolbar__separator" />
      <button type="button" className="pinboard-toolbar__btn" onClick={onAddImage} aria-label="Add image" title="Add image">
        <ImageUp size={16} />
      </button>
      <button type="button" className="pinboard-toolbar__btn" onClick={onAddLink} aria-label="Add link" title="Add link">
        <LinkIcon size={16} />
      </button>
      <span className="pinboard-toolbar__separator" />
      <span className="pinboard-toolbar__zoom">{zoomPercent}%</span>
      <button type="button" className="pinboard-toolbar__btn" aria-label="Zoom in" title="Zoom in" onClick={onZoomIn}>
        +
      </button>
      <button type="button" className="pinboard-toolbar__btn" aria-label="Zoom out" title="Zoom out" onClick={onZoomOut}>
        −
      </button>
      <button type="button" className="pinboard-toolbar__btn" aria-label="Reset zoom" title="Reset view" onClick={onResetZoom}>
        ⊙
      </button>
    </div>
  )
}
