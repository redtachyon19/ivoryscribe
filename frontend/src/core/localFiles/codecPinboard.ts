// Codec for .tuskb (pinboard) files.
//
// Schema:
//
// <?xml version="1.0" encoding="UTF-8"?>
// <tuskb version="1" id="..." cloud-id="" created="..." color="...">
//   <name>My Board</name>
//   <viewport x="0" y="0" zoom="1"/>
//   <nodes>
//     <node id="n1" type="text" x="100" y="100" width="200" height="80">
//       <content><![CDATA[Some text]]></content>
//     </node>
//     <node id="n2" type="image" x="300" y="200" width="240" height="180">
//       <src><![CDATA[data:image/png;base64,...]]></src>
//     </node>
//     <node id="n3" type="link" x="500" y="100" width="200" height="60">
//       <url><![CDATA[https://...]]></url>
//       <label><![CDATA[Site]]></label>
//     </node>
//     <node id="n4" type="file" x="200" y="400" width="160" height="60">
//       <file-name><![CDATA[doc.pdf]]></file-name>
//     </node>
//   </nodes>
//   <lines>
//     <line id="l1" from="n1" to="n2" color="#000000"/>
//   </lines>
// </tuskb>

import { XMLParser } from "fast-xml-parser"
import { FILE_FORMAT_VERSION, type TuskPinboardFile, type TuskPinboardLine, type TuskPinboardNode } from "./types"
import { emitAttrs, emitCData, escapeText, indent, XML_PROLOG } from "./xmlPrimitives"

function emitNode(node: TuskPinboardNode, depth: number): string {
  const baseAttrs = {
    id: node.id,
    type: node.type,
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
  }
  const open = `${indent(depth)}<node${emitAttrs(baseAttrs)}>\n`
  let body = ""
  switch (node.type) {
    case "text":
      body = `${indent(depth + 1)}<content>${emitCData(node.content)}</content>\n`
      break
    case "image":
      body = `${indent(depth + 1)}<src>${emitCData(node.src)}</src>\n`
      break
    case "link":
      body =
        `${indent(depth + 1)}<url>${emitCData(node.url)}</url>\n` +
        `${indent(depth + 1)}<label>${emitCData(node.label)}</label>\n`
      break
    case "file":
      body = `${indent(depth + 1)}<file-name>${emitCData(node.fileName)}</file-name>\n`
      break
  }
  return `${open}${body}${indent(depth)}</node>\n`
}

function emitLine(line: TuskPinboardLine, depth: number): string {
  return `${indent(depth)}<line${emitAttrs({
    id: line.id,
    from: line.fromId,
    to: line.toId,
    color: line.color,
  })}/>\n`
}

export function serializeTuskPinboard(file: TuskPinboardFile): string {
  const head = `<tuskb${emitAttrs({
    version: file.version,
    id: file.id,
    "cloud-id": file.cloudId ?? "",
    created: file.created,
    color: file.color,
  })}>\n`

  const meta = `${indent(1)}<name>${escapeText(file.name)}</name>\n`

  const viewport = `${indent(1)}<viewport${emitAttrs({
    x: file.viewport.x,
    y: file.viewport.y,
    zoom: file.viewport.zoom,
  })}/>\n`

  const nodesOpen = `${indent(1)}<nodes>\n`
  const nodesBody = file.nodes.map((n) => emitNode(n, 2)).join("")
  const nodesClose = `${indent(1)}</nodes>\n`

  const linesOpen = `${indent(1)}<lines>\n`
  const linesBody = file.lines.map((l) => emitLine(l, 2)).join("")
  const linesClose = `${indent(1)}</lines>\n`

  return `${XML_PROLOG}${head}${meta}${viewport}${nodesOpen}${nodesBody}${nodesClose}${linesOpen}${linesBody}${linesClose}</tuskb>\n`
}

// ── Parsing ────────────────────────────────────────────────────────────────

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  cdataPropName: "__cdata",
  parseAttributeValue: false,
  trimValues: false,
  textNodeName: "#text",
  isArray: (name) => name === "node" || name === "line",
})

