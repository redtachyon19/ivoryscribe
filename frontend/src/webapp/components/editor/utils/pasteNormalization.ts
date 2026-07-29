export type PasteNormalizationOptions = {
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
