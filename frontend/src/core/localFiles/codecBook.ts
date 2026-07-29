import { XMLParser } from "fast-xml-parser"
import { FILE_FORMAT_VERSION, type ChapterMode, type TuskBookFile, type TuskChapter } from "./types"
import { emitAttrs, emitCData, escapeText, indent, XML_PROLOG } from "./xmlPrimitives"
import { emitVersionsBlock, parseVersionsBlock, VERSIONS_ARRAY_NAMES } from "./codecVersions"

const VALID_MODES: ChapterMode[] = ["default", "markdown", "typewriter", "plaintext"]

function emitChapter(chapter: TuskChapter, depth: number): string {
  const marginAttrs = chapter.margins
    ? {
        "margin-top": chapter.margins.top,
        "margin-bottom": chapter.margins.bottom,
        "margin-left": chapter.margins.left,
        "margin-right": chapter.margins.right,
      }
    : {}

  const open = `${indent(depth)}<chapter${emitAttrs({
    id: chapter.id,
    title: chapter.title,
    mode: chapter.mode,
    ...marginAttrs,
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

  const versionsBlock = emitVersionsBlock(file.versions ?? [], 1)

  const previewBlock = file.previewPdf
    ? `${indent(1)}<preview kind="pdf" pages="all">${file.previewPdf}</preview>\n`
    : ""

  return `${XML_PROLOG}${head}${meta}${chaptersOpen}${chaptersBody}${chaptersClose}${versionsBlock}${previewBlock}</tusk>\n`
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  cdataPropName: "__cdata",
  parseAttributeValue: false,
  trimValues: false,
  textNodeName: "#text",
  isArray: (name) => name === "chapter" || VERSIONS_ARRAY_NAMES.has(name),
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

function parseMarginAttr(node: RawNode, key: string): number | undefined {
  const raw = readAttr(node, key)
  if (raw === undefined) return undefined
  const parsed = Number.parseFloat(raw)
  return Number.isFinite(parsed) ? parsed : undefined
}

function parseChapterMargins(node: RawNode): TuskChapter["margins"] {
  const top = parseMarginAttr(node, "margin-top")
  const bottom = parseMarginAttr(node, "margin-bottom")
  const left = parseMarginAttr(node, "margin-left")
  const right = parseMarginAttr(node, "margin-right")

  if (top === undefined || bottom === undefined || left === undefined || right === undefined) {
    return undefined
  }

  return { top, bottom, left, right }
}

function parseChapterNode(node: RawNode): TuskChapter {
  const id = readAttr(node, "id") ?? crypto.randomUUID()
  const title = readAttr(node, "title") ?? "Untitled"
  const mode = asMode(readAttr(node, "mode"))
  const content = readText(node.content as RawNode | undefined)
  const margins = parseChapterMargins(node)
  const childArray = Array.isArray(node.chapter) ? (node.chapter as RawNode[]) : []
  const children = childArray.map(parseChapterNode)

  return { id, title, mode, content, margins, children }
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

  const versions = parseVersionsBlock(root.versions as RawNode | undefined)

  const previewNode = root.preview as RawNode | undefined
  const previewText = readText(previewNode).trim()
  const previewPdf = previewText.length > 0 ? previewText : undefined

  return {
    version,
    id,
    created,
    name,
    color,
    wallpaperEmojis,
    rootPosition,
    activeChapterId,
    chapters,
    versions,
    previewPdf,
  }
}
