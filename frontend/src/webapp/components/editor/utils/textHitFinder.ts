// DOM-walking helpers that locate the Nth occurrence of a word (or arbitrary
// query) inside a contenteditable root and return the text node + offsets so
// the caller can build a Range and scroll/select it.
//
// Used by DraftingEditor's spell-check focus jump (`findTextWordHit`) and
// find/replace focus jump (`findTextQueryHit`).

const SPELL_WORD_MATCHER = /[A-Za-z]+(?:['’][A-Za-z]+)*/g

export type TextWordHit = {
  node: Text
  start: number
  end: number
}

export function normalizeSpellWord(value: string) {
  return value.replace(/’/g, "'").toLowerCase()
}

/**
 * Walk `root`'s text nodes and return the Nth occurrence (0-indexed) of a
 * word equal — after curly-apostrophe normalization and lowercase — to
 * `normalizedWord`. Returns null if fewer than `targetOccurrence+1` matches
 * exist.
 */
export function findTextWordHit(root: Node, normalizedWord: string, targetOccurrence: number): TextWordHit | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let currentNode = walker.nextNode()
  let currentOccurrence = 0

  while (currentNode) {
    const textNode = currentNode as Text
    const value = textNode.nodeValue ?? ""
    const matcher = new RegExp(SPELL_WORD_MATCHER.source, SPELL_WORD_MATCHER.flags)
    let next = matcher.exec(value)

    while (next) {
      const [word] = next
      const normalizedCandidate = normalizeSpellWord(word)

      if (normalizedCandidate === normalizedWord) {
        if (currentOccurrence === targetOccurrence) {
          const start = next.index
          return { node: textNode, start, end: start + word.length }
        }
        currentOccurrence += 1
      }

      next = matcher.exec(value)
    }

    currentNode = walker.nextNode()
  }

  return null
}

/**
 * Walk `root`'s text nodes and return the Nth occurrence (0-indexed) of the
 * raw substring `query` (lowercased, trimmed). Used by find/replace and
 * project-search focus jumps. Returns null if not found.
 */
export function findTextQueryHit(root: Node, query: string, targetOccurrence: number): TextWordHit | null {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return null

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let currentNode = walker.nextNode()
  let currentOccurrence = 0

  while (currentNode) {
    const textNode = currentNode as Text
    const value = textNode.nodeValue ?? ""
    const lowerValue = value.toLowerCase()
    let fromIndex = 0

    while (fromIndex < lowerValue.length) {
      const start = lowerValue.indexOf(normalizedQuery, fromIndex)
      if (start === -1) break

      if (currentOccurrence === targetOccurrence) {
        return { node: textNode, start, end: start + normalizedQuery.length }
      }

      currentOccurrence += 1
      fromIndex = start + Math.max(1, normalizedQuery.length)
    }

    currentNode = walker.nextNode()
  }

  return null
}

/**
 * Apply a TextWordHit as a window selection inside the given editor DOM and
 * scroll it into view. Common tail of both spell-check and search focus
 * handlers.
 */
export function applyTextHitSelection(hit: TextWordHit, editorDom: HTMLElement) {
  const selection = window.getSelection()
  if (!selection) return

  const range = document.createRange()
  range.setStart(hit.node, hit.start)
  range.setEnd(hit.node, hit.end)
  selection.removeAllRanges()
  selection.addRange(range)

  const anchor = hit.node.parentElement ?? editorDom
  anchor.scrollIntoView({ behavior: "smooth", block: "center" })
}
