// LocalStorage shadow of per-folder metadata (color, iconEmoji, description).
//
// In cloud mode the full ProjectFolder array is persisted as part of
// `uiSettings.folders` via the preferences sync, so this module is a no-op
// safety net. In local mode the on-disk representation of a folder is just
// a directory — there's nowhere to stash the color / icon / description.
// This module fills that gap by keying metadata by folder id; the local
// filesystem sync layers it on top of the directory list it discovers from
// disk on every hydrate.

const STORAGE_KEY = "ivoryscribe.folders.meta.v1"

export type FolderMetaPatch = {
  color?: string | null
  iconEmoji?: string | null
  description?: string
}

type StoredMap = Record<string, FolderMetaPatch>

function storage(): Storage | null {
  if (typeof window === "undefined") return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function read(): StoredMap {
  const s = storage()
  if (!s) return {}
  try {
    const raw = s.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== "object") return {}
    return sanitize(parsed as Record<string, unknown>)
  } catch {
    return {}
  }
}

function write(next: StoredMap): void {
  const s = storage()
  if (!s) return
  try {
    s.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* quota / disabled storage — best-effort */
  }
}

export function getFolderMeta(folderId: string): FolderMetaPatch | null {
  const entry = read()[folderId]
  return entry ?? null
}

export function setFolderMeta(folderId: string, patch: FolderMetaPatch): void {
  const map = read()
  const existing = map[folderId] ?? {}
  const next = { ...existing, ...patch }
  // Strip undefined so subsequent reads get clean fields.
  for (const key of Object.keys(next) as (keyof FolderMetaPatch)[]) {
    if (next[key] === undefined) delete next[key]
  }
  if (Object.keys(next).length === 0) {
    const { [folderId]: _drop, ...rest } = map
    void _drop
    write(rest)
    return
  }
  write({ ...map, [folderId]: next })
}

export function deleteFolderMeta(folderId: string): void {
  const map = read()
  if (!(folderId in map)) return
  const { [folderId]: _drop, ...rest } = map
  void _drop
  write(rest)
}

/** Merge stored metadata onto a freshly-loaded folder list. Folders not
 *  present in storage pass through unchanged. */
export function applyStoredFolderMeta<T extends { id: string }>(folders: T[]): T[] {
  const map = read()
  if (Object.keys(map).length === 0) return folders
  return folders.map((folder) => {
    const meta = map[folder.id]
    return meta ? { ...folder, ...meta } : folder
  })
}

function sanitize(raw: Record<string, unknown>): StoredMap {
  const out: StoredMap = {}
  for (const [id, value] of Object.entries(raw)) {
    if (!value || typeof value !== "object") continue
    const entry: FolderMetaPatch = {}
    const v = value as Record<string, unknown>
    if (typeof v.color === "string" || v.color === null) entry.color = v.color as string | null
    if (typeof v.iconEmoji === "string" || v.iconEmoji === null) entry.iconEmoji = v.iconEmoji as string | null
    if (typeof v.description === "string") entry.description = v.description
    if (Object.keys(entry).length > 0) out[id] = entry
  }
  return out
}
