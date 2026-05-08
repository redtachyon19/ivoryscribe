export type HunkState = "pending" | "accepted" | "rejected"

export type DiffSegment = {
  type: "same" | "add" | "remove"
  text: string
  hunkId?: string
}

export type DiffBlock = {
  tag: string
  segments: DiffSegment[]
}

export type DiffHunk = {
  id: string
  before: string
  after: string
  state: HunkState
}

export type DiffResult = {
  blocks: DiffBlock[]
  hunks: DiffHunk[]
}

const BLOCK_TAGS = new Set([
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "blockquote",
  "li",
  "pre",
])

type Block = {
  tag: string
  text: string
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
}

export function parseBlocks(html: string): Block[] {
  if (typeof document === "undefined") {
    return fallbackParseBlocks(html)
  }
  const wrapper = document.createElement("div")
  wrapper.innerHTML = html
  const blocks: Block[] = []
  for (const child of Array.from(wrapper.children)) {
    const tag = child.tagName.toLowerCase()
    if (BLOCK_TAGS.has(tag)) {
      const text = (child.textContent ?? "").replace(/\s+/g, " ").trim()
      if (text.length > 0) blocks.push({ tag, text })
    } else if (tag === "ul" || tag === "ol") {
      for (const li of Array.from(child.children)) {
        if (li.tagName.toLowerCase() === "li") {
          const text = (li.textContent ?? "").replace(/\s+/g, " ").trim()
          if (text.length > 0) blocks.push({ tag: "li", text })
        }
      }
    } else {
      const text = (child.textContent ?? "").replace(/\s+/g, " ").trim()
      if (text.length > 0) blocks.push({ tag: "p", text })
    }
  }

  // Fallback: if no block-level children were found (e.g. the model returned
  // plain text without any tags), treat the entire textContent as one or more
  // paragraphs split on blank lines.
  if (blocks.length === 0) {
    const fullText = wrapper.textContent ?? ""
    const paragraphs = fullText
      .split(/\n{2,}/)
      .map((part) => part.replace(/[ \t]+/g, " ").trim())
      .filter((part) => part.length > 0)
    for (const para of paragraphs) {
      blocks.push({ tag: "p", text: para })
    }
  }

  return blocks
}

function fallbackParseBlocks(html: string): Block[] {
  const cleaned = html.replace(/\s+/g, " ")
  const matches = cleaned.matchAll(/<(p|h[1-6]|blockquote|li|pre)[^>]*>([\s\S]*?)<\/\1>/gi)
  const blocks: Block[] = []
  for (const match of matches) {
    const tag = match[1].toLowerCase()
    const inner = match[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()
    const text = decodeEntities(inner)
    if (text.length > 0) blocks.push({ tag, text })
  }
  return blocks
}

function tokenize(text: string): string[] {
  return text.match(/[A-Za-z0-9_]+|[^\sA-Za-z0-9_]+|\s+/g) ?? []
}

type RawSegment = { type: "same" | "add" | "remove"; text: string }

function lcsWordDiff(a: string[], b: string[]): RawSegment[] {
  const n = a.length
  const m = b.length
  const dp: Int32Array[] = Array.from({ length: n + 1 }, () => new Int32Array(m + 1))
  for (let i = 1; i <= n; i += 1) {
    for (let j = 1; j <= m; j += 1) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1])
    }
  }
  const out: RawSegment[] = []
  let i = n
  let j = m
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      out.push({ type: "same", text: a[i - 1] })
      i -= 1
      j -= 1
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      out.push({ type: "add", text: b[j - 1] })
      j -= 1
    } else {
      out.push({ type: "remove", text: a[i - 1] })
      i -= 1
    }
  }
  out.reverse()
  const merged: RawSegment[] = []
  for (const seg of out) {
    const last = merged[merged.length - 1]
    if (last && last.type === seg.type) {
      last.text += seg.text
    } else {
      merged.push({ ...seg })
    }
  }
  return merged
}

function blockSimilarity(a: Block, b: Block): number {
  if (a.tag !== b.tag) return 0
  if (a.text === b.text) return 1
  const aWords = new Set(a.text.toLowerCase().match(/[a-z0-9]+/g) ?? [])
  const bWords = new Set(b.text.toLowerCase().match(/[a-z0-9]+/g) ?? [])
  if (aWords.size === 0 && bWords.size === 0) return 0
  let intersection = 0
  for (const w of aWords) if (bWords.has(w)) intersection += 1
  const union = aWords.size + bWords.size - intersection
  return union > 0 ? intersection / union : 0
}

type Pairing =
  | { kind: "match"; before: Block; after: Block }
  | { kind: "remove"; before: Block }
  | { kind: "add"; after: Block }

