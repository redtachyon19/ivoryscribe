export function escapeAttr(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("\n", "&#10;")
}

export function escapeText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
}

export function emitCData(value: string): string {
  if (value.length === 0) return "<![CDATA[]]>"
  const safe = value.replaceAll("]]>", "]]]]><![CDATA[>")
  return `<![CDATA[${safe}]]>`
}

export type AttrMap = Record<string, string | number | boolean | null | undefined>

export function emitAttrs(attrs: AttrMap): string {
  const parts: string[] = []
  for (const key of Object.keys(attrs)) {
    const raw = attrs[key]
    if (raw === undefined || raw === null) continue
    const str = typeof raw === "string" ? raw : String(raw)
    parts.push(`${key}="${escapeAttr(str)}"`)
  }
  return parts.length === 0 ? "" : ` ${parts.join(" ")}`
}

export function indent(depth: number): string {
  return "  ".repeat(depth)
}

export const XML_PROLOG = '<?xml version="1.0" encoding="UTF-8"?>\n'
