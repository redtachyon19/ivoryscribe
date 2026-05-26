// Drive macOS Finder to recolor a folder's icon to an arbitrary hex.
//
// Earlier iterations of this module tried to map the user's hex onto one
// of Finder's seven preset "color label" indices via AppleScript. That
// only paints the small colored dot next to the folder NAME — the folder
// icon itself stays system-blue. macOS doesn't expose a public "tint the
// folder icon" API, so the only way to actually recolor the icon is to
// install a custom icon image on the folder.
//
// The main-process IPC handler (`fs:setMacFolderIconColor`) does that
// without shipping any image assets: it asks AppKit for the system
// folder icon at runtime via `NSWorkspace.iconForFileType("public.folder")`,
// composites the hex over it with the SourceAtop blend, and hands the
// result to `NSWorkspace.setIcon:forFile:options:`. Result: the same
// folder shape macOS draws, in the user's color. No PNGs in the repo.

/** Tint a folder's macOS Finder icon to a given hex (or null to revert
 *  to the system default). Resolves to true on success, false when the
 *  call short-circuited because we're not on macOS / not in Electron /
 *  the IPC bridge is missing / the AppleScript failed. */
export async function setMacFolderColor(
  absoluteFolderPath: string | null | undefined,
  hex: string | null | undefined,
): Promise<boolean> {
  if (typeof window === "undefined") return false
  const api = window.electronAPI
  if (!api) return false
  if (api.platform !== "darwin") return false
  if (!absoluteFolderPath) return false
  const setter = api.fs?.setMacFolderIconColor
  if (!setter) return false
  try {
    const result = await setter(absoluteFolderPath, hex ?? null)
    return result.ok
  } catch {
    return false
  }
}
