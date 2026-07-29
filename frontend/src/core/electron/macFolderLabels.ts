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
