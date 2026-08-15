import { Marked, type Tokens } from "marked"
import hljs from "highlight.js/lib/common"
import markedKatex from "marked-katex-extension"
import { normalizeLineEndings } from "./markdown"

/**
 * Rich renderer for the markdown preview pane.
 *
 * Kept separate from `renderMarkdownToHtml` in ./markdown, which stays plain so
 * the PDF/print pipeline keeps emitting the markup its paginator expects.
 */

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function safeHref(href: string | null | undefined) {
  const trimmed = (href ?? "").trim()
  if (/^(https?:|mailto:)/i.test(trimmed) || trimmed.startsWith("/") || trimmed.startsWith("#")) {
    return trimmed
  }
  return ""
}

const LANGUAGE_LABELS: Record<string, string> = {
  bash: "Bash",
  c: "C",
  cpp: "C++",
  cs: "C#",
  csharp: "C#",
  css: "CSS",
  diff: "Diff",
  dockerfile: "Dockerfile",
  go: "Go",
  graphql: "GraphQL",
  html: "HTML",
  ini: "INI",
  java: "Java",
  javascript: "JavaScript",
  js: "JavaScript",
  json: "JSON",
  jsx: "JSX",
  kotlin: "Kotlin",
  less: "Less",
  lua: "Lua",
  makefile: "Makefile",
  markdown: "Markdown",
  md: "Markdown",
  objectivec: "Objective-C",
  perl: "Perl",
  php: "PHP",
  plaintext: "Text",
  powershell: "PowerShell",
  python: "Python",
  py: "Python",
  r: "R",
  rb: "Ruby",
  ruby: "Ruby",
  rs: "Rust",
  rust: "Rust",
  scss: "SCSS",
  sh: "Shell",
  shell: "Shell",
  sql: "SQL",
  swift: "Swift",
  text: "Text",
  toml: "TOML",
  ts: "TypeScript",
  tsx: "TSX",
  typescript: "TypeScript",
  xml: "XML",
  yaml: "YAML",
  yml: "YAML",
  zsh: "Shell",
}

function languageLabel(language: string) {
  if (!language) return "Code"
  const known = LANGUAGE_LABELS[language.toLowerCase()]
  if (known) return known
  return language.charAt(0).toUpperCase() + language.slice(1)
}

const ICON_ATTRS =
  'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"'

const COPY_ICON = `<svg class="md-icon md-icon--copy" ${ICON_ATTRS}><rect width="13" height="13" x="9" y="9" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`
const CHECK_ICON = `<svg class="md-icon md-icon--check" ${ICON_ATTRS}><path d="M20 6 9 17l-5-5"/></svg>`

type AlertKind = "note" | "tip" | "important" | "warning" | "caution"

