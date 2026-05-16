// Pinboard board format — types, defaults, and JSON serialization.
//
// Each pinboard document is a JSON blob containing nodes (text / image / link
// / file boxes positioned on an infinite canvas), lines (connectors between
// nodes), and a viewport (pan + zoom). Drawings are stored as text nodes with
// a `[drawing:<json>]` content prefix so the document format stays small and
// every node renders through the same path.

export type PinboardNodeBase = {
  id: string
  x: number
  y: number
  width: number
  height: number
}

export type TextNode = PinboardNodeBase & { type: "text"; content: string }
export type ImageNode = PinboardNodeBase & { type: "image"; src: string }
export type LinkNode = PinboardNodeBase & { type: "link"; url: string; label: string }
export type FileNode = PinboardNodeBase & { type: "file"; fileName: string }

export type PinboardNode = TextNode | ImageNode | LinkNode | FileNode

export type PinboardLine = {
  id: string
  fromId: string
  toId: string
  color: string
}

export type PinboardViewport = { x: number; y: number; zoom: number }

export type PinboardData = {
  nodes: PinboardNode[]
  lines: PinboardLine[]
  viewport: PinboardViewport
}

export type PinboardTool = "select" | "text" | "line" | "draw" | "marquee"

export const EMPTY_BOARD: PinboardData = {
  nodes: [],
  lines: [],
  viewport: { x: 0, y: 0, zoom: 1 },
}

export function createNodeId() {
  return crypto.randomUUID()
}

export function parseBoardData(raw: string): PinboardData {
  if (!raw || raw === "<p></p>") return { ...EMPTY_BOARD }
  try {
    const parsed = JSON.parse(raw) as PinboardData
    return {
      nodes: Array.isArray(parsed.nodes) ? parsed.nodes : [],
      lines: Array.isArray(parsed.lines) ? parsed.lines : [],
      viewport: parsed.viewport ?? { x: 0, y: 0, zoom: 1 },
    }
  } catch {
    return { ...EMPTY_BOARD }
  }
}

export function serializeBoardData(data: PinboardData): string {
  return JSON.stringify(data)
}

export function nodeCenter(node: PinboardNode) {
  return { cx: node.x + node.width / 2, cy: node.y + node.height / 2 }
}

/** Drawings are encoded as `text` nodes whose content starts with `[drawing:`
 *  followed by a JSON array of `{x, y}` points relative to the node origin.
 *  Returns the parsed points if `node` is a drawing, or null otherwise. */
export function tryParseDrawingPoints(node: PinboardNode): Array<{ x: number; y: number }> | null {
  if (node.type !== "text" || !node.content.startsWith("[drawing:")) return null
  try {
    return JSON.parse(node.content.slice(9, -1)) as Array<{ x: number; y: number }>
  } catch {
    return null
  }
}
