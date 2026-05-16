// Codec for .tusks (slideshow) files.
//
// Phase-1 shell. Real presentation features (layouts, transitions, presenter
// view) are deferred — for now a slide is just an HTML payload, and consumers
// can paste images via standard rich-text behaviour.
//
// Schema:
//
// <?xml version="1.0" encoding="UTF-8"?>
// <tusks version="1" id="..." cloud-id="" created="..." color="...">
//   <name>My Talk</name>
//   <active-slide-id>s1</active-slide-id>
//   <slides>
//     <slide id="s1">
//       <content><![CDATA[<p>Slide HTML</p>]]></content>
//     </slide>
//     <slide id="s2">
//       <content><![CDATA[<img src="..."/>]]></content>
//     </slide>
//   </slides>
// </tusks>

import { XMLParser } from "fast-xml-parser"
import { FILE_FORMAT_VERSION, type TuskSlide, type TuskSlideshowFile } from "./types"
import { emitAttrs, emitCData, escapeText, indent, XML_PROLOG } from "./xmlPrimitives"

function emitSlide(slide: TuskSlide, depth: number): string {
  const open = `${indent(depth)}<slide${emitAttrs({ id: slide.id })}>\n`
  const body = `${indent(depth + 1)}<content>${emitCData(slide.content)}</content>\n`
  const close = `${indent(depth)}</slide>\n`
  return `${open}${body}${close}`
}

export function serializeTuskSlideshow(file: TuskSlideshowFile): string {
  const head = `<tusks${emitAttrs({
    version: file.version,
    id: file.id,
    "cloud-id": file.cloudId ?? "",
    created: file.created,
    color: file.color,
  })}>\n`

  const meta =
    `${indent(1)}<name>${escapeText(file.name)}</name>\n` +
    `${indent(1)}<active-slide-id>${escapeText(file.activeSlideId ?? "")}</active-slide-id>\n`

  const slidesOpen = `${indent(1)}<slides>\n`
  const slidesBody = file.slides.map((s) => emitSlide(s, 2)).join("")
  const slidesClose = `${indent(1)}</slides>\n`

  return `${XML_PROLOG}${head}${meta}${slidesOpen}${slidesBody}${slidesClose}</tusks>\n`
}

// ── Parsing ────────────────────────────────────────────────────────────────

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  cdataPropName: "__cdata",
  parseAttributeValue: false,
  trimValues: false,
  textNodeName: "#text",
  isArray: (name) => name === "slide",
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

function parseSlideNode(rawSlide: RawNode): TuskSlide {
  return {
    id: readAttr(rawSlide, "id") ?? crypto.randomUUID(),
    content: readText(rawSlide.content as RawNode | undefined),
  }
}

export function parseTuskSlideshow(xml: string): TuskSlideshowFile {
  const parsed = parser.parse(xml) as { tusks?: RawNode }
  const root = parsed.tusks
  if (!root) throw new Error("Invalid .tusks file: missing <tusks> root element")

  const versionRaw = readAttr(root, "version")
  const version = versionRaw ? Number.parseInt(versionRaw, 10) : FILE_FORMAT_VERSION
  const id = readAttr(root, "id") ?? crypto.randomUUID()
  const cloudId = readAttr(root, "cloud-id") || null
  const created = readAttr(root, "created") ?? new Date().toISOString()
  const color = readAttr(root, "color") ?? "#ef4444"
  const name = readText(root.name as RawNode | undefined) || "Untitled Slideshow"

  const activeSlideIdRaw = readText(root["active-slide-id"] as RawNode | undefined)
  const activeSlideId = activeSlideIdRaw.length > 0 ? activeSlideIdRaw : null

  const slidesHolder = root.slides as RawNode | undefined
  const slideArray = slidesHolder && Array.isArray(slidesHolder.slide) ? (slidesHolder.slide as RawNode[]) : []
  const slides = slideArray.map(parseSlideNode)

  return { version, id, cloudId, created, name, color, activeSlideId, slides }
}
