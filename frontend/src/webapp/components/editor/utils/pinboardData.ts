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

/** Human-readable text of a serialized board (text boxes, link labels, file
 *  names), space-joined — or `null` if `raw` is not a pinboard document.
 *
 *  Used for word/character counting. Counting the raw serialized board would
 *  treat every JSON key, node id, and coordinate as a "word" — and because a
 *  freehand drawing is stored as a text node holding a `[drawing:...]` array
 *  of point coordinates, each stroke would inflate the count by dozens of
 *  bogus numeric "words". Drawing nodes are therefore excluded here. */
export function pinboardPlainText(raw: string): string | null {
  if (!raw) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !Array.isArray((parsed as PinboardData).nodes) ||
    (parsed as PinboardData).viewport === undefined
  ) {
    return null
  }

  const parts: string[] = []
  for (const node of (parsed as PinboardData).nodes) {
    if (node.type === "text") {
      if (typeof node.content === "string" && !node.content.startsWith("[drawing:")) {
        parts.push(node.content)
      }
    } else if (node.type === "link") {
      if (node.label) parts.push(node.label)
    } else if (node.type === "file") {
      if (node.fileName) parts.push(node.fileName)
    }
  }
  return parts.join(" ")
}

/** A normalized "meaningful state" string for a serialized board, used to
 *  detect real changes for presentation autosave/versioning.
 *
 *  Two differences from the raw content:
 *   • `viewport` (pan/zoom) is excluded — panning or zooming must NOT count as
 *     a change, so it can't mint autosave versions.
 *   • node box coordinates are rounded to integers — sub-pixel drag jitter
 *     doesn't register as a change.
 *
 *  Returns the raw string unchanged when `raw` is not a pinboard document, so
 *  callers can use it as a generic content signature regardless of kind. */
export function boardSignature(raw: string): string {
  if (!raw) return ""
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return raw
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !Array.isArray((parsed as PinboardData).nodes) ||
    (parsed as PinboardData).viewport === undefined
  ) {
    return raw
  }

  const board = parsed as PinboardData
  const nodes = board.nodes.map((node) => ({
    ...node,
    x: Math.round(node.x),
    y: Math.round(node.y),
    width: Math.round(node.width),
    height: Math.round(node.height),
  }))
  // `viewport` is deliberately omitted from the signature.
  return JSON.stringify({ nodes, lines: board.lines })
}
