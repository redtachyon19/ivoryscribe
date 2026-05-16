function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function sanitizeLink(value: string) {
  const trimmed = value.trim()

  if (!/^https?:\/\//i.test(trimmed) && !/^mailto:/i.test(trimmed)) {
    return ""
  }

  return trimmed
}

function processInlineMarkdown(value: string) {
  const source = escapeHtml(value)
  const codeTokens: string[] = []

  const withCodeTokens = source.replace(/`([^`]+)`/g, (_, code: string) => {
    const token = `@@MDCODE${codeTokens.length}@@`
    codeTokens.push(`<code>${code}</code>`)
    return token
  })

  const withLinks = withCodeTokens.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text: string, href: string) => {
    const safeHref = sanitizeLink(href)
    if (!safeHref) {
      return text
    }

    return `<a href="${safeHref}" target="_blank" rel="noreferrer noopener">${text}</a>`
  })

  const withStrong = withLinks
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")

  const withEmphasis = withStrong
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/_([^_]+)_/g, "<em>$1</em>")

  const withStrike = withEmphasis.replace(/~~([^~]+)~~/g, "<s>$1</s>")

  return withStrike.replace(/@@MDCODE(\d+)@@/g, (_, index: string) => {
    return codeTokens[Number(index)] ?? ""
  })
}

function closeActiveList(parts: string[], activeList: "ul" | "ol" | null) {
  if (!activeList) {
    return null
  }

  parts.push(`</${activeList}>`)
  return null
}

function normalizeLineEndings(value: string) {
  return value.replace(/\r\n?/g, "\n")
}

const WORD_MATCHER = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu

function plainTextFromHtml(value: string) {
  if (typeof DOMParser === "undefined") {
    return value
  }

  const normalized = value
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|blockquote)>/gi, "\n")

  const document = new DOMParser().parseFromString(normalized, "text/html")
  return document.body.textContent ?? ""
}

function looksLikeHtml(value: string) {
  return /<\/?[a-z][\s\S]*>/i.test(value)
}

export function countWords(value: string) {
  const matches = value.match(WORD_MATCHER)
  return matches ? matches.length : 0
}

export function countWordsFromContent(value: string) {
  const normalized = normalizeLineEndings(value)
  const text = looksLikeHtml(normalized) ? plainTextFromHtml(normalized) : normalized
  return countWords(text)
}

export function normalizeMarkdownContentForEditing(value: string) {
  const trimmed = value.trim()

  if (!trimmed || trimmed === "<p></p>" || trimmed === "<p> </p>") {
    return ""
  }

  if (looksLikeHtml(trimmed)) {
    return normalizeLineEndings(plainTextFromHtml(trimmed)).trim()
  }

  return normalizeLineEndings(value)
}

export function renderMarkdownToHtml(markdown: string) {
  const lines = normalizeLineEndings(markdown).split("\n")
  const parts: string[] = []
  let inCodeFence = false
  let codeFenceLines: string[] = []
  let activeList: "ul" | "ol" | null = null

  for (const line of lines) {
    const trimmed = line.trim()

    if (trimmed.startsWith("```")) {
      if (!inCodeFence) {
        activeList = closeActiveList(parts, activeList)
        inCodeFence = true
        codeFenceLines = []
        continue
      }

      inCodeFence = false
      parts.push(`<pre><code>${escapeHtml(codeFenceLines.join("\n"))}</code></pre>`)
      codeFenceLines = []
      continue
    }

    if (inCodeFence) {
      codeFenceLines.push(line)
      continue
    }

    if (!trimmed) {
      activeList = closeActiveList(parts, activeList)
      continue
    }

    if (/^---+$/.test(trimmed) || /^\*\*\*+$/.test(trimmed)) {
      activeList = closeActiveList(parts, activeList)
      parts.push("<hr />")
      continue
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/)
    if (headingMatch) {
      activeList = closeActiveList(parts, activeList)
      const level = headingMatch[1].length
      parts.push(`<h${level}>${processInlineMarkdown(headingMatch[2])}</h${level}>`)
      continue
    }

    const quoteMatch = trimmed.match(/^>\s?(.+)$/)
    if (quoteMatch) {
      activeList = closeActiveList(parts, activeList)
      parts.push(`<blockquote>${processInlineMarkdown(quoteMatch[1])}</blockquote>`)
      continue
    }

    const orderedMatch = trimmed.match(/^(\d+)\.\s+(.+)$/)
    if (orderedMatch) {
      if (activeList !== "ol") {
        activeList = closeActiveList(parts, activeList)
        activeList = "ol"
        parts.push("<ol>")
      }

      parts.push(`<li>${processInlineMarkdown(orderedMatch[2])}</li>`)
      continue
    }

    const unorderedMatch = trimmed.match(/^[-*+]\s+(.+)$/)
    if (unorderedMatch) {
      if (activeList !== "ul") {
        activeList = closeActiveList(parts, activeList)
        activeList = "ul"
        parts.push("<ul>")
      }

      parts.push(`<li>${processInlineMarkdown(unorderedMatch[1])}</li>`)
      continue
    }

    activeList = closeActiveList(parts, activeList)
    parts.push(`<p>${processInlineMarkdown(line)}</p>`)
  }

  if (inCodeFence) {
    parts.push(`<pre><code>${escapeHtml(codeFenceLines.join("\n"))}</code></pre>`)
  }

  closeActiveList(parts, activeList)

  return parts.join("\n")
}
