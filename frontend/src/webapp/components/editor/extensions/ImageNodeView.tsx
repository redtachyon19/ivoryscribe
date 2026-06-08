// React NodeView for the free-floating, resizable, croppable image.
//
// Every image is absolutely positioned within the editor content box and can be
// dragged anywhere on the page. There is no text wrap or in-flow mode.
//
//   • width — full image display width in px (resize handle, bottom-right).
//   • x, y  — position in layout px from the editor content's top-left. Drag the
//     image to move it.
//   • crop  — { top,right,bottom,left } fractions of the natural image, or null.
//     Non-destructive: rendered by clipping a frame over the full image, so the
//     original is retained and the crop is reversible.
//
// Cropping: double-click the image to enter crop mode, drag the corner handles
// (each release auto-saves), and press Escape or click outside the image to
// leave. There is no crop toolbar.
//
// All pointer math is done against the ProseMirror content element
// (editor.view.dom) and divided by the page's CSS-`zoom` scale, so positions
// are stable and drag tracks the cursor 1:1 at any zoom.

import { NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react"
import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react"

type CropRect = { top: number; right: number; bottom: number; left: number }
const NO_CROP: CropRect = { top: 0, right: 0, bottom: 0, left: 0 }
const MIN_WIDTH = 40
const MAX_WIDTH = 2000
const MIN_CROP_FRAC = 0.08

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}
function cropIsEmpty(c: CropRect) {
  return c.top === 0 && c.right === 0 && c.bottom === 0 && c.left === 0
}

