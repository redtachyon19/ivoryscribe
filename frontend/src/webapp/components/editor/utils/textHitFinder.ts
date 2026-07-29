const SPELL_WORD_MATCHER = /[A-Za-z]+(?:['’][A-Za-z]+)*/g

export type TextWordHit = {
  node: Text
  start: number
  end: number
}

export function normalizeSpellWord(value: string) {
  return value.replace(/’/g, "'").toLowerCase()
}

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
