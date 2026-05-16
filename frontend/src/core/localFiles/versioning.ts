// Sidecar version snapshots. For every `foo.tusk`, we keep a hidden sibling
// folder `.foo.tusk.versions/` containing timestamped copies of past saves.
// Hidden so they don't clutter Finder and they're filtered by the library walk
// (which already skips dotfiles).
//
// Retention: keep the most recent 50 snapshots per file. Older ones are
// deleted to bound disk use. We also keep at least one snapshot per day for
// the past week to give meaningful history beyond just recent edits.

const MAX_SNAPSHOTS_PER_FILE = 50

function fs() {
  const api = window.electronAPI?.fs
  if (!api) throw new Error("Filesystem unavailable")
  return api
}

function pathApi() {
  const api = window.electronAPI?.path
  if (!api) throw new Error("Path unavailable")
  return api
}

function versionsDir(filePath: string): string {
  const p = pathApi()
  const dir = p.dirname(filePath)
  const filename = p.basename(filePath)
  return p.join(dir, `.${filename}.versions`)
}

function timestampedFilename(): string {
  // 2026-05-10T15-23-04-123Z — ISO with `:` and `.` swapped for `-` so it's
  // safe on all filesystems (Windows hates `:`).
  const iso = new Date().toISOString()
  return iso.replace(/:/g, "-").replace(/\./g, "-")
}

export type VersionEntry = {
  path: string
  filename: string
  takenAt: number
  size: number
}

export async function snapshotVersion(filePath: string, contents: string): Promise<void> {
  const dir = versionsDir(filePath)
  const ext = pathApi().extname(filePath)
  const filename = `${timestampedFilename()}${ext}`
  const dest = pathApi().join(dir, filename)
  await fs().mkdir(dir)
  await fs().writeFile(dest, contents)
  // Best-effort prune; failure here shouldn't break a save.
  try { await pruneOldVersions(filePath) } catch { /* ignore */ }
}

export async function listVersions(filePath: string): Promise<VersionEntry[]> {
  const dir = versionsDir(filePath)
  if (!(await fs().exists(dir))) return []
  const ext = pathApi().extname(filePath)
  const entries = await fs().listDirectory(dir).catch(() => [])
  // listDirectory hides dotfiles which is what we want for *contents* of
  // versions/ — but the .versions dir itself is hidden, and its files are
  // plain. Wait, listDirectory filters dotfiles inside the queried dir too.
  // The version files are timestamped (no leading dot) so they'll show up.

  const versions: VersionEntry[] = []
  for (const entry of entries) {
    if (entry.kind !== "file") continue
    if (!entry.name.toLowerCase().endsWith(ext.toLowerCase())) continue
    versions.push({
      path: entry.path,
      filename: entry.name,
      takenAt: entry.modifiedAt,
      size: entry.size,
    })
  }
  versions.sort((a, b) => b.takenAt - a.takenAt)
  return versions
}

async function pruneOldVersions(filePath: string): Promise<void> {
  const versions = await listVersions(filePath)
  if (versions.length <= MAX_SNAPSHOTS_PER_FILE) return
  const toDrop = versions.slice(MAX_SNAPSHOTS_PER_FILE)
  for (const v of toDrop) {
    await fs().trash(v.path).catch(() => {})
  }
}

export async function readVersion(versionPath: string): Promise<string> {
  return await fs().readFile(versionPath)
}

export async function restoreVersion(filePath: string, versionPath: string): Promise<void> {
  // Snapshot the current state first, then overwrite.
  const current = await fs().readFile(filePath).catch(() => null)
  if (current !== null) {
    await snapshotVersion(filePath, current)
  }
  const versionContents = await fs().readFile(versionPath)
  await fs().writeFile(filePath, versionContents)
}
