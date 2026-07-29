import type { Margins, ProjectKind, ProjectVersion } from "../utils/projects"

export const FILE_FORMAT_VERSION = 2

export type ChapterMode = "default" | "markdown" | "typewriter" | "plaintext"

export type TuskChapter = {
  id: string
  title: string
  mode: ChapterMode
  content: string
  children: TuskChapter[]
  margins?: Margins
}

export type TuskBookFile = {
  version: number
  id: string
  created: string
  name: string
  color: string
  wallpaperEmojis: string
  rootPosition: "top" | "bottom"
  activeChapterId: string | null
  chapters: TuskChapter[]
  versions?: ProjectVersion[]
  previewPdf?: string
}

export type TuskPresentationSlide = {
  id: string
  title: string
  board: string
}

export type TuskPresentationFile = {
  version: number
  id: string
  created: string
  name: string
  color: string
  activeSlideId: string | null
  slides: TuskPresentationSlide[]
  versions?: ProjectVersion[]
}

export const TUSK_BOOK_EXT = ".tusk"
export const TUSK_PRESENTATION_EXT = ".tusks"
export const MARKDOWN_EXT = ".md"
export const PLAINTEXT_EXT = ".txt"
export const PDF_EXT = ".pdf"
export const PNG_EXT = ".png"
export const JPG_EXT = ".jpg"
export const JPEG_EXT = ".jpeg"

export type TuskFileKind = "book" | "presentation" | "markdown" | "plaintext" | "pdf" | "image" | "unknown"

export function kindForExtension(ext: string): TuskFileKind | null {
  switch (ext.toLowerCase()) {
    case TUSK_BOOK_EXT: return "book"
    case TUSK_PRESENTATION_EXT: return "presentation"
    case MARKDOWN_EXT: return "markdown"
    case PLAINTEXT_EXT: return "plaintext"
    case PDF_EXT: return "pdf"
    case PNG_EXT:
    case JPG_EXT:
    case JPEG_EXT:
      return "image"
    default: return null
  }
}

export function kindForExtensionOrUnknown(ext: string): TuskFileKind {
  return kindForExtension(ext) ?? "unknown"
}

export function extensionForKind(kind: TuskFileKind): string {
  switch (kind) {
    case "book": return TUSK_BOOK_EXT
    case "presentation": return TUSK_PRESENTATION_EXT
    case "markdown": return MARKDOWN_EXT
    case "plaintext": return PLAINTEXT_EXT
    case "pdf": return PDF_EXT
    case "image":
      throw new Error("extensionForKind: 'image' has no canonical extension — read it from meta.filePath")
    case "unknown":
      throw new Error("extensionForKind: 'unknown' has no canonical extension")
  }
}

const PROJECT_KIND_BY_FILE_KIND: Record<TuskFileKind, ProjectKind> = {
  book: "Book",
  presentation: "Presentation",
  markdown: "Markdown",
  plaintext: "PlainText",
  pdf: "PDF",
  image: "Image",
  unknown: "Unknown",
}

const FILE_KIND_BY_PROJECT_KIND: Record<ProjectKind, TuskFileKind> = {
  Book: "book",
  Presentation: "presentation",
  Markdown: "markdown",
  PlainText: "plaintext",
  PDF: "pdf",
  Image: "image",
  Unknown: "unknown",
}

export function projectKindForFileKind(k: TuskFileKind): ProjectKind {
  return PROJECT_KIND_BY_FILE_KIND[k]
}

export function fileKindForProjectKind(k: ProjectKind): TuskFileKind {
  return FILE_KIND_BY_PROJECT_KIND[k]
}
