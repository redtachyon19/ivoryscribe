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

export function tryParseDrawingPoints(node: PinboardNode): Array<{ x: number; y: number }> | null {
  if (node.type !== "text" || !node.content.startsWith("[drawing:")) return null
  try {
    return JSON.parse(node.content.slice(9, -1)) as Array<{ x: number; y: number }>
  } catch {
    return null
  }
}

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
  return JSON.stringify({ nodes, lines: board.lines })
}
