// Remembers where the user was so a reload (or quit-and-reopen) lands them
// back on the same file / folder instead of bouncing to the library home.
//
// Local mode only. We deliberately use localStorage rather than URL params:
// local projects are files on disk addressed by path, not by shareable URL —
// URLs are reserved for cloud / shared documents (the existing `?projectId=`
// deep-link path in useRouting stays for those). See useAppOrchestration and
// Library.tsx for the read/write sites.

const EDITOR_LOCATION_KEY = "ivoryscribe.lastEditorLocation"
const LIBRARY_LOCATION_KEY = "ivoryscribe.lastLibraryLocation"

/** Whether the user was editing a document or browsing the library, and which
 *  project was active. The active *tab* is not stored here — it already
 *  persists inside the project file on disk (`active-chapter-id`), so it comes
 *  back automatically once the right project is reopened. */
export type LastEditorLocation = {
  view: "projects" | "editor"
  projectId: string | null
}

/** The library's own browse position: which folder (if any) was open. */
export type LastLibraryLocation = {
  folderId: string | null
}

function safeStorage(): Storage | null {
  if (typeof window === "undefined") return null
  try {
    return window.localStorage
  } catch {
    // Storage can throw in Safari private mode / file:// contexts.
    return null
  }
}

function readJson<T>(key: string): T | null {
  const storage = safeStorage()
  if (!storage) return null
  try {
    const raw = storage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== "object") return null
    return parsed as T
  } catch {
    return null
  }
}

function writeJson(key: string, value: unknown): void {
  const storage = safeStorage()
  if (!storage) return
  try {
    storage.setItem(key, JSON.stringify(value))
  } catch {
    // Quota / disabled storage — best-effort only.
  }
}

export function readLastEditorLocation(): LastEditorLocation | null {
  return readJson<LastEditorLocation>(EDITOR_LOCATION_KEY)
}

export function writeLastEditorLocation(location: LastEditorLocation): void {
  writeJson(EDITOR_LOCATION_KEY, location)
}

export function readLastLibraryLocation(): LastLibraryLocation | null {
  return readJson<LastLibraryLocation>(LIBRARY_LOCATION_KEY)
}

export function writeLastLibraryLocation(location: LastLibraryLocation): void {
  writeJson(LIBRARY_LOCATION_KEY, location)
}
