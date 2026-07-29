import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  EMPTY_BOARD,
  createNodeId,
  nodeCenter,
  parseBoardData,
  serializeBoardData,
  type FileNode,
  type ImageNode,
  type LinkNode,
  type PinboardData,
  type PinboardTool,
} from "./utils/pinboardData"
import { PinboardNodeView } from "./components/PinboardNode"
import { PinboardToolbar } from "./components/PinboardToolbar"
import { useToolbarDrag } from "./hooks/useToolbarDrag"
import { activeDrawingPath, usePinboardGestures } from "./hooks/usePinboardGestures"
import "./PinboardEditor.css"

type PinboardEditorProps = {
  documentId: string | null
  content: string
  onContentChange: (nextContent: string) => void
}

export default function PinboardEditor({ documentId, content, onContentChange }: PinboardEditorProps) {
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const board = useMemo<PinboardData>(() => parseBoardData(content), [content])
  const { nodes, lines, viewport } = board
  const contentRef = useRef(content)
  contentRef.current = content

  const commitBoard = useCallback(
    (updater: (prev: PinboardData) => PinboardData) => {
      const next = updater(parseBoardData(contentRef.current))
      onContentChange(serializeBoardData(next))
    },
    [onContentChange],
  )

  const [activeTool, setActiveTool] = useState<PinboardTool>("select")

  const gestures = usePinboardGestures({
    board,
    commitBoard,
    canvasRef,
    activeTool,
    onActiveToolChange: setActiveTool,
  })

  useEffect(() => {
    setActiveTool("select")
    gestures.resetSelectionState()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId])

  const { toolbarRef, toolbarPos, isDragging: isDraggingToolbar, onGripMouseDown } =
    useToolbarDrag({ useParentRelativeCoords: true })

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault()
      const rect = canvasRef.current?.getBoundingClientRect()
      if (!rect) return
      const scaleBy = e.deltaY > 0 ? 0.92 : 1.08
      const mx = (e.clientX - rect.left) / viewport.zoom - viewport.x
      const my = (e.clientY - rect.top) / viewport.zoom - viewport.y
      const nextZoom = Math.max(0.15, Math.min(5, viewport.zoom * scaleBy))
      const nextX = (e.clientX - rect.left) / nextZoom - mx
      const nextY = (e.clientY - rect.top) / nextZoom - my
      commitBoard((prev) => ({ ...prev, viewport: { x: nextX, y: nextY, zoom: nextZoom } }))
    },
    [viewport, commitBoard],
  )

  const zoomIn = useCallback(
    () => commitBoard((prev) => ({ ...prev, viewport: { ...prev.viewport, zoom: Math.min(5, prev.viewport.zoom * 1.15) } })),
    [commitBoard],
  )
  const zoomOut = useCallback(
    () => commitBoard((prev) => ({ ...prev, viewport: { ...prev.viewport, zoom: Math.max(0.15, prev.viewport.zoom * 0.87) } })),
    [commitBoard],
  )
  const resetZoom = useCallback(
    () => commitBoard((prev) => ({ ...prev, viewport: EMPTY_BOARD.viewport })),
    [commitBoard],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const pos = gestures.clientToCanvas(e.clientX, e.clientY)

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
    [gestures, commitBoard],
  )

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

  const handleTextChange = useCallback(
    (nodeId: string, value: string) => {
      commitBoard((prev) => ({
        ...prev,
        nodes: prev.nodes.map((n) => (n.id === nodeId ? { ...n, content: value } : n)),
      }))
    },
    [commitBoard],
  )

  const openLinkInNewTab = useCallback((url: string) => {
    window.open(url, "_blank", "noopener,noreferrer")
  }, [])

  const removeLine = useCallback(
    (lineId: string) => {
      commitBoard((prev) => ({ ...prev, lines: prev.lines.filter((l) => l.id !== lineId) }))
    },
    [commitBoard],
  )

  const drawingPath = activeDrawingPath(gestures.isDrawing, gestures.drawingPoints)
  const zoomPercent = Math.round(viewport.zoom * 100)
  const canvasClasses = [
    "pinboard-canvas",
    activeTool === "text" || activeTool === "marquee" ? "pinboard-canvas--crosshair" : "",
    gestures.isPanning ? "pinboard-canvas--grabbing" : "",
    activeTool === "draw" ? "pinboard-canvas--draw" : "",
  ].filter(Boolean).join(" ")

  return (
    <div className="pinboard-editor">
      <div
        ref={canvasRef}
        className={canvasClasses}
        onMouseDown={gestures.handleCanvasMouseDown}
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
          <svg className="pinboard-canvas__svg">
            {lines.map((line) => {
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
                  onClick={() => removeLine(line.id)}
                />
              )
            })}
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

          {nodes.map((node) => (
            <PinboardNodeView
              key={node.id}
              node={node}
              isSelected={gestures.isNodeSelected(node.id)}
              isEditing={gestures.editingNodeId === node.id}
              onMouseDown={gestures.handleNodeMouseDown}
              onResizeMouseDown={gestures.handleResizeMouseDown}
              onStartEditing={gestures.setEditingNodeId}
              onStopEditing={() => gestures.setEditingNodeId(null)}
              onTextChange={handleTextChange}
              onOpenLink={openLinkInNewTab}
            />
          ))}

          {gestures.marqueeRect ? (
            <div
              className="pinboard-marquee"
              style={{
                left: gestures.marqueeRect.x,
                top: gestures.marqueeRect.y,
                width: gestures.marqueeRect.width,
                height: gestures.marqueeRect.height,
              }}
            />
          ) : null}
        </div>
      </div>

      <PinboardToolbar
        toolbarRef={toolbarRef}
        toolbarPos={toolbarPos}
        isDragging={isDraggingToolbar}
        onGripMouseDown={onGripMouseDown}
        activeTool={activeTool}
        onSelectTool={setActiveTool}
        onAddImage={handleAddImage}
        onAddLink={handleAddLink}
        zoomPercent={zoomPercent}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onResetZoom={resetZoom}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="pinboard-editor__file-input"
        onChange={handleFileInputChange}
      />
    </div>
  )
}
