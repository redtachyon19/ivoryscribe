export function slugifyFileName(value: string) {
  const trimmed = value.trim().toLowerCase()
  const slug = trimmed
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")

  return slug || "project"
}

export function sanitizeZipEntryName(value: string) {
  const trimmed = value.trim()
  const sanitized = trimmed.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim()
  return sanitized || "project"
}

export function downloadBlob(blob: Blob, fileName: string) {
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = objectUrl
  link.download = fileName

  document.body.appendChild(link)
  link.click()
  link.remove()

  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl)
  }, 0)
}
