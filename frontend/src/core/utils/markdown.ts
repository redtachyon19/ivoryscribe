import { Marked } from "marked"
import hljs from "highlight.js/lib/common"
import markedKatex from "marked-katex-extension"

export function normalizeLineEndings(value: string) {
  return value.replace(/\r\n?/g, "\n")
}

const markedRuntime = new Marked({
  gfm: true,
  breaks: true,
  renderer: {
    code({ text, lang }: { text: string; lang?: string }) {
      const language = (lang ?? "").trim().split(/\s+/)[0] ?? ""
      if (language && hljs.getLanguage(language)) {
        try {
          const highlighted = hljs.highlight(text, { language, ignoreIllegals: true }).value
          return `<pre><code class="hljs language-${language}">${highlighted}</code></pre>`
        } catch {
        }
      }
      const escaped = text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
      return `<pre><code class="hljs">${escaped}</code></pre>`
    },
    link({ href, title, text }: { href: string; title?: string | null; text: string }) {
      const trimmed = (href ?? "").trim()
      const safe =
        /^(https?:|mailto:)/i.test(trimmed) || trimmed.startsWith("/") || trimmed.startsWith("#")
          ? trimmed
          : ""
      if (!safe) return text
      const titleAttr = title ? ` title="${title.replace(/"/g, "&quot;")}"` : ""
      return `<a href="${safe}"${titleAttr} target="_blank" rel="noreferrer noopener">${text}</a>`
    },
  },
})

markedRuntime.use(
  markedKatex({
    throwOnError: false,
    output: "html",
    nonStandard: true,
  }),
)

const WORD_MATCHER = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu

export function plainTextFromHtml(value: string) {
  if (typeof DOMParser === "undefined") {
    return normalizeLineEndings(value.replace(/<[^>]*>/g, " "))
  }

  const normalized = value
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|blockquote|pre)>/gi, "\n")

  const document = new DOMParser().parseFromString(normalized, "text/html")
  const text = document.body.textContent ?? ""
  return normalizeLineEndings(text)
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
  return markedRuntime.parse(normalizeLineEndings(markdown), { async: false }) as string
}
