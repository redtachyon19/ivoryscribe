// Codec for raw plain-document files: standalone .md and .txt.
//
// There is no XML wrapper — the file *is* the document. `.md` and `.txt`
// differ only in how the editor treats the string, not in storage, so a
// single identity codec serves both. See update.md §2.2 and G5: raw files
// cannot carry metadata (id, cloud-id, color), so they are local-only —
// no cloud overlay, no version sidecar.

export function parsePlainDocFile(raw: string): string {
  return raw
}

export function serializePlainDocFile(content: string): string {
  return content
}
