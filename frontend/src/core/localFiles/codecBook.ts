// Codec for .tusk (book) files.
//
// Schema:
//
// <?xml version="1.0" encoding="UTF-8"?>
// <tusk version="1" id="..." cloud-id="" created="..." color="..." wallpaper-emojis="" root-position="top">
//   <name>My Book</name>
//   <active-chapter-id>...</active-chapter-id>
//   <chapters>
//     <chapter id="..." title="Chapter 1" mode="default">
//       <content><![CDATA[<p>HTML</p>]]></content>
//       <chapter id="..." title="Section" mode="markdown">
//         <content><![CDATA[# md]]></content>
//       </chapter>
//     </chapter>
//   </chapters>
// </tusk>
//
// `mode` replaces the legacy markdownIds / typewriterIds parallel arrays.

import { XMLParser } from "fast-xml-parser"
import { FILE_FORMAT_VERSION, type ChapterMode, type TuskBookFile, type TuskChapter } from "./types"
import { emitAttrs, emitCData, escapeText, indent, XML_PROLOG } from "./xmlPrimitives"

const VALID_MODES: ChapterMode[] = ["default", "markdown", "typewriter"]

function emitChapter(chapter: TuskChapter, depth: number): string {
  const open = `${indent(depth)}<chapter${emitAttrs({
    id: chapter.id,
    title: chapter.title,
    mode: chapter.mode,
  })}>\n`

  const contentLine = `${indent(depth + 1)}<content>${emitCData(chapter.content)}</content>\n`

  const childrenXml = chapter.children
    .map((child) => emitChapter(child, depth + 1))
    .join("")

  const close = `${indent(depth)}</chapter>\n`
  return `${open}${contentLine}${childrenXml}${close}`
}

export function serializeTuskBook(file: TuskBookFile): string {
  const head = `<tusk${emitAttrs({
    version: file.version,
    id: file.id,
    "cloud-id": file.cloudId ?? "",
    created: file.created,
    color: file.color,
    "wallpaper-emojis": file.wallpaperEmojis,
    "root-position": file.rootPosition,
  })}>\n`

  const meta =
    `${indent(1)}<name>${escapeText(file.name)}</name>\n` +
    `${indent(1)}<active-chapter-id>${escapeText(file.activeChapterId ?? "")}</active-chapter-id>\n`

  const chaptersOpen = `${indent(1)}<chapters>\n`
  const chaptersBody = file.chapters.map((c) => emitChapter(c, 2)).join("")
  const chaptersClose = `${indent(1)}</chapters>\n`

  return `${XML_PROLOG}${head}${meta}${chaptersOpen}${chaptersBody}${chaptersClose}</tusk>\n`
}

// ── Parsing ────────────────────────────────────────────────────────────────

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  cdataPropName: "__cdata",
  parseAttributeValue: false,
  trimValues: false,
  textNodeName: "#text",
  // <chapter> elements must always be arrays so single-child cases don't
  // collapse to a single object. Our schema uses `chapter` only inside
  // <chapters> and nested under other <chapter>, so a name-only check is safe.
  isArray: (name) => name === "chapter",
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
  if (typeof node === "number" || typeof node === "boolean") return String(node)
  if (Array.isArray(node.__cdata)) return node.__cdata.join("")
  if (typeof node.__cdata === "string") return node.__cdata
  if (typeof node["#text"] === "string") return node["#text"]
  return ""
}

function asMode(value: string | undefined): ChapterMode {
  if (value && (VALID_MODES as string[]).includes(value)) {
    return value as ChapterMode
  }
  return "default"
}

function parseChapterNode(node: RawNode): TuskChapter {
  const id = readAttr(node, "id") ?? crypto.randomUUID()
  const title = readAttr(node, "title") ?? "Untitled"
  const mode = asMode(readAttr(node, "mode"))
  const content = readText(node.content as RawNode | undefined)
  const childArray = Array.isArray(node.chapter) ? (node.chapter as RawNode[]) : []
  const children = childArray.map(parseChapterNode)

  return { id, title, mode, content, children }
}

export function parseTuskBook(xml: string): TuskBookFile {
  const parsed = parser.parse(xml) as { tusk?: RawNode }
  const root = parsed.tusk
  if (!root) {
    throw new Error("Invalid .tusk file: missing <tusk> root element")
  }

  const versionRaw = readAttr(root, "version")
  const version = versionRaw ? Number.parseInt(versionRaw, 10) : FILE_FORMAT_VERSION
  const id = readAttr(root, "id") ?? crypto.randomUUID()
  const cloudId = readAttr(root, "cloud-id") || null
  const created = readAttr(root, "created") ?? new Date().toISOString()
  const color = readAttr(root, "color") ?? "#7ea8ff"
  const wallpaperEmojis = readAttr(root, "wallpaper-emojis") ?? ""
  const rootPositionRaw = readAttr(root, "root-position") ?? "top"
  const rootPosition: "top" | "bottom" = rootPositionRaw === "bottom" ? "bottom" : "top"

  const name = readText(root.name as RawNode | undefined) || "Untitled Book"
  const activeChapterIdRaw = readText(root["active-chapter-id"] as RawNode | undefined)
  const activeChapterId = activeChapterIdRaw.length > 0 ? activeChapterIdRaw : null

  const chaptersHolder = root.chapters as RawNode | undefined
  const chapterArray = chaptersHolder && Array.isArray(chaptersHolder.chapter)
    ? (chaptersHolder.chapter as RawNode[])
    : []
  const chapters = chapterArray.map(parseChapterNode)

  return {
    version,
    id,
    cloudId,
    created,
    name,
    color,
    wallpaperEmojis,
    rootPosition,
    activeChapterId,
    chapters,
  }
}
