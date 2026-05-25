// Per-kind icon resolver. Keep all callsites that show a project icon going
// through this function (and `iconForTabKind` below) so adding/swapping a
// kind needs exactly one edit.
//
// House style (locked in across the app):
//   • Markdown   → FileCode
//   • PlainText  → FileType
//   • PDF        → FileText
//   • Book       → BookText
//   • Presentation → Presentation
//
// Anything that visually represents a document/tab/project file type MUST
// use one of these. Do not introduce new icons for these kinds.

import { BookText, FileCode, FileText, FileType, Presentation, type LucideIcon } from "lucide-react"
import type { Project, ProjectKind } from "./projects"

export function iconForProjectKind(kind: ProjectKind): LucideIcon {
  switch (kind) {
    case "Book": return BookText
    case "Presentation": return Presentation
    case "Markdown": return FileCode
    case "PlainText": return FileType
    case "PDF": return FileText
  }
}

/** Per-tab icon resolver. Mirrors the project-kind palette but resolves
 *  per individual document tab — a Book can have prose chapters, markdown
 *  tabs, plaintext tabs, etc. mixed together, and each tab should show
 *  the icon for its own renderer. Prose chapters fall back to the parent
 *  project's kind icon (e.g. a chapter in a Book → BookText). */
export function iconForTabKind(tabId: string, project: Project): LucideIcon {
  if (project.pdfIds?.includes(tabId)) return FileText
  if (project.pinboardIds?.includes(tabId)) return Presentation
  if (project.plaintextIds?.includes(tabId)) return FileType
  if (project.markdownIds?.includes(tabId)) return FileCode
  return iconForProjectKind(project.kind)
}
