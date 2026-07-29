import { XMLParser } from "fast-xml-parser"
import { FILE_FORMAT_VERSION, type TuskPresentationFile, type TuskPresentationSlide } from "./types"
import { emitAttrs, emitCData, escapeText, indent, XML_PROLOG } from "./xmlPrimitives"
import { emitVersionsBlock, parseVersionsBlock, VERSIONS_ARRAY_NAMES } from "./codecVersions"

function emitSlide(slide: TuskPresentationSlide, depth: number): string {
  const open = `${indent(depth)}<slide${emitAttrs({ id: slide.id, title: slide.title })}>\n`
  const body = `${indent(depth + 1)}<board>${emitCData(slide.board)}</board>\n`
  const close = `${indent(depth)}</slide>\n`
  return `${open}${body}${close}`
}

export function serializeTuskPresentation(file: TuskPresentationFile): string {
  const head = `<tusks${emitAttrs({
    version: file.version,
    id: file.id,
    created: file.created,
    color: file.color,
  })}>\n`

  const meta =
    `${indent(1)}<name>${escapeText(file.name)}</name>\n` +
    `${indent(1)}<active-slide-id>${escapeText(file.activeSlideId ?? "")}</active-slide-id>\n`

  const slidesOpen = `${indent(1)}<slides>\n`
  const slidesBody = file.slides.map((s) => emitSlide(s, 2)).join("")
  const slidesClose = `${indent(1)}</slides>\n`

  const versionsBlock = emitVersionsBlock(file.versions ?? [], 1)

  return `${XML_PROLOG}${head}${meta}${slidesOpen}${slidesBody}${slidesClose}${versionsBlock}</tusks>\n`
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  cdataPropName: "__cdata",
  parseAttributeValue: false,
  trimValues: false,
  textNodeName: "#text",
  isArray: (name) => name === "slide" || VERSIONS_ARRAY_NAMES.has(name),
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

function parseSlideNode(rawSlide: RawNode): TuskPresentationSlide {
  return {
    id: readAttr(rawSlide, "id") ?? crypto.randomUUID(),
    title: readAttr(rawSlide, "title") ?? "Untitled Slide",
    board: readText(rawSlide.board as RawNode | undefined),
  }
}

export function parseTuskPresentation(xml: string): TuskPresentationFile {
  const parsed = parser.parse(xml) as { tusks?: RawNode }
  const root = parsed.tusks
  if (!root) throw new Error("Invalid .tusks file: missing <tusks> root element")

  const versionRaw = readAttr(root, "version")
  const version = versionRaw ? Number.parseInt(versionRaw, 10) : FILE_FORMAT_VERSION
  const id = readAttr(root, "id") ?? crypto.randomUUID()
  const created = readAttr(root, "created") ?? new Date().toISOString()
  const color = readAttr(root, "color") ?? "#ef4444"
  const name = readText(root.name as RawNode | undefined) || "Untitled Presentation"

  const activeSlideIdRaw = readText(root["active-slide-id"] as RawNode | undefined)
  const activeSlideId = activeSlideIdRaw.length > 0 ? activeSlideIdRaw : null

  const slidesHolder = root.slides as RawNode | undefined
  const slideArray = slidesHolder && Array.isArray(slidesHolder.slide) ? (slidesHolder.slide as RawNode[]) : []
  const slides = slideArray.map(parseSlideNode)

  const versions = parseVersionsBlock(root.versions as RawNode | undefined)

  return { version, id, created, name, color, activeSlideId, slides, versions }
}
