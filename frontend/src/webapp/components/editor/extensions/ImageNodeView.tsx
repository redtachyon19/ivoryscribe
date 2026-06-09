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
import type { ImageShape, ImageCropSession } from "./resizableImage"

type CropRect = { top: number; right: number; bottom: number; left: number }
type Corner = "tl" | "tr" | "bl" | "br"
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

/** square & circle crop to a 1:1 box; every other shape stretches freely. */
function shapeLocksAspect(shape: ImageShape | null) {
  return shape === "square" || shape === "circle"
}

// Smooth heart, defined once as an SVG clipPath in objectBoundingBox (0..1)
// units so it scales to whatever crop box it's applied to. clip-path polygons
// can only draw straight edges, hence the bezier path.
const HEART_CLIP_ID = "tw-heart-clip"
const HEART_PATH =
  "M0.5 0.28 C 0.43 0.06 0.09 0.04 0.03 0.30 C 0 0.46 0.14 0.62 0.5 0.94 C 0.86 0.62 1 0.46 0.97 0.30 C 0.91 0.04 0.57 0.06 0.5 0.28 Z"

/** CSS clip-path that masks the crop box to the chosen shape, or undefined for
 *  a plain rectangle ("square" is just an aspect-locked rect, so no clip). */
function clipPathForShape(shape: ImageShape | null): string | undefined {
  switch (shape) {
    case "circle":
    case "ellipse":  return "ellipse(50% 50% at 50% 50%)"
    case "triangle": return "polygon(50% 0%, 100% 100%, 0% 100%)"
    case "pentagon": return "polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)"
    case "hexagon":  return "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)"
    case "astroid":  return "polygon(50% 0%, 61% 39%, 100% 50%, 61% 61%, 50% 100%, 39% 61%, 0% 50%, 39% 39%)"
    case "rightTriangle": return "polygon(0% 0%, 0% 100%, 100% 100%)"
    // Smooth bezier heart — a polygon can't curve, so it references an SVG
    // clipPath (objectBoundingBox units, so it scales with the box). The defs
    // are rendered alongside the image (see HEART_CLIP_ID).
    case "heart":    return `url(#${HEART_CLIP_ID})`
    case "squircle": return "inset(0% round 28%)"
    default:         return undefined
  }
}

/** Shrink a crop window to the largest centred square that fits inside it
 *  (used when switching to a 1:1 shape). W/H are the displayed full-image px. */
function squareifyCentered(c: CropRect, W: number, H: number): CropRect {
  const L = c.left * W, R = (1 - c.right) * W, T = c.top * H, B = (1 - c.bottom) * H
  const s = Math.min(R - L, B - T)
  const cx = (L + R) / 2, cy = (T + B) / 2
  return {
    left: clamp((cx - s / 2) / W, 0, 1),
    right: clamp(1 - (cx + s / 2) / W, 0, 1),
    top: clamp((cy - s / 2) / H, 0, 1),
    bottom: clamp(1 - (cy + s / 2) / H, 0, 1),
  }
}

/** Re-square a crop being dragged from `corner`, anchored at the opposite
 *  corner, so the window stays 1:1 in displayed px. */
function squareifyDrag(next: CropRect, corner: Corner, W: number, H: number): CropRect {
  const L = next.left * W, R = (1 - next.right) * W, T = next.top * H, B = (1 - next.bottom) * H
  let s = Math.max(R - L, B - T)
  if (corner === "br") s = Math.min(s, W - L, H - T)
  else if (corner === "tl") s = Math.min(s, R, B)
  else if (corner === "tr") s = Math.min(s, W - L, B)
  else s = Math.min(s, R, H - T) // bl
  s = Math.max(s, MIN_CROP_FRAC * Math.min(W, H))
  let nL = L, nR = R, nT = T, nB = B
  if (corner === "br") { nR = L + s; nB = T + s }
  else if (corner === "tl") { nL = R - s; nT = B - s }
  else if (corner === "tr") { nR = L + s; nT = B - s }
  else { nL = R - s; nB = T + s } // bl
  return {
    left: clamp(nL / W, 0, 1),
    right: clamp(1 - nR / W, 0, 1),
    top: clamp(nT / H, 0, 1),
    bottom: clamp(1 - nB / H, 0, 1),
  }
}

