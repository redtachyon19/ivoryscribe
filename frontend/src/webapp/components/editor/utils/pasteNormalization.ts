// Pre-parse normalization for HTML pasted into a TipTap editor.
//
// Pasted content from Google Docs / Word encodes bold/italic/underline as
// inline styles on <span> wrappers, which TipTap's StarterKit doesn't pick
// up as marks. We promote those into standard <strong>/<em>/<u> tags before
// TipTap parses, so structural formatting survives.
//
// Drafting also wants a clean-prose paste (no font-family, color, highlight),
// so it opts into `stripInlineStyles` to remove residual style/class
// attributes and unwrap span/mark/font containers. Typewriter leaves those
// in place so font-family / color marks parse.

export type PasteNormalizationOptions = {
  /** When true, after promoting marks: strip every `style`/`class` attribute
   *  and unwrap every span/mark/font element. Default false. */
  stripInlineStyles?: boolean
}

function styleIsBold(style: string) {
  const m = style.match(/(?:^|;)\s*font-weight\s*:\s*([^;]+)/i)
  if (!m) return false
  const v = m[1].trim().toLowerCase()
  return v === "bold" || v === "bolder" || /^[5-9]\d{2,}$/.test(v)
}

function styleIsItalic(style: string) {
  const m = style.match(/(?:^|;)\s*font-style\s*:\s*([^;]+)/i)
  if (!m) return false
  const v = m[1].trim().toLowerCase()
  return v === "italic" || v === "oblique"
}

function styleIsUnderline(style: string) {
  const m = style.match(/(?:^|;)\s*text-decoration(?:-line)?\s*:\s*([^;]+)/i)
  if (!m) return false
  return m[1].toLowerCase().includes("underline")
}

export function normalizePastedFormatting(
  html: string,
  options: PasteNormalizationOptions = {},
): string {
  if (!html || typeof document === "undefined") return html

  const tmp = document.createElement("div")
  tmp.innerHTML = html

  for (const el of Array.from(tmp.querySelectorAll<HTMLElement>("[style]"))) {
    const style = el.getAttribute("style") || ""
    const wrappers: string[] = []
    if (styleIsBold(style)) wrappers.push("strong")
    if (styleIsItalic(style)) wrappers.push("em")
    if (styleIsUnderline(style)) wrappers.push("u")
    if (wrappers.length === 0) continue

    // Build nested wrapper chain and move the element's existing children
    // inside the innermost wrapper.
    const root = document.createElement(wrappers[0])
    let leaf: HTMLElement = root
    for (let i = 1; i < wrappers.length; i++) {
      const next = document.createElement(wrappers[i])
      leaf.appendChild(next)
      leaf = next
    }
    while (el.firstChild) leaf.appendChild(el.firstChild)
    el.appendChild(root)
  }

  if (options.stripInlineStyles) {
    tmp.querySelectorAll("*").forEach((el) => {
      el.removeAttribute("style")
      el.removeAttribute("class")
    })
    const unwrap = (el: Element) => {
      const parent = el.parentNode
      if (!parent) return
      while (el.firstChild) parent.insertBefore(el.firstChild, el)
      parent.removeChild(el)
    }
    tmp.querySelectorAll("span, mark, font").forEach(unwrap)
  }

  return tmp.innerHTML
}
