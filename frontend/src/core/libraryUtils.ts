export function createLocalId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function splitGraphemes(value: string) {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" })
    return Array.from(segmenter.segment(value), (segment) => segment.segment)
  }

  return Array.from(value)
}

export function extractEmojiTokens(value: string, maxCount = 3) {
  const emojiPattern = /\p{Extended_Pictographic}/u
  const tokens: string[] = []

  for (const grapheme of splitGraphemes(value)) {
    if (!emojiPattern.test(grapheme)) {
      continue
    }

    tokens.push(grapheme)
    if (tokens.length >= maxCount) {
      break
    }
  }

  return tokens
}

export function normalizeProjectEmojiWallpaper(value: string) {
  return extractEmojiTokens(value, 3).join(" ")
}

export function normalizeProjectColor(value: string | null | undefined) {
  const normalized = (value ?? "").trim().toUpperCase()
  if (/^#[0-9A-F]{6}$/.test(normalized)) {
    return normalized
  }

  return "#7EA8FF"
}

export function buildDuplicateProjectName(baseName: string, existingNames: string[]) {
  const taken = new Set(existingNames.map((name) => name.trim().toLowerCase()))
  let suffix = 1

  while (true) {
    const candidate = suffix === 1 ? `${baseName} Copy` : `${baseName} Copy ${suffix}`
    if (!taken.has(candidate.trim().toLowerCase())) {
      return candidate
    }

    suffix += 1
  }
}
