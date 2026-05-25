// HTMLRenderer — turns parsed previews into static HTML for QuickLook.
//
// We produce a single self-contained HTML document with inline CSS. The
// QuickLook host renders this in a sandboxed WebKit view, so no remote
// resources, no JavaScript, and no inter-document navigation. Keep it simple.

import Foundation

private let SNIPPET_MAX_CHARS = 280
private let MAX_CHAPTERS_RENDERED = 30
private let MAX_SLIDES_RENDERED = 60

// HTML-escape the bare minimum to keep the preview safe.
private func escapeHTML(_ s: String) -> String {
    var out = ""
    out.reserveCapacity(s.count)
    for ch in s {
        switch ch {
        case "&":  out += "&amp;"
        case "<":  out += "&lt;"
        case ">":  out += "&gt;"
        case "\"": out += "&quot;"
        case "'":  out += "&#39;"
        default:   out.append(ch)
        }
    }
    return out
}

// Strip the markdown / typewriter / plaintext body down to a single-line
// snippet for the preview. We don't try to render markdown — just collapse
// whitespace and truncate.
private func snippet(from body: String, max: Int) -> String {
    let collapsed = body
        .replacingOccurrences(of: "\r\n", with: "\n")
        .components(separatedBy: CharacterSet.newlines)
        .map { $0.trimmingCharacters(in: .whitespaces) }
        .filter { !$0.isEmpty }
        .joined(separator: " ")
    let trimmed = collapsed.trimmingCharacters(in: .whitespacesAndNewlines)
    if trimmed.count <= max { return trimmed }
    let cut = trimmed.index(trimmed.startIndex, offsetBy: max)
    return String(trimmed[..<cut]) + "…"
}

private let baseStyles = """
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif; -webkit-font-smoothing: antialiased; }
  body { padding: 28px 32px; line-height: 1.45; color: #1d1d1f; background: #ffffff; }
  @media (prefers-color-scheme: dark) {
    body { color: #f5f5f7; background: #1c1c1e; }
    .meta { color: #98989d; }
    .item { border-color: #2c2c2e; }
    .snippet { color: #b8b8bd; }
    .kind-pill { background: #2c2c2e; color: #d1d1d6; }
    .empty { color: #98989d; }
  }
  header { display: flex; align-items: baseline; gap: 12px; margin-bottom: 4px; }
  h1 { font-size: 22px; font-weight: 600; margin: 0; letter-spacing: -0.01em; }
  .meta { font-size: 12px; color: #6e6e73; letter-spacing: 0.02em; text-transform: uppercase; }
  ol { list-style: none; padding: 0; margin: 18px 0 0; counter-reset: tusk-counter; }
  .item { padding: 14px 0; border-top: 1px solid #e5e5ea; display: flex; gap: 14px; align-items: flex-start; counter-increment: tusk-counter; }
  .item:first-child { border-top: none; padding-top: 6px; }
  .num { font-variant-numeric: tabular-nums; color: #6e6e73; font-size: 13px; min-width: 24px; padding-top: 1px; }
  .num::before { content: counter(tusk-counter); }
  .body { flex: 1; min-width: 0; }
  .title-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .title { font-size: 15px; font-weight: 500; margin: 0; }
  .kind-pill { font-size: 10px; padding: 2px 6px; border-radius: 4px; background: #f2f2f7; color: #3a3a3c; text-transform: uppercase; letter-spacing: 0.04em; }
  .snippet { font-size: 13px; color: #515156; margin-top: 4px; line-height: 1.4; }
  .empty { font-size: 13px; color: #8e8e93; font-style: italic; margin-top: 24px; }
  .overflow { font-size: 12px; color: #8e8e93; margin-top: 14px; text-align: center; }
</style>
"""

private func htmlPage(title: String, body: String) -> String {
    return """
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <title>\(escapeHTML(title))</title>
      \(baseStyles)
    </head>
    <body>
      \(body)
    </body>
    </html>
    """
}

func renderBookHTML(_ book: TuskBookPreview) -> String {
    let total = book.chapters.count
    let chapterWord = total == 1 ? "chapter" : "chapters"

    var items = ""
    let renderable = book.chapters.prefix(MAX_CHAPTERS_RENDERED)
    for ch in renderable {
        let snip = snippet(from: ch.body, max: SNIPPET_MAX_CHARS)
        let snippetHTML = snip.isEmpty ? "" : "<div class=\"snippet\">\(escapeHTML(snip))</div>"
        let pill = ch.mode == "default" ? "" : "<span class=\"kind-pill\">\(escapeHTML(ch.mode))</span>"
        items += """
        <li class="item">
          <div class="num"></div>
          <div class="body">
            <div class="title-row">
              <p class="title">\(escapeHTML(ch.title))</p>
              \(pill)
            </div>
            \(snippetHTML)
          </div>
        </li>
        """
    }

    let overflow: String
    if total > MAX_CHAPTERS_RENDERED {
        overflow = "<div class=\"overflow\">+ \(total - MAX_CHAPTERS_RENDERED) more chapter(s) not shown</div>"
    } else {
        overflow = ""
    }

    let body: String
    if book.chapters.isEmpty {
        body = """
        <header>
          <h1>\(escapeHTML(book.name))</h1>
          <span class="meta">Book</span>
        </header>
        <p class="empty">No chapters yet.</p>
        """
    } else {
        body = """
        <header>
          <h1>\(escapeHTML(book.name))</h1>
          <span class="meta">Book · \(total) \(chapterWord)</span>
        </header>
        <ol>\(items)</ol>
        \(overflow)
        """
    }

    return htmlPage(title: book.name, body: body)
}

func renderPresentationHTML(_ pres: TuskPresentationPreview) -> String {
    let total = pres.slides.count
    let slideWord = total == 1 ? "slide" : "slides"

    var items = ""
    let renderable = pres.slides.prefix(MAX_SLIDES_RENDERED)
    for slide in renderable {
        items += """
        <li class="item">
          <div class="num"></div>
          <div class="body">
            <div class="title-row">
              <p class="title">\(escapeHTML(slide.title))</p>
            </div>
          </div>
        </li>
        """
    }

    let overflow: String
    if total > MAX_SLIDES_RENDERED {
        overflow = "<div class=\"overflow\">+ \(total - MAX_SLIDES_RENDERED) more slide(s) not shown</div>"
    } else {
        overflow = ""
    }

    let body: String
    if pres.slides.isEmpty {
        body = """
        <header>
          <h1>\(escapeHTML(pres.name))</h1>
          <span class="meta">Presentation</span>
        </header>
        <p class="empty">No slides yet.</p>
        """
    } else {
        body = """
        <header>
          <h1>\(escapeHTML(pres.name))</h1>
          <span class="meta">Presentation · \(total) \(slideWord)</span>
        </header>
        <ol>\(items)</ol>
        \(overflow)
        """
    }

    return htmlPage(title: pres.name, body: body)
}

func renderErrorHTML(_ message: String) -> String {
    let body = """
    <header>
      <h1>Couldn't preview file</h1>
      <span class="meta">Ivoryscribe QuickLook</span>
    </header>
    <p class="empty">\(escapeHTML(message))</p>
    """
    return htmlPage(title: "Preview unavailable", body: body)
}
