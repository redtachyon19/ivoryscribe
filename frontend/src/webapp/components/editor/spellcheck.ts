import englishWords from "an-array-of-english-words"

export type SpellCheckDocumentType = "text" | "markdown"

export type SpellCheckFocusTarget =
  | {
    documentType: "text"
    normalizedWord: string
    occurrenceIndex: number
  }
  | {
    documentType: "markdown"
    normalizedWord: string
    occurrenceIndex: number
    start: number
    end: number
  }

export type SpellCheckIssue = {
  word: string
  normalizedWord: string
  occurrenceIndex: number
  suggestions: string[]
  context: string
  focusTarget: SpellCheckFocusTarget
}

export type SpellCheckMatch = {
  issue: SpellCheckIssue
  replaceWith: (replacement: string) => string
}

type OccurrenceMap = Map<string, number>

const WORD_MATCHER = /[A-Za-z]+(?:['’][A-Za-z]+)*/g
const DICTIONARY = new Set<string>(englishWords.map((word) => word.toLowerCase()))
const HTML_SKIP_TAGS = new Set(["CODE", "PRE", "SCRIPT", "STYLE"])
const LETTERS = "abcdefghijklmnopqrstuvwxyz"

function normalizeWord(value: string) {
  return value.replace(/’/g, "'").toLowerCase()
}

function getOccurrenceIndex(word: string, occurrenceMap: OccurrenceMap) {
  const currentCount = occurrenceMap.get(word) ?? 0
  occurrenceMap.set(word, currentCount + 1)
  return currentCount
}

function collectBaseForms(word: string) {
  const forms = new Set<string>()

  if (word.endsWith("'s") && word.length > 3) {
    forms.add(word.slice(0, -2))
  }

  if (word.endsWith("ies") && word.length > 4) {
    forms.add(`${word.slice(0, -3)}y`)
  }

  if (word.endsWith("es") && word.length > 3) {
    forms.add(word.slice(0, -2))
  }

  if (word.endsWith("s") && word.length > 2) {
    forms.add(word.slice(0, -1))
  }

  if (word.endsWith("ed") && word.length > 3) {
    forms.add(word.slice(0, -2))
  }

  if (word.endsWith("ing") && word.length > 5) {
    forms.add(word.slice(0, -3))
  }

  return forms
}

function isDictionaryWord(word: string) {
  if (DICTIONARY.has(word)) {
    return true
  }

  const compact = word.replace(/'/g, "")
  if (compact && DICTIONARY.has(compact)) {
    return true
  }

  for (const form of collectBaseForms(word)) {
    if (DICTIONARY.has(form)) {
      return true
    }
  }

  return false
}

function isLikelyCorrectWord(word: string, ignoredWords: Set<string>) {
  if (word.length <= 1) {
    return true
  }

  if (/^[A-Z]{2,}$/.test(word)) {
    return true
  }

  const normalized = normalizeWord(word)

  if (!normalized) {
    return true
  }

  if (ignoredWords.has(normalized)) {
    return true
  }

  return isDictionaryWord(normalized)
}

function known(words: Iterable<string>) {
  const candidates: string[] = []

  for (const candidate of words) {
    if (!candidate || candidate.length <= 1) {
      continue
    }

    if (DICTIONARY.has(candidate)) {
      candidates.push(candidate)
    }
  }

  return candidates
}

function edits1(word: string) {
  const results = new Set<string>()

  if (word.length > 24) {
    return results
  }

  for (let index = 0; index <= word.length; index += 1) {
    const left = word.slice(0, index)
    const right = word.slice(index)

    if (right.length > 0) {
      results.add(left + right.slice(1))
    }

    if (right.length > 1) {
      results.add(left + right[1] + right[0] + right.slice(2))
    }

    for (const letter of LETTERS) {
      if (right.length > 0) {
        results.add(left + letter + right.slice(1))
      }

      results.add(left + letter + right)
    }
  }

  return results
}

function suggestionScore(target: string, candidate: string) {
  let score = 0

  if (candidate[0] === target[0]) {
    score += 3
  }

  score -= Math.abs(candidate.length - target.length)

  if (target.length > 2 && candidate.endsWith(target.slice(-2))) {
    score += 1
  }

  return score
}

function rankCandidates(target: string, candidates: string[]) {
  const unique = Array.from(new Set(candidates))

  return unique.sort((left, right) => {
    const scoreDelta = suggestionScore(target, right) - suggestionScore(target, left)
    if (scoreDelta !== 0) {
      return scoreDelta
    }

    return left.localeCompare(right)
  })
}

function applyWordCase(source: string, replacement: string) {
  if (!replacement) {
    return replacement
  }

  if (source.toUpperCase() === source) {
    return replacement.toUpperCase()
  }

  if (source[0]?.toUpperCase() === source[0] && source.slice(1).toLowerCase() === source.slice(1)) {
    return replacement[0].toUpperCase() + replacement.slice(1)
  }

  return replacement
}

function suggestReplacements(word: string) {
  const normalized = normalizeWord(word)

  if (!normalized || normalized.length <= 1) {
    return []
  }

  const candidates = rankCandidates(normalized, known(edits1(normalized))).slice(0, 3)
  return candidates.map((candidate) => applyWordCase(word, candidate))
}

function findSentenceStart(value: string, index: number) {
  let pointer = Math.max(0, Math.min(value.length, index))

  while (pointer > 0) {
    const previous = value[pointer - 1]
    if (previous === "\n" || previous === "." || previous === "!" || previous === "?") {
      break
    }
    pointer -= 1
  }

  while (pointer < value.length && /\s/.test(value[pointer])) {
    pointer += 1
  }

  return pointer
}

function findSentenceEnd(value: string, index: number) {
  let pointer = Math.max(0, Math.min(value.length, index))

  while (pointer < value.length) {
    const current = value[pointer]
    if (current === "\n" || current === "." || current === "!" || current === "?") {
      pointer += 1
      break
    }
    pointer += 1
  }

  while (pointer > 0 && /\s/.test(value[pointer - 1])) {
    pointer -= 1
  }

  return pointer
}

function buildContextSnippet(value: string, start: number, end: number) {
  const sentenceStart = findSentenceStart(value, start)
  const sentenceEnd = findSentenceEnd(value, end)
  const maxPreviewLength = 140
  const sentenceLength = sentenceEnd - sentenceStart

  let contextStart = sentenceStart
  let contextEnd = sentenceEnd

  if (sentenceLength > maxPreviewLength) {
    const desiredLeft = Math.floor(maxPreviewLength * 0.45)
    const desiredRight = maxPreviewLength - desiredLeft
    contextStart = Math.max(sentenceStart, start - desiredLeft)
    contextEnd = Math.min(sentenceEnd, end + desiredRight)

    if (contextEnd - contextStart < maxPreviewLength) {
      const missing = maxPreviewLength - (contextEnd - contextStart)
      contextStart = Math.max(sentenceStart, contextStart - missing)
    }
  }

  const word = value.slice(start, end)
  const left = value.slice(contextStart, start)
  const right = value.slice(end, contextEnd)
  const prefix = contextStart > sentenceStart ? "..." : ""
  const suffix = contextEnd < sentenceEnd ? "..." : ""

  return `${prefix}${left}[${word}]${right}${suffix}`.replace(/\s+/g, " ").trim()
}

function buildIssue(
  word: string,
  normalizedWord: string,
  occurrenceIndex: number,
  contextValue: string,
  start: number,
  end: number,
  focusTarget: SpellCheckFocusTarget,
): SpellCheckIssue {
  return {
    word,
    normalizedWord,
    occurrenceIndex,
    suggestions: suggestReplacements(word),
    context: buildContextSnippet(contextValue, start, end),
    focusTarget,
  }
}

function collectIssuesFromMarkdown(value: string, ignoredWords: Set<string>) {
  const issues: SpellCheckIssue[] = []
  const occurrenceMap: OccurrenceMap = new Map()
  const matcher = new RegExp(WORD_MATCHER.source, WORD_MATCHER.flags)
  let next = matcher.exec(value)

  while (next) {
    const [word] = next
    const start = next.index
    const end = start + word.length
    const normalizedWord = normalizeWord(word)
    const occurrenceIndex = getOccurrenceIndex(normalizedWord, occurrenceMap)

    if (!isLikelyCorrectWord(word, ignoredWords)) {
      issues.push(
        buildIssue(
          word,
          normalizedWord,
          occurrenceIndex,
          value,
          start,
          end,
          {
            documentType: "markdown",
            normalizedWord,
            occurrenceIndex,
            start,
            end,
          },
        ),
      )
    }

    next = matcher.exec(value)
  }

  return issues
}

function collectIssuesFromHtml(value: string, ignoredWords: Set<string>) {
  if (typeof DOMParser === "undefined") {
    return collectIssuesFromMarkdown(value, ignoredWords)
  }

  const issues: SpellCheckIssue[] = []
  const occurrenceMap: OccurrenceMap = new Map()
  const parser = new DOMParser()
  const document = parser.parseFromString(value, "text/html")
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  let currentNode = walker.nextNode()

  while (currentNode) {
    const textNode = currentNode as Text
    const parentTag = textNode.parentElement?.tagName.toUpperCase() ?? ""

    if (!HTML_SKIP_TAGS.has(parentTag)) {
      const nodeValue = textNode.nodeValue ?? ""
      const matcher = new RegExp(WORD_MATCHER.source, WORD_MATCHER.flags)
      let next = matcher.exec(nodeValue)

      while (next) {
        const [word] = next
        const start = next.index
        const end = start + word.length
        const normalizedWord = normalizeWord(word)
        const occurrenceIndex = getOccurrenceIndex(normalizedWord, occurrenceMap)

        if (!isLikelyCorrectWord(word, ignoredWords)) {
          issues.push(
            buildIssue(
              word,
              normalizedWord,
              occurrenceIndex,
              nodeValue,
              start,
              end,
              {
                documentType: "text",
                normalizedWord,
                occurrenceIndex,
              },
            ),
          )
        }

        next = matcher.exec(nodeValue)
      }
    }

    currentNode = walker.nextNode()
  }

  return issues
}

function replaceOccurrenceInPlainText(value: string, normalizedWord: string, targetOccurrence: number, replacement: string) {
  const matcher = new RegExp(WORD_MATCHER.source, WORD_MATCHER.flags)
  let next = matcher.exec(value)
  let currentOccurrence = 0

  while (next) {
    const [word] = next
    const candidate = normalizeWord(word)

    if (candidate === normalizedWord) {
      if (currentOccurrence === targetOccurrence) {
        const start = next.index
        const end = start + word.length
        return `${value.slice(0, start)}${replacement}${value.slice(end)}`
      }

      currentOccurrence += 1
    }

    next = matcher.exec(value)
  }

  return value
}

function replaceIssueInHtml(value: string, issue: SpellCheckIssue, replacement: string) {
  if (typeof DOMParser === "undefined") {
    return replaceOccurrenceInPlainText(value, issue.normalizedWord, issue.occurrenceIndex, replacement)
  }

  const parser = new DOMParser()
  const document = parser.parseFromString(value, "text/html")
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  let currentNode = walker.nextNode()
  let currentOccurrence = 0

  while (currentNode) {
    const textNode = currentNode as Text
    const parentTag = textNode.parentElement?.tagName.toUpperCase() ?? ""

    if (!HTML_SKIP_TAGS.has(parentTag)) {
      const nodeValue = textNode.nodeValue ?? ""
      const matcher = new RegExp(WORD_MATCHER.source, WORD_MATCHER.flags)
      let next = matcher.exec(nodeValue)

      while (next) {
        const [word] = next
        const candidate = normalizeWord(word)

        if (candidate === issue.normalizedWord) {
          if (currentOccurrence === issue.occurrenceIndex) {
            const start = next.index
            const end = start + word.length
            textNode.nodeValue = `${nodeValue.slice(0, start)}${replacement}${nodeValue.slice(end)}`
            return document.body.innerHTML
          }

          currentOccurrence += 1
        }

        next = matcher.exec(nodeValue)
      }
    }

    currentNode = walker.nextNode()
  }

  return value
}

export function collectSpellCheckIssues(
  value: string,
  documentType: SpellCheckDocumentType,
  ignoredWords: Set<string>,
) {
  if (documentType === "markdown") {
    return collectIssuesFromMarkdown(value, ignoredWords)
  }

  return collectIssuesFromHtml(value, ignoredWords)
}

export function replaceSpellCheckIssue(
  value: string,
  documentType: SpellCheckDocumentType,
  issue: SpellCheckIssue,
  replacement: string,
) {
  const cleanedReplacement = replacement.trim()
  if (!cleanedReplacement) {
    return value
  }

  if (documentType === "markdown" && issue.focusTarget.documentType === "markdown") {
    return `${value.slice(0, issue.focusTarget.start)}${cleanedReplacement}${value.slice(issue.focusTarget.end)}`
  }

  return replaceIssueInHtml(value, issue, cleanedReplacement)
}

export function findFirstSpellCheckMatch(
  value: string,
  documentType: SpellCheckDocumentType,
  ignoredWords: Set<string>,
): SpellCheckMatch | null {
  const issues = collectSpellCheckIssues(value, documentType, ignoredWords)
  const issue = issues[0]
  if (!issue) {
    return null
  }

  return {
    issue,
    replaceWith: (replacement: string) => replaceSpellCheckIssue(value, documentType, issue, replacement),
  }
}
