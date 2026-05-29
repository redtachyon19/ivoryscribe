// Shared <versions> block codec for .tusk and .tusks files.
//
// Both codecs (codecBook.ts, codecPresentation.ts) embed an identical
// <versions> element directly under their root. Keeping the emit + parse
// logic in one place means the on-disk shape can never drift between the
// two file types.
//
// Schema:
//
//   <versions>
//     <version id="..." label="I" kind="manual" saved-at="2026-..." word-count="123"><![CDATA[ {...JSON snapshot...} ]]></version>
//     <version id="..." label="1" kind="autosave" ...>...</version>
//   </versions>
//
// The CDATA payload is the JSON.stringify of a Project at save-time, with
// its own `versions` array stripped (created by `projectWithoutVersions`).
// The full Project is stored — not a diff — so any version can be restored
// independently of every other one.

import type { ProjectVersion, ProjectVersionKind } from "../utils/projects"
import { emitAttrs, emitCData, indent } from "./xmlPrimitives"

const VALID_KINDS: ProjectVersionKind[] = ["manual", "autosave"]

function asKind(value: string | undefined): ProjectVersionKind {
  if (value && (VALID_KINDS as string[]).includes(value)) {
    return value as ProjectVersionKind
  }
  // Default unknown kinds to autosave — a corrupt or future-format tag
  // shouldn't drop the snapshot entirely.
  return "autosave"
}

function emitVersion(version: ProjectVersion, depth: number): string {
  const open = `${indent(depth)}<version${emitAttrs({
    id: version.id,
    label: version.label,
    kind: version.kind,
    "saved-at": version.savedAt,
    "word-count": version.wordCount,
  })}>`
  const body = emitCData(version.snapshot)
  const close = `</version>\n`
  return `${open}${body}${close}`
}

/** Emit the full <versions>...</versions> block. Always emitted (even when
 *  empty) so on-disk diffs stay consistent — a file with one manual save
 *  has the same structural shape as a file with none. */
export function emitVersionsBlock(versions: ReadonlyArray<ProjectVersion>, depth: number): string {
  if (versions.length === 0) {
    return `${indent(depth)}<versions></versions>\n`
  }
  const open = `${indent(depth)}<versions>\n`
  const body = versions.map((v) => emitVersion(v, depth + 1)).join("")
  const close = `${indent(depth)}</versions>\n`
  return `${open}${body}${close}`
}

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

function readCData(node: RawNode | undefined | null): string {
  if (!node) return ""
  if (typeof node === "string") return node
  if (Array.isArray(node.__cdata)) return node.__cdata.join("")
  if (typeof node.__cdata === "string") return node.__cdata
  if (typeof node["#text"] === "string") return node["#text"]
  return ""
}

function parseVersionNode(node: RawNode): ProjectVersion | null {
  const id = readAttr(node, "id")
  const label = readAttr(node, "label")
  const kind = asKind(readAttr(node, "kind"))
  const savedAt = readAttr(node, "saved-at") ?? ""
  const wordCountRaw = readAttr(node, "word-count")
  const wordCount = wordCountRaw ? Number.parseInt(wordCountRaw, 10) : 0
  const snapshot = readCData(node)

  // Versions missing the load-bearing fields are dropped silently — better
  // to lose one corrupt snapshot than to fail the whole file load.
  if (!id || !label || !savedAt || !snapshot) return null

  return {
    id,
    label,
    kind,
    savedAt,
    wordCount: Number.isFinite(wordCount) ? wordCount : 0,
    snapshot,
  }
}

/** Parse a `<versions>` node (as returned by fast-xml-parser). Tolerates
 *  the element being absent or empty — both yield []. */
export function parseVersionsBlock(holder: RawNode | undefined): ProjectVersion[] {
  if (!holder) return []
  const rawArray = Array.isArray(holder.version) ? (holder.version as RawNode[]) : []
  const versions: ProjectVersion[] = []
  for (const raw of rawArray) {
    const parsed = parseVersionNode(raw)
    if (parsed) versions.push(parsed)
  }
  return versions
}

/** Names that must be parsed as arrays by fast-xml-parser regardless of
 *  cardinality, so a single <version> child doesn't collapse to an object.
 *  Both codecs add this to their parser's `isArray` callback. */
export const VERSIONS_ARRAY_NAMES: ReadonlySet<string> = new Set(["version"])
