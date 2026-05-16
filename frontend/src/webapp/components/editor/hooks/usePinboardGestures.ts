// All pointer-driven board interactions for PinboardEditor: pan, drag, resize,
// freehand draw, marquee select, line-connect, and global keyboard delete.
//
// The hook owns every piece of interaction state plus the global mousemove /
// mouseup / keydown listeners. The parent passes the current board, a
// `commitBoard` updater, and a canvas ref; the hook returns event handlers
// and a few rendered-state values (drawing points for the active path,
// marquee rect, selection ids) for the JSX.

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  createNodeId,
  type PinboardData,
  type PinboardTool,
  type TextNode,
} from "../utils/pinboardData"

type CommitBoard = (updater: (prev: PinboardData) => PinboardData) => void

type UsePinboardGesturesParams = {
  board: PinboardData
  commitBoard: CommitBoard
  canvasRef: React.RefObject<HTMLDivElement | null>
  activeTool: PinboardTool
  onActiveToolChange: (tool: PinboardTool) => void
}

export function usePinboardGestures({
  board,
  commitBoard,
  canvasRef,
  activeTool,
  onActiveToolChange,
}: UsePinboardGesturesParams) {
  /* ── Selection / edit state ── */
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set())
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null)

  /* ── Active-gesture state ── */
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null)
  const [dragOffset, setDragOffset] = useState({ dx: 0, dy: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [panStart, setPanStart] = useState({ px: 0, py: 0 })
  const [resizingNodeId, setResizingNodeId] = useState<string | null>(null)
  const [resizeStart, setResizeStart] = useState({ startW: 0, startH: 0, startX: 0, startY: 0 })
  const [lineStart, setLineStart] = useState<string | null>(null)

  /* ── Marquee selection ── */
  const [isMarquee, setIsMarquee] = useState(false)
  const [marqueeOrigin, setMarqueeOrigin] = useState({ x: 0, y: 0 })
  const [marqueeEnd, setMarqueeEnd] = useState({ x: 0, y: 0 })
  const isMarqueeRef = useRef(false)

  /* ── Freehand drawing ── */
  const [drawingPoints, setDrawingPoints] = useState<Array<{ x: number; y: number }>>([])
  const drawingPointsRef = useRef<Array<{ x: number; y: number }>>([])
  const [isDrawing, setIsDrawing] = useState(false)
  const isDrawingRef = useRef(false)

  /* ── Viewport ref (avoids recreating handlers on every pan) ── */
  const viewportRef = useRef(board.viewport)
  viewportRef.current = board.viewport

  /* ── client→canvas coordinate translation ── */
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
    [canvasRef],
  )

  /* ── Background mouse-down: pan, marquee, draw, or add text ── */
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
        onActiveToolChange("select")
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

      if (activeTool === "marquee") {
        e.preventDefault()
        setIsMarquee(true)
        isMarqueeRef.current = true
        setMarqueeOrigin(pos)
        setMarqueeEnd(pos)
        setSelectedNodeIds(new Set())
        return
      }

      setIsPanning(true)
      setPanStart({ px: e.clientX, py: e.clientY })
    },
    [activeTool, clientToCanvas, commitBoard, onActiveToolChange],
  )

  /* ── Global mouse-move / mouse-up listener ──
       Covers every active gesture: pan, node drag, resize, freehand draw,
       marquee. All five reset together on mouseup. */
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (isPanning) {
        const dx = e.clientX - panStart.px
        const dy = e.clientY - panStart.py
        commitBoard((prev) => ({
          ...prev,
          viewport: {
            ...prev.viewport,
            x: prev.viewport.x + dx / prev.viewport.zoom,
            y: prev.viewport.y + dy / prev.viewport.zoom,
          },
        }))
        setPanStart({ px: e.clientX, py: e.clientY })
        return
      }

      if (draggingNodeId) {
        const pos = clientToCanvas(e.clientX, e.clientY)
        commitBoard((prev) => ({
          ...prev,
          nodes: prev.nodes.map((n) =>
            n.id === draggingNodeId
              ? { ...n, x: pos.x - dragOffset.dx, y: pos.y - dragOffset.dy }
              : n,
          ),
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
              ? {
                  ...n,
                  width: Math.max(80, resizeStart.startW + dx / prev.viewport.zoom),
                  height: Math.max(40, resizeStart.startH + dy / prev.viewport.zoom),
                }
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
        return
      }

      if (isMarqueeRef.current) {
        const rect = canvasRef.current?.getBoundingClientRect()
        if (!rect) return
        const vp = viewportRef.current
        const x = (e.clientX - rect.left) / vp.zoom - vp.x
        const y = (e.clientY - rect.top) / vp.zoom - vp.y
        setMarqueeEnd({ x, y })
      }
    }

    const onMouseUp = () => {
      setIsPanning(false)
      setDraggingNodeId(null)
      setResizingNodeId(null)

      // Materialize a completed freehand drawing as a tight text node with
      // `[drawing:...]` content. The bounding rect of the path becomes the
      // node's box so the hit area is exact.
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

      if (isMarqueeRef.current) {
        isMarqueeRef.current = false
        setIsMarquee(false)
      }
    }

    window.addEventListener("mousemove", onMouseMove)
    window.addEventListener("mouseup", onMouseUp)
    return () => {
      window.removeEventListener("mousemove", onMouseMove)
      window.removeEventListener("mouseup", onMouseUp)
    }
  }, [
    isPanning, panStart, draggingNodeId, dragOffset, resizingNodeId, resizeStart,
    clientToCanvas, commitBoard, canvasRef,
  ])

  /* ── Node mouse-down: start drag, or wire up a line connection ── */
  const handleNodeMouseDown = useCallback(
    (e: React.MouseEvent, nodeId: string) => {
      e.stopPropagation()
      const node = board.nodes.find((n) => n.id === nodeId)
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
          onActiveToolChange("select")
        }
        return
      }

      setSelectedNodeId(nodeId)
      setSelectedNodeIds(new Set())
      const pos = clientToCanvas(e.clientX, e.clientY)
      setDragOffset({ dx: pos.x - node.x, dy: pos.y - node.y })
      setDraggingNodeId(nodeId)
    },
    [activeTool, lineStart, clientToCanvas, board.nodes, commitBoard, onActiveToolChange],
  )

  /* ── Resize-handle mouse-down ── */
  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent, nodeId: string) => {
      e.stopPropagation()
      const node = board.nodes.find((n) => n.id === nodeId)
      if (!node) return
      setResizingNodeId(nodeId)
      setResizeStart({ startW: node.width, startH: node.height, startX: e.clientX, startY: e.clientY })
    },
    [board.nodes],
  )

  /* ── Keyboard: Backspace / Delete to remove the current selection ── */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (editingNodeId) return
      if (e.key !== "Backspace" && e.key !== "Delete") return

      if (selectedNodeIds.size > 0) {
        commitBoard((prev) => ({
          ...prev,
          nodes: prev.nodes.filter((n) => !selectedNodeIds.has(n.id)),
          lines: prev.lines.filter((l) => !selectedNodeIds.has(l.fromId) && !selectedNodeIds.has(l.toId)),
        }))
        setSelectedNodeIds(new Set())
        setSelectedNodeId(null)
        return
      }

      if (selectedNodeId) {
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
  }, [selectedNodeId, selectedNodeIds, editingNodeId, commitBoard])

  /* ── Marquee rectangle + selection ── */
  const marqueeRect = useMemo(() => {
    if (!isMarquee) return null
    const x = Math.min(marqueeOrigin.x, marqueeEnd.x)
    const y = Math.min(marqueeOrigin.y, marqueeEnd.y)
    const width = Math.abs(marqueeEnd.x - marqueeOrigin.x)
    const height = Math.abs(marqueeEnd.y - marqueeOrigin.y)
    return { x, y, width, height }
  }, [isMarquee, marqueeOrigin, marqueeEnd])

  // Recompute which nodes intersect the marquee as the user drags.
  useEffect(() => {
    if (!marqueeRect) return
    const mx1 = marqueeRect.x
    const my1 = marqueeRect.y
    const mx2 = mx1 + marqueeRect.width
    const my2 = my1 + marqueeRect.height
    const ids = new Set<string>()
    for (const node of board.nodes) {
      const nx1 = node.x
      const ny1 = node.y
      const nx2 = nx1 + node.width
      const ny2 = ny1 + node.height
      if (mx1 < nx2 && mx2 > nx1 && my1 < ny2 && my2 > ny1) {
        ids.add(node.id)
      }
    }
    setSelectedNodeIds(ids)
  }, [marqueeRect, board.nodes])

  /* ── Reset on document switch ── */
  const resetSelectionState = useCallback(() => {
    setSelectedNodeId(null)
    setSelectedNodeIds(new Set())
    setEditingNodeId(null)
    setLineStart(null)
  }, [])

  const isNodeSelected = useCallback(
    (nodeId: string) => nodeId === selectedNodeId || selectedNodeIds.has(nodeId),
    [selectedNodeId, selectedNodeIds],
  )

  return {
    // Per-node helpers
    isNodeSelected,
    editingNodeId,
    setEditingNodeId,
    // Event handlers
    handleCanvasMouseDown,
    handleNodeMouseDown,
    handleResizeMouseDown,
    // Render-state values
    drawingPoints,
    isDrawing,
    marqueeRect,
    isPanning,
    // Helpers
    clientToCanvas,
    resetSelectionState,
  } as const
}

/** Render-friendly drawing-path string, or null when no path is active. */
export function activeDrawingPath(isDrawing: boolean, drawingPoints: Array<{ x: number; y: number }>) {
  if (!isDrawing || drawingPoints.length <= 1) return null
  return drawingPoints.map((p) => `${p.x},${p.y}`).join(" ")
}
