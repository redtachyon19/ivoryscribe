// Free-floating, resizable, croppable image node for the prose editors.
//
// Every image is absolutely positioned ("placed anywhere on the page") and can
// be cropped. There is no text wrap and no in-flow/alignment mode.
//
// Stored as data URLs (base64) in the document HTML — the same convention the
// Pinboard editor uses — so they round-trip through the .tusk codec with no
// extra asset infrastructure, in both the web and Electron builds.
//
// Lives in the SHARED prose schema (sharedProseExtensions.ts) so both the
// Drafting and Typewriter views understand the node.
//
// Attributes (all round-trip via HTML attributes / inline style):
//   • width — display width in px (style width)
//   • x, y  — position in layout px from the editor content's top-left
//             (data-x / data-y)
//   • crop  — { top,right,bottom,left } fractions (data-crop="t,r,b,l"), or null
//
// Interaction (drag-anywhere, resize, crop tool) lives in ImageNodeView.tsx.

import { Node, mergeAttributes } from "@tiptap/core"
import { ReactNodeViewRenderer } from "@tiptap/react"
import { Plugin } from "@tiptap/pm/state"
import { ImageNodeView } from "./ImageNodeView"
import "./resizableImage.css"

export type ImageCrop = { top: number; right: number; bottom: number; left: number }

/** Mask shapes the crop tool can apply. "square" and "circle" lock the crop to
 *  a 1:1 box; the rest stretch freely with the crop window. */
export type ImageShape =
  | "square"
  | "circle"
  | "ellipse"
  | "pentagon"
  | "hexagon"
  | "astroid"
  | "triangle"
  | "rightTriangle"
  | "heart"
  | "squircle"

export const IMAGE_SHAPES: ImageShape[] = [
  "square", "circle", "ellipse", "pentagon", "hexagon", "astroid", "triangle",
  "rightTriangle", "heart", "squircle",
]

/** Ephemeral handoff from the cropping image's node view to the editor chrome
 *  (TypewriterEditor), so the formatting toolbar can swap in shape controls
 *  while an image is in crop mode. Lives on the node's editor storage. */
export type ImageCropSession = {
  shape: ImageShape | null
  setShape: (shape: ImageShape) => void
} | null

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    resizableImage: {
      /** Insert a free-floating image. x/y default to the cursor position. */
      setImage: (options: { src: string; alt?: string; title?: string; width?: number | null; x?: number; y?: number }) => ReturnType
    }
  }
}

