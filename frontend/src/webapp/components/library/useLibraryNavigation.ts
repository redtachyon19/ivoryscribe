import { useEffect, useState } from "react"
import { readLastLibraryLocation, writeLastLibraryLocation } from "../../../core/state/lastLocationStorage"

export type LibrarySection = "library" | "cloud" | "archive" | "trash"

export function useLibraryNavigation() {
  const [librarySection, setLibrarySection] = useState<LibrarySection>("library")
  const [openFolderId, setOpenFolderId] = useState<string | null>(
    () => readLastLibraryLocation()?.folderId ?? null,
  )
  useEffect(() => {
    writeLastLibraryLocation({ folderId: openFolderId })
  }, [openFolderId])
  return { librarySection, setLibrarySection, openFolderId, setOpenFolderId }
}
