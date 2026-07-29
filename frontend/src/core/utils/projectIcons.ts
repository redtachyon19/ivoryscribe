import { BookText, FileCode, FileImage, FileQuestion, FileText, FileType, Presentation, type LucideIcon } from "lucide-react"
import type { Project, ProjectKind } from "./projects"

export function iconForProjectKind(kind: ProjectKind): LucideIcon {
  switch (kind) {
    case "Book": return BookText
    case "Presentation": return Presentation
    case "Markdown": return FileCode
    case "PlainText": return FileType
    case "PDF": return FileText
    case "Image": return FileImage
    case "Unknown": return FileQuestion
  }
}

export function iconForTabKind(tabId: string, project: Project): LucideIcon {
  if (project.pdfIds?.includes(tabId)) return FileText
  if (project.imageIds?.includes(tabId)) return FileImage
  if (project.pinboardIds?.includes(tabId)) return Presentation
  if (project.plaintextIds?.includes(tabId)) return FileType
  if (project.markdownIds?.includes(tabId)) return FileCode
  return iconForProjectKind(project.kind)
}