function parseCrop(value: string | null): ImageCrop | null {
  if (!value) return null
  const parts = value.split(",").map((n) => parseFloat(n))
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return null
  const [top, right, bottom, left] = parts
  if (top === 0 && right === 0 && bottom === 0 && left === 0) return null
  return { top, right, bottom, left }
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

/** Convert a screen point to layout-px coordinates within the editor content
 *  (accounting for the Typewriter's CSS `zoom`). */
function pointToContentCoords(dom: HTMLElement, clientX: number, clientY: number) {
  const rect = dom.getBoundingClientRect()
  const scale = dom.offsetWidth > 0 ? rect.width / dom.offsetWidth : 1
  return { x: Math.round((clientX - rect.left) / scale), y: Math.round((clientY - rect.top) / scale) }
}

export const ResizableImage = Node.create({
  name: "resizableImage",
  group: "block",
  atom: true,
  draggable: false, // we implement our own absolute-position pointer drag
  selectable: true,

  addOptions() {
    return {
      // When false (the Drafting view), the React node view renders the image
      // passive: it keeps its position but doesn't capture pointer events, so
      // it can't be dragged, resized, cropped, or accidentally selected. The
      // free-float interactions are a Typewriter (page-layout) affordance.
      interactive: true,
    }
  },

  addAttributes() {
    return {
      src: { default: null },
      alt: { default: null },
      title: { default: null },
      width: {
        default: null,
        parseHTML: (el: HTMLElement) => {
          const fromStyle = parseInt(el.style.width || "", 10)
          if (!Number.isNaN(fromStyle)) return fromStyle
          const fromAttr = parseInt(el.getAttribute("width") || "", 10)
          return Number.isNaN(fromAttr) ? null : fromAttr
        },
        renderHTML: (attrs: Record<string, unknown>) => {
          const w = attrs.width as number | null
          return w ? { style: `width: ${w}px` } : {}
        },
      },
      x: {
        default: 0,
        parseHTML: (el: HTMLElement) => { const v = parseFloat(el.getAttribute("data-x") || ""); return Number.isNaN(v) ? 0 : v },
        renderHTML: (attrs: Record<string, unknown>) => ({ "data-x": String(Math.round((attrs.x as number) || 0)) }),
      },
      y: {
        default: 0,
        parseHTML: (el: HTMLElement) => { const v = parseFloat(el.getAttribute("data-y") || ""); return Number.isNaN(v) ? 0 : v },
        renderHTML: (attrs: Record<string, unknown>) => ({ "data-y": String(Math.round((attrs.y as number) || 0)) }),
      },
      crop: {
        default: null,
        parseHTML: (el: HTMLElement) => parseCrop(el.getAttribute("data-crop")),
        renderHTML: (attrs: Record<string, unknown>) => {
          const c = attrs.crop as ImageCrop | null
          return c ? { "data-crop": `${c.top},${c.right},${c.bottom},${c.left}` } : {}
        },
      },
      shape: {
        default: null,
        parseHTML: (el: HTMLElement) => {
          const s = el.getAttribute("data-shape")
          return s && (IMAGE_SHAPES as string[]).includes(s) ? s : null
        },
        renderHTML: (attrs: Record<string, unknown>) => {
          const s = attrs.shape as ImageShape | null
          return s ? { "data-shape": s } : {}
        },
      },
    }
  },

  // Crop-mode handoff to the editor chrome (see ImageCropSession). One image
  // crops at a time, so a single slot is enough.
  addStorage() {
    return { cropSession: null as ImageCropSession }
  },

  parseHTML() {
    return [{ tag: "img[src]" }]
  },

  renderHTML({ HTMLAttributes }) {
    return ["img", mergeAttributes(HTMLAttributes, { class: "tw-image__img" })]
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageNodeView)
  },

  addCommands() {
    return {
      setImage:
        (options) =>
        ({ editor, commands }) => {
          let { x, y } = options
          if (x == null || y == null) {
            try {
              const c = editor.view.coordsAtPos(editor.state.selection.from)
              const p = pointToContentCoords(editor.view.dom as HTMLElement, c.left, c.top)
              x = p.x
              y = p.y
            } catch {
              x = 24
              y = 24
            }
          }
          return commands.insertContent({
            type: this.name,
            attrs: { ...options, x: Math.round(x), y: Math.round(y) },
          })
        },
    }
  },

  // Paste / drop image files → insert as data URLs at the drop/cursor point.
  addProseMirrorPlugins() {
    const editor = this.editor
    const insertFiles = (files: FileList | null, point?: { x: number; y: number }) => {
      if (!files) return false
      const images = Array.from(files).filter((f) => f.type.startsWith("image/"))
      if (images.length === 0) return false
      images.forEach(async (file) => {
        const src = await fileToDataUrl(file)
        editor.chain().focus().setImage({ src, ...(point ?? {}) }).run()
      })
      return true
    }

    return [
      new Plugin({
        props: {
          handlePaste: (_view, event) => insertFiles(event.clipboardData?.files ?? null),
          handleDrop: (view, event) => {
            const dragEvent = event as DragEvent
            const files = dragEvent.dataTransfer?.files ?? null
            if (!files || files.length === 0 || Array.from(files).every((f) => !f.type.startsWith("image/"))) {
              return false
            }
            event.preventDefault()
            const point = pointToContentCoords(view.dom as HTMLElement, dragEvent.clientX, dragEvent.clientY)
            return insertFiles(files, point)
          },
        },
      }),
    ]
  },
})
