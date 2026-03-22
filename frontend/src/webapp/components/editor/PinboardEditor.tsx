import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Brush, ImageUp, Link as LinkIcon, TextInitial } from "lucide-react"
import "./PinboardEditor.css"

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type PinboardNodeBase = {
  id: string
  x: number
  y: number
  width: number
  height: number
}

type TextNode = PinboardNodeBase & { type: "text"; content: string }
type ImageNode = PinboardNodeBase & { type: "image"; src: string }
type LinkNode = PinboardNodeBase & { type: "link"; url: string; label: string }
type FileNode = PinboardNodeBase & { type: "file"; fileName: string }

type PinboardNode = TextNode | ImageNode | LinkNode | FileNode

type PinboardLine = {
  id: string
  fromId: string
  toId: string
  color: string
}

type PinboardData = {
  nodes: PinboardNode[]
  lines: PinboardLine[]
  viewport: { x: number; y: number; zoom: number }
}

type Tool = "select" | "text" | "line" | "draw"

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function createNodeId() {
  return crypto.randomUUID()
}

const EMPTY_BOARD: PinboardData = { nodes: [], lines: [], viewport: { x: 0, y: 0, zoom: 1 } }

function parseBoardData(raw: string): PinboardData {
  if (!raw || raw === "<p></p>") return { ...EMPTY_BOARD, nodes: [], lines: [], viewport: { x: 0, y: 0, zoom: 1 } }
  try {
    const parsed = JSON.parse(raw) as PinboardData
    return {
      nodes: Array.isArray(parsed.nodes) ? parsed.nodes : [],
      lines: Array.isArray(parsed.lines) ? parsed.lines : [],
      viewport: parsed.viewport ?? { x: 0, y: 0, zoom: 1 },
    }
  } catch {
    return { ...EMPTY_BOARD, nodes: [], lines: [], viewport: { x: 0, y: 0, zoom: 1 } }
  }
}

function serializeBoardData(data: PinboardData): string {
  return JSON.stringify(data)
}

