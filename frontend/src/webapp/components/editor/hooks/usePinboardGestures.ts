import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  createNodeId,
  type PinboardData,
  type PinboardTool,
  type TextNode,
} from "../utils/pinboardData"
import { snapStrokeToShape } from "../utils/shapeRecognition"

const SHAPE_SNAP_HOLD_MS = 2000

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
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set())
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null)

  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null)
  const [dragOffset, setDragOffset] = useState({ dx: 0, dy: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [panStart, setPanStart] = useState({ px: 0, py: 0 })
  const [resizingNodeId, setResizingNodeId] = useState<string | null>(null)
  const [resizeStart, setResizeStart] = useState({ startW: 0, startH: 0, startX: 0, startY: 0 })
  const [lineStart, setLineStart] = useState<string | null>(null)

  const [isMarquee, setIsMarquee] = useState(false)
  const [marqueeOrigin, setMarqueeOrigin] = useState({ x: 0, y: 0 })
  const [marqueeEnd, setMarqueeEnd] = useState({ x: 0, y: 0 })
  const isMarqueeRef = useRef(false)

  const [drawingPoints, setDrawingPoints] = useState<Array<{ x: number; y: number }>>([])
  const drawingPointsRef = useRef<Array<{ x: number; y: number }>>([])
  const lastDrawingPointRef = useRef<{ x: number; y: number } | null>(null)
  const drawingFrameRef = useRef<number | null>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const isDrawingRef = useRef(false)

  const snapHoldTimerRef = useRef<number | null>(null)
  const strokeSnappedRef = useRef(false)

  const scheduleDrawingUpdate = useCallback(() => {
    if (drawingFrameRef.current !== null) return
    drawingFrameRef.current = window.requestAnimationFrame(() => {
      drawingFrameRef.current = null
      setDrawingPoints(drawingPointsRef.current)
    })
  }, [])

  const clearSnapHoldTimer = useCallback(() => {
    if (snapHoldTimerRef.current !== null) {
      window.clearTimeout(snapHoldTimerRef.current)
      snapHoldTimerRef.current = null
    }
  }, [])

  const armSnapHoldTimer = useCallback(() => {
    clearSnapHoldTimer()
    snapHoldTimerRef.current = window.setTimeout(() => {
      snapHoldTimerRef.current = null
      if (!isDrawingRef.current || strokeSnappedRef.current) return
      const snapped = snapStrokeToShape(drawingPointsRef.current)
      if (snapped.length < 2 || snapped === drawingPointsRef.current) return
      strokeSnappedRef.current = true
      drawingPointsRef.current = snapped
      lastDrawingPointRef.current = null
      if (drawingFrameRef.current !== null) {
        window.cancelAnimationFrame(drawingFrameRef.current)
        drawingFrameRef.current = null
      }
      setDrawingPoints(snapped)
    }, SHAPE_SNAP_HOLD_MS)
  }, [clearSnapHoldTimer])

  const viewportRef = useRef(board.viewport)
  viewportRef.current = board.viewport

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

  const handleCanvasMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest(".pinboard-node")) return

      const pos = clientToCanvas(e.clientX, e.clientY)

      if (activeTool === "text") {
        e.preventDefault()
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
        e.preventDefault()
        setIsDrawing(true)
        isDrawingRef.current = true
        strokeSnappedRef.current = false
        const pts = [pos]
        drawingPointsRef.current = pts
        lastDrawingPointRef.current = pos
        setDrawingPoints(pts)
        armSnapHoldTimer()
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
    [activeTool, clientToCanvas, commitBoard, onActiveToolChange, armSnapHoldTimer],
  )

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
        if (strokeSnappedRef.current) return
        const rect = canvasRef.current?.getBoundingClientRect()
        if (!rect) return
        const vp = viewportRef.current
        const x = (e.clientX - rect.left) / vp.zoom - vp.x
        const y = (e.clientY - rect.top) / vp.zoom - vp.y
        const nextPoint = { x, y }
        const previousPoint = lastDrawingPointRef.current
        const shouldAddPoint =
          previousPoint === null ||
          ((previousPoint.x - x) ** 2 + (previousPoint.y - y) ** 2) >= 4

        if (shouldAddPoint) {
          drawingPointsRef.current = [...drawingPointsRef.current, nextPoint]
          lastDrawingPointRef.current = nextPoint
          scheduleDrawingUpdate()
          armSnapHoldTimer()
        }
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
      clearSnapHoldTimer()
      strokeSnappedRef.current = false

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

      if (drawingFrameRef.current !== null) {
        window.cancelAnimationFrame(drawingFrameRef.current)
        drawingFrameRef.current = null
      }

      isDrawingRef.current = false
      setIsDrawing(false)
      drawingPointsRef.current = []
      lastDrawingPointRef.current = null
      setDrawingPoints([])

      if (isMarqueeRef.current) {
        isMarqueeRef.current = false
        setIsMarquee(false)
      }
    }

    window.addEventListener("mousemove", onMouseMove)
    window.addEventListener("mouseup", onMouseUp)
    window.addEventListener("blur", onMouseUp)
    return () => {
      window.removeEventListener("mousemove", onMouseMove)
      window.removeEventListener("mouseup", onMouseUp)
      window.removeEventListener("blur", onMouseUp)
      clearSnapHoldTimer()
    }
  }, [
    isPanning, panStart, draggingNodeId, dragOffset, resizingNodeId, resizeStart,
    clientToCanvas, commitBoard, canvasRef, armSnapHoldTimer, clearSnapHoldTimer,
  ])

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

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (editingNodeId) return

      if (e.key === "Escape" && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        if (selectedNodeId || selectedNodeIds.size > 0) {
          setSelectedNodeId(null)
          setSelectedNodeIds(new Set())
        }
        return
      }

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

  const marqueeRect = useMemo(() => {
    if (!isMarquee) return null
    const x = Math.min(marqueeOrigin.x, marqueeEnd.x)
    const y = Math.min(marqueeOrigin.y, marqueeEnd.y)
    const width = Math.abs(marqueeEnd.x - marqueeOrigin.x)
    const height = Math.abs(marqueeEnd.y - marqueeOrigin.y)
    return { x, y, width, height }
  }, [isMarquee, marqueeOrigin, marqueeEnd])

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
    isNodeSelected,
    editingNodeId,
    setEditingNodeId,
    handleCanvasMouseDown,
    handleNodeMouseDown,
    handleResizeMouseDown,
    drawingPoints,
    isDrawing,
    marqueeRect,
    isPanning,
    clientToCanvas,
    resetSelectionState,
  } as const
}

export function activeDrawingPath(isDrawing: boolean, drawingPoints: Array<{ x: number; y: number }>) {
  if (!isDrawing || drawingPoints.length === 0) return null
  const pts = drawingPoints.length === 1 ? [drawingPoints[0], drawingPoints[0]] : drawingPoints
  return pts.map((p) => `${p.x},${p.y}`).join(" ")
}
