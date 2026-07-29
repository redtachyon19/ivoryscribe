import { useCallback, useEffect, useRef, useState } from "react"
import { AlertCircle, FileImage } from "lucide-react"
import "./ImageViewer.css"

const MIN_ZOOM = 0.25
const MAX_ZOOM = 32

type ImageViewerProps = {
  workspaceRoot: string | null
  relativePath: string
}

function mimeForExtension(relativePath: string): string {
  const lower = relativePath.toLowerCase()
  if (lower.endsWith(".png")) return "image/png"
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg"
  return "application/octet-stream"
}

export default function ImageViewer({ workspaceRoot, relativePath }: ImageViewerProps) {
  const filePath = (() => {
    if (!workspaceRoot) return null
    const api = window.electronAPI?.path
    if (!api) return null
    return api.join(workspaceRoot, relativePath)
  })()

  const preflightError = (() => {
    if (!filePath) return "No workspace folder selected — open Settings to choose one."
    const api = window.electronAPI?.fs
    if (!api || typeof api.readFileBinary !== "function") return "Image viewing requires the desktop app."
    return null
  })()

  type LoadState =
    | { status: "loading" }
    | { status: "ready"; url: string }
    | { status: "error"; message: string }
  const [load, setLoad] = useState<LoadState>({ status: "loading" })
  const lastUrlRef = useRef<string | null>(null)

  const scrollRef = useRef<HTMLDivElement | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const pendingZoomRef = useRef(1)
  const naturalDimsRef = useRef<{ w: number; h: number } | null>(null)
  const baseDimsRef = useRef<{ w: number; h: number } | null>(null)
  const lastPinchTimeRef = useRef(0)
  const clampHitTimeRef = useRef(0)

  const FALLBACK_PAD_X = 48
  const FALLBACK_PAD_Y = 48

  const readStagePadding = useCallback((): { x: number; y: number } => {
    const stage = stageRef.current
    if (!stage) return { x: FALLBACK_PAD_X, y: FALLBACK_PAD_Y }
    const cs = getComputedStyle(stage)
    const px = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0)
    const py = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0)
    return {
      x: px > 0 ? px : FALLBACK_PAD_X,
      y: py > 0 ? py : FALLBACK_PAD_Y,
    }
  }, [])

  const computeBaseDims = useCallback((naturalW: number, naturalH: number): { w: number; h: number } | null => {
    const scroller = scrollRef.current
    if (!scroller || naturalW <= 0 || naturalH <= 0) return null
    const { x: padX, y: padY } = readStagePadding()
    const availW = Math.max(1, scroller.clientWidth - padX)
    const availH = Math.max(1, scroller.clientHeight - padY)
    const scale = Math.min(availW / naturalW, availH / naturalH, 1)
    return { w: naturalW * scale, h: naturalH * scale }
  }, [readStagePadding])

  const applyZoom = useCallback((zoom: number) => {
    const img = imgRef.current
    const stage = stageRef.current
    const scroller = scrollRef.current
    const base = baseDimsRef.current
    if (!img || !stage || !scroller || !base) return

    const displayW = base.w * zoom
    const displayH = base.h * zoom

    img.style.maxWidth = "none"
    img.style.maxHeight = "none"
    img.style.width = `${displayW}px`
    img.style.height = `${displayH}px`

    const { x: padX, y: padY } = readStagePadding()
    const stageW = Math.max(scroller.clientWidth, displayW + padX)
    const stageH = Math.max(scroller.clientHeight, displayH + padY)
    stage.style.minWidth = "0"
    stage.style.minHeight = "0"
    stage.style.width = `${stageW}px`
    stage.style.height = `${stageH}px`
  }, [readStagePadding])

  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const naturalW = e.currentTarget.naturalWidth
    const naturalH = e.currentTarget.naturalHeight
    if (naturalW <= 0 || naturalH <= 0) return
    naturalDimsRef.current = { w: naturalW, h: naturalH }
    baseDimsRef.current = computeBaseDims(naturalW, naturalH)
    applyZoom(pendingZoomRef.current)
  }, [applyZoom, computeBaseDims])

  const stageRefCallback = useCallback((el: HTMLDivElement | null) => {
    stageRef.current = el
    if (!el) return
    pendingZoomRef.current = 1
    baseDimsRef.current = null
    naturalDimsRef.current = null
    el.style.zoom = ""
    el.style.width = ""
    el.style.height = ""
    el.style.minWidth = ""
    el.style.minHeight = ""
    const scroller = scrollRef.current
    if (scroller) {
      scroller.scrollLeft = 0
      scroller.scrollTop = 0
    }
  }, [])

  useEffect(() => {
    if (preflightError) return
    const absPath = filePath
    if (!absPath) return
    const api = window.electronAPI?.fs
    if (!api || typeof api.readFileBinary !== "function") return

    let cancelled = false

    void (async () => {
      try {
        const bytes = await api.readFileBinary(absPath)
        if (cancelled) return
        const blob = new Blob([bytes.slice()], { type: mimeForExtension(relativePath) })
        const url = URL.createObjectURL(blob)
        if (cancelled) {
          URL.revokeObjectURL(url)
          return
        }
        if (lastUrlRef.current) URL.revokeObjectURL(lastUrlRef.current)
        lastUrlRef.current = url
        setLoad({ status: "ready", url })
      } catch (err) {
        if (cancelled) return
        const message = err instanceof Error ? err.message : "Failed to load image"
        setLoad({ status: "error", message })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [filePath, relativePath, preflightError])

  useEffect(() => {
    return () => {
      if (lastUrlRef.current) {
        URL.revokeObjectURL(lastUrlRef.current)
        lastUrlRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const PINCH_TAIL_MS = 200
    const CLAMP_COOLDOWN_MS = 250

    const onWheel = (event: WheelEvent) => {
      const now = performance.now()

      if (!event.ctrlKey) {
        if (now - lastPinchTimeRef.current < PINCH_TAIL_MS) {
          event.preventDefault()
        }
        return
      }

      event.preventDefault()
      lastPinchTimeRef.current = now

      if (now - clampHitTimeRef.current < CLAMP_COOLDOWN_MS) {
        clampHitTimeRef.current = now
        return
      }

      const oldZoom = pendingZoomRef.current
      const factor = Math.exp(-event.deltaY * 0.01)
      const rawZoom = oldZoom * factor
      const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, rawZoom))
      if (newZoom === oldZoom) {
        clampHitTimeRef.current = now
        return
      }
      pendingZoomRef.current = newZoom

      const stageEl = stageRef.current
      if (!stageEl) return

      const r = newZoom / oldZoom
      const rect = el.getBoundingClientRect()
      const cursorX = event.clientX - rect.left
      const cursorY = event.clientY - rect.top
      const oldScrollLeft = el.scrollLeft
      const oldScrollTop = el.scrollTop

      applyZoom(newZoom)
      el.scrollLeft = cursorX * (r - 1) + oldScrollLeft * r
      el.scrollTop = cursorY * (r - 1) + oldScrollTop * r
    }

    el.addEventListener("wheel", onWheel, { passive: false })
    return () => {
      el.removeEventListener("wheel", onWheel)
    }
  }, [load.status])

  if (preflightError) {
    return (
      <div className="image-viewer image-viewer--error" role="alert">
        <AlertCircle size={28} strokeWidth={1.6} aria-hidden={true} />
        <span>{preflightError}</span>
        <span className="image-viewer__path">{relativePath}</span>
      </div>
    )
  }

  if (load.status === "error") {
    return (
      <div className="image-viewer image-viewer--error" role="alert">
        <AlertCircle size={28} strokeWidth={1.6} aria-hidden={true} />
        <span>{load.message}</span>
        <span className="image-viewer__path">{relativePath}</span>
      </div>
    )
  }

  if (load.status === "loading") {
    return (
      <div className="image-viewer image-viewer__loading">
        <FileImage size={28} strokeWidth={1.6} aria-hidden={true} />
        <span>Loading image…</span>
      </div>
    )
  }

  return (
    <div className="image-viewer" ref={scrollRef}>
      <div className="image-viewer__stage" ref={stageRefCallback}>
        <img
          ref={imgRef}
          className="image-viewer__image"
          src={load.url}
          alt={relativePath}
          draggable={false}
          onLoad={handleImageLoad}
        />
      </div>
    </div>
  )
}