export function ImageNodeView(props: ReactNodeViewProps) {
  const { node, updateAttributes, selected, editor, getPos, extension } = props
  const { src, alt, title } = node.attrs as { src: string; alt?: string; title?: string }
  const x = (node.attrs.x as number) ?? 0
  const y = (node.attrs.y as number) ?? 0
  const crop: CropRect = (node.attrs.crop as CropRect | null) ?? NO_CROP
  const widthAttr = node.attrs.width as number | null

  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)
  const [liveWidth, setLiveWidth] = useState<number | null>(null)
  const [livePos, setLivePos] = useState<{ x: number; y: number } | null>(null)
  const [cropMode, setCropMode] = useState(false)
  const [draftCrop, setDraftCrop] = useState<CropRect>(crop)
  const draftCropRef = useRef<CropRect>(crop)

  const cropStageRef = useRef<HTMLDivElement | null>(null)

  const naturalAspect = natural ? natural.h / natural.w : null
  const width = liveWidth ?? widthAttr ?? (natural ? Math.min(natural.w, 480) : 320)

  const visW = 1 - crop.left - crop.right
  const visH = 1 - crop.top - crop.bottom
  const hasCrop = crop.left > 0 || crop.right > 0 || crop.top > 0 || crop.bottom > 0
  // The free-float drag / resize / crop interactions are a Typewriter
  // (page-layout) affordance. The Drafting view configures the node with
  // interactive:false, so there the image renders passive: it keeps its
  // position but lets pointer events fall through to the reflowed text behind
  // it, instead of grabbing a node selection on every stray click.
  const interactive = editor.isEditable && ((extension.options?.interactive as boolean | undefined) ?? true)

  // ── Drag anywhere ──
  const onImagePointerDown = useCallback((event: ReactPointerEvent) => {
    if (!interactive || event.button !== 0 || cropMode) return
    if (typeof getPos === "function") {
      const pos = getPos()
      if (pos != null) editor.commands.setNodeSelection(pos)
    }
    event.preventDefault()
    const dom = editor.view.dom as HTMLElement
    const domRect = dom.getBoundingClientRect()
    const scale = dom.offsetWidth > 0 ? domRect.width / dom.offsetWidth : 1
    const startX = x
    const startY = y
    const startClientX = event.clientX
    const startClientY = event.clientY
    let moved = false
    const onMove = (e: PointerEvent) => {
      const dx = (e.clientX - startClientX) / scale
      const dy = (e.clientY - startClientY) / scale
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) moved = true
      setLivePos({ x: Math.max(0, Math.round(startX + dx)), y: Math.max(0, Math.round(startY + dy)) })
    }
    const onUp = () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      setLivePos((p) => {
        if (moved && p) updateAttributes({ x: p.x, y: p.y })
        return null
      })
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
  }, [interactive, cropMode, x, y, getPos, editor, updateAttributes])

  // ── Resize (bottom-right handle, aspect locked, zoom-aware) ──
  const onResizeDown = useCallback((event: ReactPointerEvent) => {
    if (!interactive) return
    event.preventDefault()
    event.stopPropagation()
    const dom = editor.view.dom as HTMLElement
    const domRect = dom.getBoundingClientRect()
    const scale = dom.offsetWidth > 0 ? domRect.width / dom.offsetWidth : 1
    const startX = event.clientX
    const startW = width
    const onMove = (e: PointerEvent) => {
      const delta = (e.clientX - startX) / scale
      setLiveWidth(clamp(Math.round(startW + delta), MIN_WIDTH, MAX_WIDTH))
    }
    const onUp = () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      setLiveWidth((committed) => {
        if (committed != null) updateAttributes({ width: committed })
        return null
      })
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
  }, [interactive, width, updateAttributes, editor])

  // ── Enter crop on double-click ──
  const enterCrop = useCallback(() => {
    if (!interactive) return
    setDraftCrop(crop)
    draftCropRef.current = crop
    setCropMode(true)
  }, [interactive, crop])

  // ── Crop corner handles (auto-save on release) ──
  const onCropCornerDown = useCallback(
    (corner: "tl" | "tr" | "bl" | "br") => (event: ReactPointerEvent) => {
      event.preventDefault()
      event.stopPropagation()
      const frame = cropStageRef.current
      if (!frame) return
      const rect = frame.getBoundingClientRect()
      const onMove = (e: PointerEvent) => {
        const fx = clamp((e.clientX - rect.left) / rect.width, 0, 1)
        const fy = clamp((e.clientY - rect.top) / rect.height, 0, 1)
        setDraftCrop((c) => {
          const next = { ...c }
          if (corner === "tl" || corner === "bl") next.left = Math.min(fx, 1 - c.right - MIN_CROP_FRAC)
          if (corner === "tr" || corner === "br") next.right = Math.min(1 - fx, 1 - c.left - MIN_CROP_FRAC)
          if (corner === "tl" || corner === "tr") next.top = Math.min(fy, 1 - c.bottom - MIN_CROP_FRAC)
          if (corner === "bl" || corner === "br") next.bottom = Math.min(1 - fy, 1 - c.top - MIN_CROP_FRAC)
          next.left = clamp(next.left, 0, 1); next.right = clamp(next.right, 0, 1)
          next.top = clamp(next.top, 0, 1); next.bottom = clamp(next.bottom, 0, 1)
          draftCropRef.current = next
          return next
        })
      }
      const onUp = () => {
        window.removeEventListener("pointermove", onMove)
        window.removeEventListener("pointerup", onUp)
        // Auto-save the adjusted crop.
        const c = draftCropRef.current
        updateAttributes({ crop: cropIsEmpty(c) ? null : c })
      }
      window.addEventListener("pointermove", onMove)
      window.addEventListener("pointerup", onUp)
    },
    [updateAttributes],
  )

  // ── Leave crop mode on Escape or a click outside the image ──
  useEffect(() => {
    if (!cropMode) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      e.preventDefault()
      setCropMode(false)
      // Drop the typing caret into the text just after the image (a real,
      // adjacent text position) and focus the editor. Done on the next frame so
      // it runs after the crop UI has unmounted, otherwise focus doesn't stick.
      if (typeof getPos === "function") {
        const pos = getPos()
        if (pos != null) {
          const target = pos + node.nodeSize
          requestAnimationFrame(() => editor.chain().setTextSelection(target).focus().run())
        }
      }
    }
    const onDocDown = (e: PointerEvent) => {
      const wrapper = cropStageRef.current?.closest(".tw-image")
      if (wrapper && !wrapper.contains(e.target as Node)) setCropMode(false)
    }
    window.addEventListener("keydown", onKey, true)
    document.addEventListener("pointerdown", onDocDown, true)
    return () => {
      window.removeEventListener("keydown", onKey, true)
      document.removeEventListener("pointerdown", onDocDown, true)
    }
  }, [cropMode, editor, getPos, node])

  // ── Geometry ──
  const fullH = naturalAspect != null ? width * naturalAspect : undefined
  const frameW = hasCrop ? width * visW : width
  const frameH = fullH != null ? (hasCrop ? fullH * visH : fullH) : undefined

  const posX = livePos ? livePos.x : x
  const posY = livePos ? livePos.y : y
  // pointer-events:none when passive (Drafting) so clicks fall through to the
  // text behind the floating image instead of selecting it.
  const wrapperStyle: CSSProperties = { position: "absolute", left: posX, top: posY, margin: 0, zIndex: 5, pointerEvents: interactive ? undefined : "none" }

  const renderImage = () => {
    if (!hasCrop || fullH == null) {
      return (
        <img
          className="tw-image__img"
          src={src}
          alt={alt ?? ""}
          title={title}
          style={{ width, height: "auto", display: "block" }}
          draggable={false}
          onPointerDown={onImagePointerDown}
          onDoubleClick={enterCrop}
          onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
        />
      )
    }
    return (
      <div
        className="tw-image__cropframe"
        style={{ width: frameW, height: frameH, overflow: "hidden", position: "relative" }}
        onPointerDown={onImagePointerDown}
        onDoubleClick={enterCrop}
      >
        <img
          className="tw-image__img"
          src={src}
          alt={alt ?? ""}
          title={title}
          style={{ width, height: fullH, position: "absolute", left: -(crop.left * width), top: -(crop.top * fullH), maxWidth: "none" }}
          draggable={false}
          onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
        />
      </div>
    )
  }

  const renderCropMode = () => {
    const fh = fullH ?? width
    const top = draftCrop.top * fh
    const left = draftCrop.left * width
    const right = draftCrop.right * width
    const bottom = draftCrop.bottom * fh
    const winW = width - left - right
    const winH = fh - top - bottom
    return (
      <div className="tw-image__cropstage" style={{ width, height: fh, position: "relative" }} ref={cropStageRef}>
        <img className="tw-image__cropimg" src={src} alt={alt ?? ""} style={{ width, height: fh, display: "block", opacity: 0.45 }} draggable={false} />
        <div className="tw-image__cropwindow" style={{ position: "absolute", left, top, width: winW, height: winH, overflow: "hidden" }}>
          <img src={src} alt="" style={{ width, height: fh, position: "absolute", left: -left, top: -top, maxWidth: "none" }} draggable={false} />
        </div>
        {(["tl", "tr", "bl", "br"] as const).map((corner) => {
          const cx = corner === "tl" || corner === "bl" ? left : left + winW
          const cy = corner === "tl" || corner === "tr" ? top : top + winH
          return (
            <span
              key={corner}
              className={`tw-image__crophandle tw-image__crophandle--${corner}`}
              style={{ position: "absolute", left: cx, top: cy }}
              onPointerDown={onCropCornerDown(corner)}
            />
          )
        })}
      </div>
    )
  }

  return (
    <NodeViewWrapper
      as="div"
      className={`tw-image${selected && interactive ? " tw-image--selected" : ""}${cropMode ? " tw-image--cropping" : ""}`}
      style={wrapperStyle}
    >
      {cropMode ? (
        renderCropMode()
      ) : (
        <div className="tw-image__holder">
          {renderImage()}
          {selected && interactive ? (
            <span
              className="tw-image__handle"
              onPointerDown={onResizeDown}
              onMouseDown={(e) => e.preventDefault()}
              draggable={false}
              aria-hidden="true"
            />
          ) : null}
        </div>
      )}
    </NodeViewWrapper>
  )
}
