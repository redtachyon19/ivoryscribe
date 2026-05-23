// Single source of truth for the active library section
// ("library" | "cloud" | "archive" | "trash").
//
// This state is owned by Editor.tsx — the common parent of LibraryRouter
// (which decides which page renders) and the sidebar's ProjectBrowserPanel
// (which decides which tab is highlighted) — and passed to both as props, so
// the two can never desync. There is deliberately no window-event bus: this
// hook is just the typed useState that owns the one fact.

import { useState } from "react"

export type LibrarySection = "library" | "cloud" | "archive" | "trash"

export function useLibraryNavigation() {
  const [librarySection, setLibrarySection] = useState<LibrarySection>("library")
  return { librarySection, setLibrarySection }
}