type RawAttrs = Record<string, string | undefined>
type RawNode = {
  __cdata?: string | string[]
  "#text"?: string
  [key: string]: unknown
}

function readAttr(node: RawNode, key: string): string | undefined {
  const value = (node as unknown as RawAttrs)[`@_${key}`]
  return typeof value === "string" ? value : undefined
}

function readText(node: RawNode | undefined | null): string {
  if (!node) return ""
  if (typeof node === "string") return node
  if (Array.isArray((node as RawNode).__cdata)) return ((node as RawNode).__cdata as string[]).join("")
  if (typeof (node as RawNode).__cdata === "string") return (node as RawNode).__cdata as string
  if (typeof (node as RawNode)["#text"] === "string") return (node as RawNode)["#text"] as string
  return ""
}

function readNumberAttr(node: RawNode, key: string, fallback: number): number {
  const raw = readAttr(node, key)
  if (raw === undefined) return fallback
  const n = Number.parseFloat(raw)
  return Number.isFinite(n) ? n : fallback
}

function parseNode(rawNode: RawNode): TuskPinboardNode | null {
  const id = readAttr(rawNode, "id")
  const type = readAttr(rawNode, "type")
  if (!id || !type) return null

  const base = {
    id,
    x: readNumberAttr(rawNode, "x", 0),
    y: readNumberAttr(rawNode, "y", 0),
    width: readNumberAttr(rawNode, "width", 200),
    height: readNumberAttr(rawNode, "height", 80),
  }

  switch (type) {
    case "text":
      return { ...base, type: "text", content: readText(rawNode.content as RawNode | undefined) }
    case "image":
      return { ...base, type: "image", src: readText(rawNode.src as RawNode | undefined) }
    case "link":
      return {
        ...base,
        type: "link",
        url: readText(rawNode.url as RawNode | undefined),
        label: readText(rawNode.label as RawNode | undefined),
      }
    case "file":
      return {
        ...base,
        type: "file",
        fileName: readText(rawNode["file-name"] as RawNode | undefined),
      }
    default:
      return null
  }
}

function parseLine(rawLine: RawNode): TuskPinboardLine | null {
  const id = readAttr(rawLine, "id")
  const fromId = readAttr(rawLine, "from")
  const toId = readAttr(rawLine, "to")
  if (!id || !fromId || !toId) return null
  return {
    id,
    fromId,
    toId,
    color: readAttr(rawLine, "color") ?? "#000000",
  }
}

export function parseTuskPinboard(xml: string): TuskPinboardFile {
  const parsed = parser.parse(xml) as { tuskb?: RawNode }
  const root = parsed.tuskb
  if (!root) throw new Error("Invalid .tuskb file: missing <tuskb> root element")

  const versionRaw = readAttr(root, "version")
  const version = versionRaw ? Number.parseInt(versionRaw, 10) : FILE_FORMAT_VERSION
  const id = readAttr(root, "id") ?? crypto.randomUUID()
  const cloudId = readAttr(root, "cloud-id") || null
  const created = readAttr(root, "created") ?? new Date().toISOString()
  const color = readAttr(root, "color") ?? "#10b981"
  const name = readText(root.name as RawNode | undefined) || "Untitled Pinboard"

  const viewportNode = (root.viewport as RawNode | undefined) ?? {}
  const viewport = {
    x: readNumberAttr(viewportNode, "x", 0),
    y: readNumberAttr(viewportNode, "y", 0),
    zoom: readNumberAttr(viewportNode, "zoom", 1),
  }

  const nodesHolder = root.nodes as RawNode | undefined
  const nodeArray = nodesHolder && Array.isArray(nodesHolder.node) ? (nodesHolder.node as RawNode[]) : []
  const nodes = nodeArray.map(parseNode).filter((n): n is TuskPinboardNode => n !== null)

  const linesHolder = root.lines as RawNode | undefined
  const lineArray = linesHolder && Array.isArray(linesHolder.line) ? (linesHolder.line as RawNode[]) : []
  const lines = lineArray.map(parseLine).filter((l): l is TuskPinboardLine => l !== null)

  return { version, id, cloudId, created, name, color, viewport, nodes, lines }
}
