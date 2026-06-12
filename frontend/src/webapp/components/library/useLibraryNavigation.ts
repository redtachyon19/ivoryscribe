// Single source of truth for the library's browse position: the active section
// ("library" | "cloud" | "archive" | "trash") AND the open folder within it.
//
// This state is owned by Editor.tsx — the common parent of LibraryRouter
// (which decides which page renders) and the sidebar's ProjectBrowserPanel
// (which decides which tab is highlighted) — and passed to both as props, so
// the two can never desync. Owning `openFolderId` here too (rather than inside
// Library.tsx, which unmounts on the editor view) keeps the open folder alive
// across editor↔library switches and lets the top-bar back/forward history
// record and restore it. There is deliberately no window-event bus.

import { useEffect, useState } from "react"
import { readLastLibraryLocation, writeLastLibraryLocation } from "../../../core/state/lastLocationStorage"

export type LibrarySection = "library" | "cloud" | "archive" | "trash"

export function useLibraryNavigation() {
  const [librarySection, setLibrarySection] = useState<LibrarySection>("library")
  // Seeded from the last session so a reload keeps the user inside the folder
  // they were browsing; persisted whenever it changes (or clears).
  const [openFolderId, setOpenFolderId] = useState<string | null>(
    () => readLastLibraryLocation()?.folderId ?? null,
  )
  useEffect(() => {
    writeLastLibraryLocation({ folderId: openFolderId })
  }, [openFolderId])
  return { librarySection, setLibrarySection, openFolderId, setOpenFolderId }
}
