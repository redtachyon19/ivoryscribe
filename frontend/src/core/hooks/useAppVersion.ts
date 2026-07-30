import { useEffect, useState } from "react"

export type AppVersionInfo = {
  version: string
  platformLabel: string
}

function platformLabel(): string {
  if (typeof window === "undefined") return "Web"
  const platform = window.electronAPI?.platform
  if (!platform) return "Web"
  if (platform === "darwin") return "Mac"
  if (platform === "win32") return "Windows"
  return "Linux"
}

export function useAppVersion(): AppVersionInfo {
  const [version, setVersion] = useState<string>(__APP_VERSION__)

  useEffect(() => {
    const getVersion = window.electronAPI?.getVersion
    if (!getVersion) return
    let cancelled = false
    void getVersion()
      .then((next) => { if (!cancelled && next) setVersion(next) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  return { version, platformLabel: platformLabel() }
}