function nodeCenter(node: PinboardNode) {
  return { cx: node.x + node.width / 2, cy: node.y + node.height / 2 }
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

type PinboardEditorProps = {
  documentId: string | null
  content: string
  onContentChange: (nextContent: string) => void
}

export default function PinboardEditor({ documentId, content, onContentChange }: PinboardEditorProps) {
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  /* ---- board state ---- */
  const board = useMemo(() => parseBoardData(content), [content])
  const { nodes, lines, viewport } = board
  const viewportRef = useRef(viewport)
  viewportRef.current = viewport
  const contentRef = useRef(content)
  contentRef.current = content

  const commitBoard = useCallback(
    (updater: (prev: PinboardData) => PinboardData) => {
      const next = updater(parseBoardData(contentRef.current))
      onContentChange(serializeBoardData(next))
    },
    [onContentChange],
  )

  /* ---- interaction state ---- */
  const [activeTool, setActiveTool] = useState<Tool>("select")
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null)
  const [dragOffset, setDragOffset] = useState({ dx: 0, dy: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [panStart, setPanStart] = useState({ px: 0, py: 0 })
  const [lineStart, setLineStart] = useState<string | null>(null)
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null)
  const [resizingNodeId, setResizingNodeId] = useState<string | null>(null)
  const [resizeStart, setResizeStart] = useState({ startW: 0, startH: 0, startX: 0, startY: 0 })

  // Drawing-mode state
  const [drawingPoints, setDrawingPoints] = useState<Array<{ x: number; y: number }>>([])
  const drawingPointsRef = useRef<Array<{ x: number; y: number }>>([])
  const [isDrawing, setIsDrawing] = useState(false)
  const isDrawingRef = useRef(false)

  // Toolbar drag state
  const [toolbarPos, setToolbarPos] = useState<{ x: number; y: number } | null>(null)
  const [isDraggingToolbar, setIsDraggingToolbar] = useState(false)
  const toolbarDragStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 })
  const toolbarRef = useRef<HTMLDivElement | null>(null)

  /* Reset selection when switching documents */
  useEffect(() => {
    setSelectedNodeId(null)
    setEditingNodeId(null)
    setActiveTool("select")
  }, [documentId])

  /* ---- toolbar dragging ---- */
  const handleToolbarDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const rect = toolbarRef.current?.getBoundingClientRect()
    const parentRect = toolbarRef.current?.parentElement?.getBoundingClientRect()
    if (!rect || !parentRect) return
    setIsDraggingToolbar(true)
    toolbarDragStart.current = {
      x: e.clientX,
      y: e.clientY,
      ox: rect.left - parentRect.left,
      oy: rect.top - parentRect.top,
    }
  }, [])

  useEffect(() => {
    if (!isDraggingToolbar) return
    const onMove = (e: MouseEvent) => {
      const s = toolbarDragStart.current
      setToolbarPos({
        x: s.ox + (e.clientX - s.x),
        y: s.oy + (e.clientY - s.y),
      })
    }
    const onUp = () => setIsDraggingToolbar(false)
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
    return () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }
  }, [isDraggingToolbar])

  /* ---- coordinate helpers ---- */
  const clientToCanvas = useCallback(
    (clientX: number, clientY: number) => {
      const rect = canvasRef.current?.getBoundingClientRect()
      if (!rect) return { x: 0, y: 0 }
      const vp = viewportRef.current
      return {
        x: (clientX - rect.left) / vp.zoom - vp.x,
        y: (clientY - rect.top) / vp.zoom - vp.y,
      }
    },
    [],
  )

  /* ---- zoom ---- */
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault()
      const scaleBy = e.deltaY > 0 ? 0.92 : 1.08
      const rect = canvasRef.current?.getBoundingClientRect()
      if (!rect) return
      const mx = (e.clientX - rect.left) / viewport.zoom - viewport.x
      const my = (e.clientY - rect.top) / viewport.zoom - viewport.y
      const nextZoom = Math.max(0.15, Math.min(5, viewport.zoom * scaleBy))
      const nextX = (e.clientX - rect.left) / nextZoom - mx
      const nextY = (e.clientY - rect.top) / nextZoom - my
      commitBoard((prev) => ({ ...prev, viewport: { x: nextX, y: nextY, zoom: nextZoom } }))
    },
    [viewport, commitBoard],
  )

  /* ---- background mouse-down: pan or add ---- */
  const handleCanvasMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest(".pinboard-node")) return

      const pos = clientToCanvas(e.clientX, e.clientY)

      if (activeTool === "text") {
        const newNode: TextNode = {
          id: createNodeId(),
          type: "text",
          x: pos.x,
          y: pos.y,
          width: 200,
          height: 80,
          content: "",
        }
        commitBoard((prev) => ({ ...prev, nodes: [...prev.nodes, newNode] }))
        setEditingNodeId(newNode.id)
        setSelectedNodeId(newNode.id)
        setActiveTool("select")
        return
      }

      if (activeTool === "draw") {
        setIsDrawing(true)
        isDrawingRef.current = true
        const pts = [pos]
        setDrawingPoints(pts)
        drawingPointsRef.current = pts
        return
      }

      setSelectedNodeId(null)
      setEditingNodeId(null)
      setIsPanning(true)
      setPanStart({ px: e.clientX, py: e.clientY })
    },
    [activeTool, clientToCanvas, commitBoard],
  )

  /* ---- global mouse-move / mouse-up ---- */
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (isPanning) {
        const dx = e.clientX - panStart.px
        const dy = e.clientY - panStart.py
        commitBoard((prev) => ({
          ...prev,
          viewport: { ...prev.viewport, x: prev.viewport.x + dx / prev.viewport.zoom, y: prev.viewport.y + dy / prev.viewport.zoom },
        }))
        setPanStart({ px: e.clientX, py: e.clientY })
        return
      }

      if (draggingNodeId) {
        const pos = clientToCanvas(e.clientX, e.clientY)
        commitBoard((prev) => ({
          ...prev,
          nodes: prev.nodes.map((n) => (n.id === draggingNodeId ? { ...n, x: pos.x - dragOffset.dx, y: pos.y - dragOffset.dy } : n)),
        }))
        return
      }

      if (resizingNodeId) {
        const dx = e.clientX - resizeStart.startX
        const dy = e.clientY - resizeStart.startY
        commitBoard((prev) => ({
          ...prev,
          nodes: prev.nodes.map((n) =>
            n.id === resizingNodeId
              ? { ...n, width: Math.max(80, resizeStart.startW + dx / prev.viewport.zoom), height: Math.max(40, resizeStart.startH + dy / prev.viewport.zoom) }
              : n,
          ),
        }))
        return
      }

      if (isDrawingRef.current) {
        const rect = canvasRef.current?.getBoundingClientRect()
        if (!rect) return
        const vp = viewportRef.current
        const x = (e.clientX - rect.left) / vp.zoom - vp.x
        const y = (e.clientY - rect.top) / vp.zoom - vp.y
        const next = [...drawingPointsRef.current, { x, y }]
        drawingPointsRef.current = next
        setDrawingPoints(next)
      }
    }

    const onMouseUp = () => {
      setIsPanning(false)
      setDraggingNodeId(null)
      setResizingNodeId(null)

      if (isDrawingRef.current && drawingPointsRef.current.length > 1) {
        const pts = drawingPointsRef.current
        const minX = Math.min(...pts.map((p) => p.x))
        const minY = Math.min(...pts.map((p) => p.y))
        const maxX = Math.max(...pts.map((p) => p.x))
        const maxY = Math.max(...pts.map((p) => p.y))
        const drawNode: TextNode = {
          id: createNodeId(),
          type: "text",
          x: minX,
          y: minY,
          // Keep the draw node tight to the path bounds so there is no large arbitrary hit area.
          width: Math.max(4, maxX - minX),
          height: Math.max(4, maxY - minY),
          content: `[drawing:${JSON.stringify(pts.map((p) => ({ x: p.x - minX, y: p.y - minY })))}]`,
        }
        commitBoard((prev) => ({ ...prev, nodes: [...prev.nodes, drawNode] }))
      }

      isDrawingRef.current = false
      setIsDrawing(false)
      drawingPointsRef.current = []
      setDrawingPoints([])
    }

    window.addEventListener("mousemove", onMouseMove)
    window.addEventListener("mouseup", onMouseUp)
    return () => {
      window.removeEventListener("mousemove", onMouseMove)
      window.removeEventListener("mouseup", onMouseUp)
    }
  }, [isPanning, panStart, draggingNodeId, dragOffset, resizingNodeId, resizeStart, clientToCanvas, commitBoard])

  /* ---- node mouse-down ---- */
  const handleNodeMouseDown = useCallback(
    (e: React.MouseEvent, nodeId: string) => {
      e.stopPropagation()

      const node = nodes.find((n) => n.id === nodeId)
      if (!node) return

      if (activeTool === "line") {
        if (!lineStart) {
          setLineStart(nodeId)
        } else if (lineStart !== nodeId) {
          commitBoard((prev) => ({
            ...prev,
            lines: [...prev.lines, { id: createNodeId(), fromId: lineStart, toId: nodeId, color: "var(--app-accent, #7ea8ff)" }],
          }))
          setLineStart(null)
          setActiveTool("select")
        }
        return
      }

      setSelectedNodeId(nodeId)
      const pos = clientToCanvas(e.clientX, e.clientY)
      setDragOffset({ dx: pos.x - node.x, dy: pos.y - node.y })
      setDraggingNodeId(nodeId)
    },
    [activeTool, lineStart, clientToCanvas, nodes, commitBoard],
  )

  /* ---- resize handle ---- */
  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent, nodeId: string) => {
      e.stopPropagation()
      const node = nodes.find((n) => n.id === nodeId)
      if (!node) return
      setResizingNodeId(nodeId)
      setResizeStart({ startW: node.width, startH: node.height, startX: e.clientX, startY: e.clientY })
    },
    [nodes],
  )

  /* ---- delete node ---- */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!selectedNodeId) return
      if (editingNodeId) return
      if (e.key === "Backspace" || e.key === "Delete") {
        commitBoard((prev) => ({
          ...prev,
          nodes: prev.nodes.filter((n) => n.id !== selectedNodeId),
          lines: prev.lines.filter((l) => l.fromId !== selectedNodeId && l.toId !== selectedNodeId),
        }))
        setSelectedNodeId(null)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [selectedNodeId, editingNodeId, commitBoard])

  /* ---- drop handler for images / files ---- */
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const pos = clientToCanvas(e.clientX, e.clientY)

      // Dropped URL / link
      const droppedUrl = e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain")
      if (droppedUrl && /^https?:\/\//.test(droppedUrl.trim())) {
        const newNode: LinkNode = {
          id: createNodeId(),
          type: "link",
          x: pos.x,
          y: pos.y,
          width: 240,
          height: 48,
          url: droppedUrl.trim(),
          label: droppedUrl.trim(),
        }
        commitBoard((prev) => ({ ...prev, nodes: [...prev.nodes, newNode] }))
        return
      }

      // Dropped files (images or generic)
      const files = Array.from(e.dataTransfer.files)
      for (const file of files) {
        if (file.type.startsWith("image/")) {
          const reader = new FileReader()
          reader.onload = () => {
            const newNode: ImageNode = {
              id: createNodeId(),
              type: "image",
              x: pos.x,
              y: pos.y,
              width: 240,
              height: 180,
              src: reader.result as string,
            }
            commitBoard((prev) => ({ ...prev, nodes: [...prev.nodes, newNode] }))
          }
          reader.readAsDataURL(file)
        } else {
          const newNode: FileNode = {
            id: createNodeId(),
            type: "file",
            x: pos.x,
            y: pos.y,
            width: 200,
            height: 56,
            fileName: file.name,
          }
          commitBoard((prev) => ({ ...prev, nodes: [...prev.nodes, newNode] }))
        }
      }
    },
    [clientToCanvas, commitBoard],
  )

  /* ---- add image via file picker ---- */
  const handleAddImage = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        const newNode: ImageNode = {
          id: createNodeId(),
          type: "image",
          x: -viewport.x + 200,
          y: -viewport.y + 200,
          width: 240,
          height: 180,
          src: reader.result as string,
        }
        commitBoard((prev) => ({ ...prev, nodes: [...prev.nodes, newNode] }))
      }
      reader.readAsDataURL(file)
      e.target.value = ""
    },
    [viewport, commitBoard],
  )

  /* ---- add link via prompt ---- */
  const handleAddLink = useCallback(() => {
    const url = window.prompt("Enter a URL:")
    if (!url) return
    const newNode: LinkNode = {
      id: createNodeId(),
      type: "link",
      x: -viewport.x + 200,
      y: -viewport.y + 200,
      width: 260,
      height: 48,
      url,
      label: url,
    }
    commitBoard((prev) => ({ ...prev, nodes: [...prev.nodes, newNode] }))
  }, [viewport, commitBoard])

  /* ---- render a single node ---- */
  const renderNode = (node: PinboardNode) => {
    const isSelected = node.id === selectedNodeId
    const isEditing = node.id === editingNodeId

    // Detect drawing-encoded text node
    const isDrawingNode = node.type === "text" && node.content.startsWith("[drawing:")
    let drawPts: Array<{ x: number; y: number }> | null = null
    if (isDrawingNode && node.type === "text") {
      try {
        drawPts = JSON.parse(node.content.slice(9, -1)) as Array<{ x: number; y: number }>
      } catch {
        /* ignore */
      }
    }

    return (
      <div
        key={node.id}
        className={`pinboard-node pinboard-node--${node.type} ${isDrawingNode ? "pinboard-node--drawing" : ""} ${isSelected ? "pinboard-node--selected" : ""}`}
        style={{ left: node.x, top: node.y, width: node.width, height: node.height }}
        onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
        onDoubleClick={(e) => {
          e.stopPropagation()
          if (node.type === "text" && !isDrawingNode) setEditingNodeId(node.id)
          if (node.type === "link") window.open(node.url, "_blank", "noopener,noreferrer")
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
              onChange={(e) => {
                const value = e.target.value
                commitBoard((prev) => ({
                  ...prev,
                  nodes: prev.nodes.map((n) => (n.id === node.id ? { ...n, content: value } : n)),
                }))
              }}
              onBlur={() => setEditingNodeId(null)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setEditingNodeId(null)
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

        {isSelected && !isDrawingNode ? <div className="pinboard-node__resize" onMouseDown={(e) => handleResizeMouseDown(e, node.id)} /> : null}
      </div>
    )
  }

  /* ---- build SVG lines ---- */
  const renderedLines = lines
    .map((line) => {
      const from = nodes.find((n) => n.id === line.fromId)
      const to = nodes.find((n) => n.id === line.toId)
      if (!from || !to) return null
      const a = nodeCenter(from)
      const b = nodeCenter(to)
      return (
        <line
          key={line.id}
          className="pinboard-line"
          x1={a.cx}
          y1={a.cy}
          x2={b.cx}
          y2={b.cy}
          stroke={line.color}
          strokeWidth={2}
          onClick={() => {
            commitBoard((prev) => ({ ...prev, lines: prev.lines.filter((l) => l.id !== line.id) }))
          }}
        />
      )
    })
    .filter(Boolean)

  /* ---- active drawing path ---- */
  const drawingPath =
    isDrawing && drawingPoints.length > 1
      ? drawingPoints.map((p) => `${p.x},${p.y}`).join(" ")
      : null

  const zoomPercent = Math.round(viewport.zoom * 100)

  return (
    <div className="pinboard-editor">
      {/* ---- canvas ---- */}
      <div
        ref={canvasRef}
        className={`pinboard-canvas ${activeTool === "text" ? "pinboard-canvas--crosshair" : ""} ${isPanning ? "pinboard-canvas--grabbing" : ""} ${activeTool === "draw" ? "pinboard-canvas--draw" : ""}`}
        onMouseDown={handleCanvasMouseDown}
        onWheel={handleWheel}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
      >
        <div
          className="pinboard-canvas__layer"
          style={{
            transform: `scale(${viewport.zoom}) translate(${viewport.x}px, ${viewport.y}px)`,
            transformOrigin: "0 0",
          }}
        >
          {/* SVG layer for lines + active drawing */}
          <svg className="pinboard-canvas__svg">
            {renderedLines}
            {drawingPath ? (
              <polyline
                className="pinboard-canvas__drawing-active"
                points={drawingPath}
                fill="none"
                stroke="#fff"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}
          </svg>

          {/* Nodes */}
          {nodes.map(renderNode)}
        </div>
      </div>

      {/* ---- floating toolbar ---- */}
      <div
        ref={toolbarRef}
        className={`pinboard-toolbar ${isDraggingToolbar ? "pinboard-toolbar--dragging" : ""}`}
        style={toolbarPos ? { left: toolbarPos.x, top: toolbarPos.y, bottom: "auto", transform: "none" } : undefined}
      >
        <div className="pinboard-toolbar__grip" onMouseDown={handleToolbarDragStart} title="Drag to reposition">
          ⠿
        </div>
        <button
          type="button"
          className={`pinboard-toolbar__btn ${activeTool === "select" ? "pinboard-toolbar__btn--active" : ""}`}
          onClick={() => setActiveTool("select")}
          aria-label="Select tool"
          title="Select"
        >
          ↖
        </button>
        <button
          type="button"
          className={`pinboard-toolbar__btn ${activeTool === "text" ? "pinboard-toolbar__btn--active" : ""}`}
          onClick={() => setActiveTool("text")}
          aria-label="Text tool"
          title="Text box"
        >
          <TextInitial size={16} />
        </button>
        <button
          type="button"
          className={`pinboard-toolbar__btn ${activeTool === "line" ? "pinboard-toolbar__btn--active" : ""}`}
          onClick={() => { setActiveTool("line"); setLineStart(null) }}
          aria-label="Line tool"
          title="Connect nodes"
        >
          ╱
        </button>
        <button
          type="button"
          className={`pinboard-toolbar__btn ${activeTool === "draw" ? "pinboard-toolbar__btn--active" : ""}`}
          onClick={() => setActiveTool("draw")}
          aria-label="Draw tool"
          title="Freehand draw"
        >
          <Brush size={16} />
        </button>
        <span className="pinboard-toolbar__separator" />
        <button type="button" className="pinboard-toolbar__btn" onClick={handleAddImage} aria-label="Add image" title="Add image">
          <ImageUp size={16} />
        </button>
        <button type="button" className="pinboard-toolbar__btn" onClick={handleAddLink} aria-label="Add link" title="Add link">
          <LinkIcon size={16} />
        </button>
        <span className="pinboard-toolbar__separator" />
        <span className="pinboard-toolbar__zoom">{zoomPercent}%</span>
        <button
          type="button"
          className="pinboard-toolbar__btn"
          aria-label="Zoom in"
          title="Zoom in"
          onClick={() => commitBoard((prev) => ({ ...prev, viewport: { ...prev.viewport, zoom: Math.min(5, prev.viewport.zoom * 1.15) } }))}
        >
          +
        </button>
        <button
          type="button"
          className="pinboard-toolbar__btn"
          aria-label="Zoom out"
          title="Zoom out"
          onClick={() => commitBoard((prev) => ({ ...prev, viewport: { ...prev.viewport, zoom: Math.max(0.15, prev.viewport.zoom * 0.87) } }))}
        >
          −
        </button>
        <button
          type="button"
          className="pinboard-toolbar__btn"
          aria-label="Reset zoom"
          title="Reset view"
          onClick={() => commitBoard((prev) => ({ ...prev, viewport: { x: 0, y: 0, zoom: 1 } }))}
        >
          ⊙
        </button>
      </div>

      {/* hidden file input for add-image */}
      <input ref={fileInputRef} type="file" accept="image/*" className="pinboard-editor__file-input" onChange={handleFileInputChange} />
    </div>
  )
}