export function ImageNodeView(props: ReactNodeViewProps) {
  const { node, updateAttributes, selected, editor, getPos, extension } = props
  const { src, alt, title } = node.attrs as { src: string; alt?: string; title?: string }
  const x = (node.attrs.x as number) ?? 0
  const y = (node.attrs.y as number) ?? 0
  const crop: CropRect = (node.attrs.crop as CropRect | null) ?? NO_CROP
  const shape = (node.attrs.shape as ImageShape | null) ?? null
  const widthAttr = node.attrs.width as number | null
  const clipPath = clipPathForShape(shape)

  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)
  const [liveWidth, setLiveWidth] = useState<number | null>(null)
  const [livePos, setLivePos] = useState<{ x: number; y: number } | null>(null)
  const [cropMode, setCropMode] = useState(false)
  const [draftCrop, setDraftCrop] = useState<CropRect>(crop)
  const draftCropRef = useRef<CropRect>(crop)

  const cropStageRef = useRef<HTMLDivElement | null>(null)

  const naturalAspect = natural ? natural.h / natural.w : null
  const width = liveWidth ?? widthAttr ?? (natural ? Math.min(natural.w, 480) : 320)
  // Displayed full-image height in px (undefined until the natural size loads).
  const fullH = naturalAspect != null ? width * naturalAspect : undefined

  const visW = 1 - crop.left - crop.right
  const visH = 1 - crop.top - crop.bottom
  const hasCrop = crop.left > 0 || crop.right > 0 || crop.top > 0 || crop.bottom > 0
  // The free-float drag / resize / crop interactions are a Typewriter
  // (page-layout) affordance. The Drafting view configures the node with
  // interactive:false, so there the image renders passive: it keeps its
  // position but lets pointer events fall through to the reflowed text behind
  // it, instead of grabbing a node selection on every stray click.
  const interactive = editor.isEditable && ((extension.options?.interactive as boolean | undefined) ?? true)

  // In the passive (Drafting) view the image is positioned RELATIVE TO THE
  // TEXT: it renders inline at its place in the document, flowing with the
  // paragraphs, instead of being pinned to the Typewriter's page (x,y) pixels.
  // Those pixels are a page-layout coordinate; once the text reflows into the
  // narrower draft column they no longer line up and the image lands on top of
  // unrelated paragraphs. Flowing inline keeps it anchored to the text around
  // it (e.g. the gap between two paragraphs where it was inserted).

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
  // Save the dragged crop AND shift the node's (x,y) by how far the crop's
  // top-left moved, so the cropped result stays where the crop window was
  // instead of snapping back to the node origin. `startCrop` is the crop at the
  // start of this drag.
  const commitCrop = useCallback(
    (startCrop: CropRect) => {
      const c = draftCropRef.current
      const dx = (c.left - startCrop.left) * width
      const dy = (c.top - startCrop.top) * (fullH ?? width)
      updateAttributes({
        crop: cropIsEmpty(c) ? null : c,
        x: Math.round(x + dx),
        y: Math.round(y + dy),
      })
    },
    [updateAttributes, width, fullH, x, y],
  )

  const lockAspect = shapeLocksAspect(shape)
  const onCropCornerDown = useCallback(
    (corner: Corner) => (event: ReactPointerEvent) => {
      event.preventDefault()
      event.stopPropagation()
      const frame = cropStageRef.current
      if (!frame) return
      const rect = frame.getBoundingClientRect()
      const startCrop = draftCropRef.current
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
          // Keep the window square for 1:1 shapes (square / circle).
          const squared = lockAspect && fullH != null ? squareifyDrag(next, corner, width, fullH) : next
          draftCropRef.current = squared
          return squared
        })
      }
      const onUp = () => {
        window.removeEventListener("pointermove", onMove)
        window.removeEventListener("pointerup", onUp)
        commitCrop(startCrop)
      }
      window.addEventListener("pointermove", onMove)
      window.addEventListener("pointerup", onUp)
    },
    [commitCrop, lockAspect, width, fullH],
  )

  // ── Pan the crop window over the image (drag the window itself, not a
  //    corner). Keeps the crop size fixed and slides which part of the image
  //    is framed — clamped so the window stays on the image. ──
  const onCropWindowDown = useCallback(
    (event: ReactPointerEvent) => {
      event.preventDefault()
      event.stopPropagation()
      const frame = cropStageRef.current
      if (!frame) return
      const rect = frame.getBoundingClientRect()
      const start = draftCropRef.current
      const w = 1 - start.left - start.right // window size as fractions (held constant)
      const h = 1 - start.top - start.bottom
      const startClientX = event.clientX
      const startClientY = event.clientY
      const onMove = (e: PointerEvent) => {
        const dfx = (e.clientX - startClientX) / rect.width
        const dfy = (e.clientY - startClientY) / rect.height
        const left = clamp(start.left + dfx, 0, 1 - w)
        const top = clamp(start.top + dfy, 0, 1 - h)
        const next = { left, top, right: 1 - left - w, bottom: 1 - top - h }
        draftCropRef.current = next
        setDraftCrop(next)
      }
      const onUp = () => {
        window.removeEventListener("pointermove", onMove)
        window.removeEventListener("pointerup", onUp)
        commitCrop(start)
      }
      window.addEventListener("pointermove", onMove)
      window.addEventListener("pointerup", onUp)
    },
    [commitCrop],
  )

  // ── Pick a crop shape (from the crop toolbar). Toggling the active shape
  //    clears it. Switching to a 1:1 shape snaps the window to a centred
  //    square so circles read as circles immediately. ──
  const applyShape = useCallback(
    (next: ImageShape) => {
      const nextShape = next === shape ? null : next
      if (shapeLocksAspect(nextShape) && fullH != null) {
        const startCrop = draftCropRef.current
        const sq = squareifyCentered(startCrop, width, fullH)
        setDraftCrop(sq)
        draftCropRef.current = sq
        // Same position compensation as commitCrop, so the snapped square stays
        // centred where the window was instead of jumping to the node origin.
        const dx = (sq.left - startCrop.left) * width
        const dy = (sq.top - startCrop.top) * fullH
        updateAttributes({
          shape: nextShape,
          crop: cropIsEmpty(sq) ? null : sq,
          x: Math.round(x + dx),
          y: Math.round(y + dy),
        })
      } else {
        updateAttributes({ shape: nextShape })
      }
    },
    [shape, width, fullH, x, y, updateAttributes],
  )

  // ── Publish the crop session so TypewriterEditor can swap the formatting
  //    toolbar for shape controls while this image is being cropped. ──
  useEffect(() => {
    const storage = extension.storage as { cropSession: ImageCropSession }
    if (!storage) return
    const dom = (() => { try { return editor.view.dom } catch { return null } })()
    const notify = () => dom?.dispatchEvent(new CustomEvent("tw-image-crop", { bubbles: true }))
    if (cropMode && interactive) {
      storage.cropSession = { shape, setShape: applyShape }
      notify()
      return () => { storage.cropSession = null; notify() }
    }
    return undefined
  }, [cropMode, interactive, shape, applyShape, editor, extension])

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
      const target = e.target as Element | null
      // The crop shape toolbar lives in the editor chrome, outside the image
      // wrapper — clicking a shape there must not count as "clicking outside".
      if (target?.closest?.(".tw-toolbar")) return
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
  const frameW = hasCrop ? width * visW : width
  const frameH = fullH != null ? (hasCrop ? fullH * visH : fullH) : undefined

  const posX = livePos ? livePos.x : x
  const posY = livePos ? livePos.y : y
  // In crop mode the stage shows the FULL image, but the cropped content sits
  // at (x,y). Shift the stage up/left by the crop's top-left offset so the crop
  // window lines up exactly with where the cropped image is — otherwise the
  // result would jump to the node origin on commit. Uses the committed crop
  // (not the draft), so it stays fixed while the window is dragged within it.
  const cropStageFh = fullH ?? width
  const cropOffX = cropMode ? crop.left * width : 0
  const cropOffY = cropMode ? crop.top * cropStageFh : 0
  // Typewriter floats the image at its page (x,y); Drafting flows it inline at
  // its document position. pointer-events:none in the passive (Drafting) view
  // keeps it non-interactive — it can't be dragged, resized, or selected there.
  const wrapperStyle: CSSProperties = interactive
    ? { position: "absolute", left: posX - cropOffX, top: posY - cropOffY, margin: 0, zIndex: 5 }
    : { position: "relative", margin: "0.6em 0", pointerEvents: "none" }

  const renderImage = () => {
    if (!hasCrop || fullH == null) {
      return (
        <img
          className="tw-image__img"
          src={src}
          alt={alt ?? ""}
          title={title}
          style={{ width, height: "auto", display: "block", clipPath }}
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
        style={{ width: frameW, height: frameH, overflow: "hidden", position: "relative", clipPath }}
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
        <div
          className="tw-image__cropwindow"
          onPointerDown={onCropWindowDown}
          style={{
            position: "absolute", left, top, width: winW, height: winH, overflow: "hidden", cursor: "move",
            // For a shaped crop the clip-path is the boundary, so drop the
            // rectangular ring and give the shape a faint white edge instead.
            ...(clipPath ? { clipPath, boxShadow: "none", borderRadius: 0, filter: "drop-shadow(0 0 1px rgba(255,255,255,0.85))" } : null),
          }}
        >
          <img src={src} alt="" style={{ width, height: fh, position: "absolute", left: -left, top: -top, maxWidth: "none" }} draggable={false} />
        </div>
        {(["tl", "tr", "bl", "br"] as const).map((corner) => {
          const isLeft = corner === "tl" || corner === "bl"
          const isTop = corner === "tl" || corner === "tr"
          const cx = isLeft ? left : left + winW
          const cy = isTop ? top : top + winH
          // Bias the handle one border-width (2.5px) toward the crop window
          // interior so it straddles its corner exactly like the bottom-right
          // resize grip, whose right/bottom:-7px sits 2.5px inside the edge.
          const hx = cx + (isLeft ? 2.5 : -2.5)
          const hy = cy + (isTop ? 2.5 : -2.5)
          return (
            <span
              key={corner}
              className={`tw-image__crophandle tw-image__crophandle--${corner}`}
              style={{ position: "absolute", left: hx, top: hy }}
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
      {shape === "heart" ? (
        // Hidden defs for the heart clip-path. Duplicate ids across multiple
        // hearts are harmless — url(#id) resolves to the first, and they're
        // identical.
        <svg width="0" height="0" aria-hidden="true" style={{ position: "absolute" }} focusable="false">
          <defs>
            <clipPath id={HEART_CLIP_ID} clipPathUnits="objectBoundingBox">
              <path d={HEART_PATH} />
            </clipPath>
          </defs>
        </svg>
      ) : null}
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