const ALERTS: Record<AlertKind, { label: string; icon: string }> = {
  note: {
    label: "Note",
    icon: `<svg ${ICON_ATTRS}><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>`,
  },
  tip: {
    label: "Tip",
    icon: `<svg ${ICON_ATTRS}><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5a6 6 0 0 0-12 0c0 1.3.5 2.6 1.5 3.5.8.8 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>`,
  },
  important: {
    label: "Important",
    icon: `<svg ${ICON_ATTRS}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M12 7v4"/><path d="M12 15h.01"/></svg>`,
  },
  warning: {
    label: "Warning",
    icon: `<svg ${ICON_ATTRS}><path d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,
  },
  caution: {
    label: "Caution",
    icon: `<svg ${ICON_ATTRS}><path d="M15.3 2a2 2 0 0 1 1.4.6l4.7 4.7a2 2 0 0 1 .6 1.4v6.6a2 2 0 0 1-.6 1.4l-4.7 4.7a2 2 0 0 1-1.4.6H8.7a2 2 0 0 1-1.4-.6l-4.7-4.7a2 2 0 0 1-.6-1.4V8.7a2 2 0 0 1 .6-1.4l4.7-4.7a2 2 0 0 1 1.4-.6z"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>`,
  },
}

const ALERT_MARKER = /^\[!(note|tip|important|warning|caution)\]\s*/i

/**
 * Pulls a leading `[!NOTE]`-style marker off a blockquote's tokens, returning the
 * alert kind plus the remaining body tokens (marker text removed).
 */
function extractAlert(tokens: Tokens.Blockquote["tokens"]) {
  const first = tokens[0]
  if (!first || first.type !== "paragraph") return null

  const inline = (first as Tokens.Paragraph).tokens
  if (!inline || inline.length === 0) return null

  const head = inline[0]
  if (head.type !== "text") return null

  const headText = (head as Tokens.Text).text ?? ""
  const match = ALERT_MARKER.exec(headText)
  if (!match) return null

  const remainder = headText.slice(match[0].length)
  const rest = inline.slice(1)
  while (rest.length > 0 && (rest[0].type === "br" || rest[0].type === "space")) {
    rest.shift()
  }

  const nextInline = remainder
    ? [{ type: "text", raw: remainder, text: remainder } as Tokens.Text, ...rest]
    : rest

  const body = tokens.slice()
  if (nextInline.length > 0) {
    body[0] = { ...(first as Tokens.Paragraph), tokens: nextInline }
  } else {
    body.shift()
  }

  return { kind: match[1].toLowerCase() as AlertKind, body }
}

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/<[^>]*>/g, "")
      .replace(/[^\p{L}\p{N}\s-]/gu, "")
      .trim()
      .replace(/\s+/g, "-") || "section"
  )
}

function alignAttr(align: "center" | "left" | "right" | null) {
  return align ? ` style="text-align:${align}"` : ""
}

function createPreviewRuntime(options: { copyButtons: boolean }) {
  const slugCounts = new Map<string, number>()

  const runtime = new Marked({
    gfm: true,
    breaks: true,
    hooks: {
      preprocess(markdown: string) {
        slugCounts.clear()
        return markdown
      },
    },
    renderer: {
      code({ text, lang }: Tokens.Code) {
        const requested = (lang ?? "").trim().split(/\s+/)[0] ?? ""
        const key = requested.toLowerCase()

        let highlighted: string | null = null
        let resolved = ""

        if (key && hljs.getLanguage(key)) {
          try {
            highlighted = hljs.highlight(text, { language: key, ignoreIllegals: true }).value
            resolved = key
          } catch {
            highlighted = null
          }
        }

        // Unlabelled fences still deserve colour when the language is obvious.
        if (highlighted === null && !key && text.trim().length > 24) {
          try {
            const auto = hljs.highlightAuto(text)
            if (auto.language && auto.relevance >= 8) {
              highlighted = auto.value
              resolved = auto.language
            }
          } catch {
            highlighted = null
          }
        }

        const body = highlighted ?? escapeHtml(text)
        const label = languageLabel(requested || resolved)
        const languageClass = resolved ? ` language-${escapeHtml(resolved)}` : ""
        const copyButton = options.copyButtons
          ? `<button type="button" class="md-code__copy" data-md-copy title="Copy code"><span class="md-code__copy-icons">${COPY_ICON}${CHECK_ICON}</span><span class="md-code__copy-label">Copy</span></button>`
          : ""

        return (
          `<figure class="md-code"${resolved ? ` data-lang="${escapeHtml(resolved)}"` : ""}>` +
          `<figcaption class="md-code__bar"><span class="md-code__lang">${escapeHtml(label)}</span>${copyButton}</figcaption>` +
          `<pre class="md-code__pre"><code class="hljs${languageClass}">${body}</code></pre>` +
          `</figure>`
        )
      },

      blockquote(this: { parser: { parse: (tokens: Tokens.Blockquote["tokens"]) => string } }, { tokens }: Tokens.Blockquote) {
        const alert = extractAlert(tokens)
        if (!alert) {
          return `<blockquote class="md-quote">${this.parser.parse(tokens)}</blockquote>`
        }

        const meta = ALERTS[alert.kind]
        return (
          `<div class="md-alert md-alert--${alert.kind}" role="note">` +
          `<p class="md-alert__head"><span class="md-alert__icon">${meta.icon}</span>${meta.label}</p>` +
          `<div class="md-alert__body">${this.parser.parse(alert.body)}</div>` +
          `</div>`
        )
      },

      heading(
        this: { parser: { parseInline: (tokens: Tokens.Heading["tokens"]) => string } },
        { tokens, depth }: Tokens.Heading,
      ) {
        const inner = this.parser.parseInline(tokens)
        const base = slugify(inner)
        const seen = slugCounts.get(base) ?? 0
        slugCounts.set(base, seen + 1)
        const id = seen === 0 ? base : `${base}-${seen}`
        return `<h${depth} id="${escapeHtml(id)}" class="md-heading md-heading--${depth}">${inner}</h${depth}>`
      },

      table(
        this: { parser: { parseInline: (tokens: Tokens.TableCell["tokens"]) => string } },
        token: Tokens.Table,
      ) {
        const head = token.header
          .map((cell, index) => `<th${alignAttr(token.align[index] ?? null)}>${this.parser.parseInline(cell.tokens)}</th>`)
          .join("")

        const body = token.rows
          .map(
            (row) =>
              `<tr>${row
                .map((cell, index) => `<td${alignAttr(token.align[index] ?? null)}>${this.parser.parseInline(cell.tokens)}</td>`)
                .join("")}</tr>`,
          )
          .join("")

        return `<div class="md-table-wrap"><table class="md-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`
      },

      codespan({ text }: Tokens.Codespan) {
        return `<code class="md-inline-code">${escapeHtml(text)}</code>`
      },

      hr() {
        return `<hr class="md-rule" />`
      },

      link(
        this: { parser: { parseInline: (tokens: Tokens.Link["tokens"]) => string } },
        { href, title, tokens }: Tokens.Link,
      ) {
        const label = this.parser.parseInline(tokens)
        const safe = safeHref(href)
        if (!safe) return label

        const titleAttr = title ? ` title="${escapeHtml(title)}"` : ""
        const isExternal = /^(https?:|mailto:)/i.test(safe)
        const targetAttr = isExternal ? ' target="_blank" rel="noreferrer noopener"' : ""
        return `<a class="md-link" href="${escapeHtml(safe)}"${titleAttr}${targetAttr}>${label}</a>`
      },

      image({ href, title, text }: Tokens.Image) {
        const safe = safeHref(href)
        const alt = escapeHtml(text ?? "")
        if (!safe) return alt

        const titleAttr = title ? ` title="${escapeHtml(title)}"` : ""
        return `<img class="md-image" src="${escapeHtml(safe)}" alt="${alt}"${titleAttr} loading="lazy" />`
      },
    },
  })

  runtime.use(
    markedKatex({
      throwOnError: false,
      output: "html",
      nonStandard: true,
    }),
  )

  return runtime
}

const interactiveRuntime = createPreviewRuntime({ copyButtons: true })
const staticRuntime = createPreviewRuntime({ copyButtons: false })

export function renderMarkdownPreviewHtml(markdown: string, options?: { copyButtons?: boolean }) {
  const runtime = options?.copyButtons === false ? staticRuntime : interactiveRuntime
  return runtime.parse(normalizeLineEndings(markdown), { async: false }) as string
}
