// Shape picker shown in place of the formatting toolbar while an image is in
// crop mode (see ImageNodeView crop session + TypewriterEditor). Each button
// applies a mask shape to the cropping image; "square" and "circle" also lock
// the crop to a 1:1 box. Reuses the .tw-toolbar chrome so it shares the same
// look, drag grip, and remembered position as TypewriterToolbar.

import { type ReactNode, type CSSProperties, type RefObject } from "react"
import {
  GripVertical,
  Square, Circle, Egg, Pentagon, Hexagon, Sparkle,
  Triangle, TriangleRight, Heart, Squircle,
} from "lucide-react"
import type { ImageShape } from "../extensions/resizableImage"

const ICON = { size: 16, strokeWidth: 2 } as const

// All lucide. A few shapes have no exact lucide name, so use the closest:
// Egg (only oval) for ellipse, Sparkle (4-point star) for astroid,
// TriangleRight for the right triangle.
const SHAPE_ICONS: Record<ImageShape, ReactNode> = {
  square:        <Square {...ICON} />,
  circle:        <Circle {...ICON} />,
  ellipse:       <Egg {...ICON} />,
  pentagon:      <Pentagon {...ICON} />,
  hexagon:       <Hexagon {...ICON} />,
  astroid:       <Sparkle {...ICON} />,
  triangle:      <Triangle {...ICON} />,
  rightTriangle: <TriangleRight {...ICON} />,
  heart:         <Heart {...ICON} />,
  squircle:      <Squircle {...ICON} />,
}

const SHAPE_LABELS: Record<ImageShape, string> = {
  square: "Square (1:1)",
  circle: "Circle (1:1)",
  ellipse: "Ellipse",
  pentagon: "Pentagon",
  hexagon: "Hexagon",
  astroid: "Astroid",
  triangle: "Triangle",
  rightTriangle: "Right triangle",
  heart: "Heart",
  squircle: "Squircle",
}

// Order requested by the design.
const SHAPES: ImageShape[] = [
  "square", "circle", "ellipse", "pentagon", "hexagon", "astroid",
  "triangle", "rightTriangle", "heart", "squircle",
]

type CropToolbarProps = {
  shape: ImageShape | null
  onSelectShape: (shape: ImageShape) => void
  isUiTyping: boolean
  isDraggingToolbar: boolean
  toolbarRef: RefObject<HTMLDivElement | null>
  toolbarPos: { x: number; y: number } | null
  onGripMouseDown: (event: React.MouseEvent) => void
}

export function CropToolbar({
  shape,
  onSelectShape,
  isUiTyping,
  isDraggingToolbar,
  toolbarRef,
  toolbarPos,
  onGripMouseDown,
}: CropToolbarProps) {
  return (
    <div
      ref={toolbarRef}
      className={`tw-toolbar${isDraggingToolbar ? " tw-toolbar--dragging" : ""}${isUiTyping ? " tw-toolbar--typing" : ""}`}
      style={
        toolbarPos
          ? ({ left: toolbarPos.x, top: toolbarPos.y, bottom: "auto", transform: "none" } as CSSProperties)
          : undefined
      }
      role="toolbar"
      aria-label="Crop shape"
    >
      <div
        className="tw-toolbar__grip"
        onMouseDown={onGripMouseDown}
        title="Drag to reposition"
        aria-hidden="true"
      >
        <GripVertical size={14} />
      </div>

      {SHAPES.map((s) => (
        <button
          key={s}
          type="button"
          className={`tw-toolbar__btn${shape === s ? " tw-toolbar__btn--active" : ""}`}
          // mousedown + preventDefault so clicking a shape doesn't blur the
          // editor / drop the image's node selection mid-crop.
          onMouseDown={(e) => { e.preventDefault(); onSelectShape(s) }}
          title={SHAPE_LABELS[s]}
          aria-label={SHAPE_LABELS[s]}
          aria-pressed={shape === s}
        >
          {SHAPE_ICONS[s]}
        </button>
      ))}
    </div>
  )
}