function alignBlocks(before: Block[], after: Block[], threshold = 0.35): Pairing[] {
  const n = before.length
  const m = after.length
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  const back: string[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(""))

  for (let i = 1; i <= n; i += 1) {
    for (let j = 1; j <= m; j += 1) {
      const sim = blockSimilarity(before[i - 1], after[j - 1])
      const matchScore = sim >= threshold ? dp[i - 1][j - 1] + sim : -Infinity
      const skipBefore = dp[i - 1][j]
      const skipAfter = dp[i][j - 1]

      if (matchScore >= skipBefore && matchScore >= skipAfter) {
        dp[i][j] = matchScore
        back[i][j] = "match"
      } else if (skipBefore >= skipAfter) {
        dp[i][j] = skipBefore
        back[i][j] = "skipBefore"
      } else {
        dp[i][j] = skipAfter
        back[i][j] = "skipAfter"
      }
    }
  }

  const result: Pairing[] = []
  let i = n
  let j = m
  while (i > 0 && j > 0) {
    const action = back[i][j]
    if (action === "match") {
      result.push({ kind: "match", before: before[i - 1], after: after[j - 1] })
      i -= 1
      j -= 1
    } else if (action === "skipBefore") {
      result.push({ kind: "remove", before: before[i - 1] })
      i -= 1
    } else {
      result.push({ kind: "add", after: after[j - 1] })
      j -= 1
    }
  }
  while (i > 0) result.push({ kind: "remove", before: before[--i] })
  while (j > 0) result.push({ kind: "add", after: after[--j] })
  result.reverse()
  return result
}

function wordDiffWithinBlock(
  beforeText: string,
  afterText: string,
  makeHunkId: () => string,
  hunks: DiffHunk[],
): DiffSegment[] {
  if (beforeText === afterText) {
    return [{ type: "same", text: beforeText }]
  }
  const beforeTokens = tokenize(beforeText)
  const afterTokens = tokenize(afterText)
  const raw = lcsWordDiff(beforeTokens, afterTokens)

  const segments: DiffSegment[] = []
  let currentHunk: DiffHunk | null = null
  const flushHunk = () => {
    if (currentHunk) {
      hunks.push(currentHunk)
      currentHunk = null
    }
  }

  for (const seg of raw) {
    if (seg.type === "same") {
      flushHunk()
      segments.push({ type: "same", text: seg.text })
    } else {
      if (!currentHunk) {
        currentHunk = { id: makeHunkId(), before: "", after: "", state: "pending" }
      }
      if (seg.type === "add") currentHunk.after += seg.text
      else currentHunk.before += seg.text
      segments.push({ type: seg.type, text: seg.text, hunkId: currentHunk.id })
    }
  }
  flushHunk()
  return segments
}

/**
 * Build a diff structure that preserves original block tags. Returns blocks
 * (each with tag + segments) and the list of hunks. The actual HTML for the
 * editor is produced by `renderDiffHtml(blocks, hunkStates)` — that lets the
 * editor's content track hunk-state changes by recomputing the HTML, which
 * sidesteps any in-place document mutation pitfalls.
 */
export function buildDiff(beforeHtml: string, afterHtml: string): DiffResult {
  const beforeBlocks = parseBlocks(beforeHtml)
  const afterBlocks = parseBlocks(afterHtml)
  const aligned = alignBlocks(beforeBlocks, afterBlocks)

  const hunks: DiffHunk[] = []
  const blocks: DiffBlock[] = []
  let counter = 0
  const makeHunkId = () => {
    counter += 1
    return `h-${counter}`
  }

  for (const pairing of aligned) {
    if (pairing.kind === "match") {
      const segments = wordDiffWithinBlock(pairing.before.text, pairing.after.text, makeHunkId, hunks)
      blocks.push({ tag: pairing.after.tag, segments })
    } else if (pairing.kind === "remove") {
      const id = makeHunkId()
      hunks.push({ id, before: pairing.before.text, after: "", state: "pending" })
      blocks.push({
        tag: pairing.before.tag,
        segments: [{ type: "remove", text: pairing.before.text, hunkId: id }],
      })
    } else {
      const id = makeHunkId()
      hunks.push({ id, before: "", after: pairing.after.text, state: "pending" })
      blocks.push({
        tag: pairing.after.tag,
        segments: [{ type: "add", text: pairing.after.text, hunkId: id }],
      })
    }
  }

  return { blocks, hunks }
}

export function renderDiffHtml(
  blocks: DiffBlock[],
  hunkStates: Map<string, HunkState>,
): string {
  const out: string[] = []
  for (const block of blocks) {
    let inner = ""
    for (const seg of block.segments) {
      if (seg.type === "same") {
        inner += escapeHtml(seg.text)
        continue
      }
      const state = seg.hunkId ? (hunkStates.get(seg.hunkId) ?? "pending") : "pending"
      const escaped = escapeHtml(seg.text)
      if (state === "pending") {
        if (seg.type === "add") {
          inner += `<mark data-diff-add data-hunk-id="${seg.hunkId}">${escaped}</mark>`
        } else {
          inner += `<s data-diff-remove data-hunk-id="${seg.hunkId}">${escaped}</s>`
        }
      } else if (state === "accepted") {
        if (seg.type === "add") inner += escaped
        // type === "remove" + accepted: drop the text
      } else if (state === "rejected") {
        if (seg.type === "remove") inner += escaped
        // type === "add" + rejected: drop the text
      }
    }
    if (inner.length === 0) continue
    out.push(`<${block.tag}>${inner}</${block.tag}>`)
  }
  return out.length > 0 ? out.join("") : "<p></p>"
}
