const EDITOR_LOCATION_KEY = "ivoryscribe.lastEditorLocation"
const LIBRARY_LOCATION_KEY = "ivoryscribe.lastLibraryLocation"

export type LastEditorLocation = {
  view: "projects" | "editor"
  projectId: string | null
  // Optional because entries written before this field existed are still on disk.
  tabId?: string | null
}

export type LastLibraryLocation = {
  folderId: string | null
}

function safeStorage(): Storage | null {
  if (typeof window === "undefined") return null
  try {
    return window.localStorage
  } catch {
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
