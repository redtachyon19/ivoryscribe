// Codec for .tusk (book) files.
//
// Schema (file format version 2):
//
// <?xml version="1.0" encoding="UTF-8"?>
// <tusk version="2" id="..." created="..." color="..." wallpaper-emojis="" root-position="top">
//   <name>My Book</name>
//   <active-chapter-id>...</active-chapter-id>
//   <chapters>
//     <chapter id="..." title="Chapter 1" mode="default">
//       <content><![CDATA[<p>HTML</p>]]></content>
//       <chapter id="..." title="Section" mode="markdown">
//         <content><![CDATA[# md]]></content>
//       </chapter>
//     </chapter>
//     <chapter id="..." title="Typed" mode="typewriter" margin-top="1" margin-bottom="1" margin-left="1.25" margin-right="1.25">
//       <content><![CDATA[<p>HTML</p>]]></content>
//     </chapter>
//   </chapters>
//   <versions>
//     <version id="..." label="I" kind="manual" saved-at="..." word-count="...">
//       <![CDATA[ {JSON snapshot of the Project at save time, sans versions} ]]>
//     </version>
//   </versions>
// </tusk>
//
// `mode` replaces the legacy markdownIds / typewriterIds parallel arrays.
// `<versions>` was added in format version 2 and is absent on v1 files; the
// parser tolerates that and starts the history empty.

import { XMLParser } from "fast-xml-parser"
import { FILE_FORMAT_VERSION, type ChapterMode, type TuskBookFile, type TuskChapter } from "./types"
import { emitAttrs, emitCData, escapeText, indent, XML_PROLOG } from "./xmlPrimitives"
import { emitVersionsBlock, parseVersionsBlock, VERSIONS_ARRAY_NAMES } from "./codecVersions"

const VALID_MODES: ChapterMode[] = ["default", "markdown", "typewriter", "plaintext"]

function emitChapter(chapter: TuskChapter, depth: number): string {
  // Margins are only ever set on typewriter chapters (see bridge.ts); emit
  // them as plain attributes alongside `mode` so they round-trip through the
  // file the same way everything else about the chapter does. Absent when
  // the chapter has no margins (non-typewriter, or a v1 file predating this).
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
  // No `cloud-id` attribute — projects in the new model live entirely
  // in the cloud or entirely on disk, never both. The migration in
  // Phase 5 retires any old files that still carry it; subsequent
  // writes drop the attribute (the parser ignores unknown attrs, so
  // legacy stamps on disk don't break anything until they round-trip).
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

  // Always emit <versions> (possibly empty) — structural consistency keeps
  // git diffs sane and the parse path simpler.
  const versionsBlock = emitVersionsBlock(file.versions ?? [], 1)

  // Optional 1:1 PDF render for QuickLook (see TuskBookFile.previewPdf). The
  // value is base64 (A–Z a–z 0–9 + / =) — none of which are XML-special — so
  // it's emitted as plain element text with no escaping or CDATA needed.
  const previewBlock = file.previewPdf
    ? `${indent(1)}<preview kind="pdf" pages="all">${file.previewPdf}</preview>\n`
    : ""

  return `${XML_PROLOG}${head}${meta}${chaptersOpen}${chaptersBody}${chaptersClose}${versionsBlock}${previewBlock}</tusk>\n`
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
  // <chapters> and nested under other <chapter>, so a name-only check is
  // safe. `version` lives under <versions> and is added to the set by the
  // shared codecVersions module (VERSIONS_ARRAY_NAMES) — keep that list
  // canonical there so codecPresentation gets the same treatment.
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

  // Only produce a margins object when all four are present — a partial
  // set means the file was hand-edited or corrupted, and falling back to
  // DEFAULT_MARGINS (via the "absent" path) is safer than guessing.
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
  // We deliberately *don't* read a `cloud-id` attribute anymore. Old
  // files on disk may still carry one; the migration in Phase 5
  // retires those by trashing the local file in favour of the cloud
  // copy. Anything that slips past keeps round-tripping cleanly
  // because we just don't emit the attribute on write.
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

  // Versions are added in file format v2. v1 files don't have a <versions>
  // element; parseVersionsBlock returns [] in that case and the history
  // begins accruing fresh on next save.
  const versions = parseVersionsBlock(root.versions as RawNode | undefined)

  // Optional QuickLook PDF render (see serializeTuskBook). Absent on most
  // files; parsed back so the sync layer can keep it across content writes
  // and avoid regenerating an unchanged document's preview on every open.
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
