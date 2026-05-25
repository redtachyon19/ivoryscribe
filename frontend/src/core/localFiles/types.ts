// On-disk representations of the four Tusk-family file types.
// These are the canonical shapes after parse and before serialize — the in-memory
// editor state (Project / PinboardData / etc.) is bridged via the `bridge.ts` module.
//
// File-type model:
//   • .tusk  → Book (chapters + embedded md/txt docs)         — codecBook.ts
//   • .tusks → Presentation (many pinboards, one per slide)   — codecPresentation.ts
//   • .md    → standalone Markdown document                   — codecPlainDoc.ts
//   • .txt   → standalone PlainText document                  — codecPlainDoc.ts
//   • .pdf   → standalone PDF document (read-only, view-only) — no codec; the
//             scanner records the file path and the PDFViewer renders the
//             bytes directly via the binary readFile IPC. PDFs are never
//             written by the app — `serializeProjectForDisk` skips them.
//
// Legacy `.tuskb` (standalone pinboard) and the old HTML-slideshow form of
// `.tusks` are not supported — the scanner ignores them; no migration code.

import type { ProjectKind } from "../utils/projects"

export const FILE_FORMAT_VERSION = 1

export type ChapterMode = "default" | "markdown" | "typewriter" | "plaintext"

export type TuskChapter = {
  id: string
  title: string
  mode: ChapterMode
  content: string
  children: TuskChapter[]
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
}

// ── Presentation (.tusks) ────────────────────────────────────────────────
//
// A presentation is a flat list of pinboards. Each slide is one
// PinboardEditor content string — the codec stores it verbatim and never
// parses the payload.

export type TuskPresentationSlide = {
  id: string
  /** Display label for the slide in the Slides tab list. */
  title: string
  /** Opaque PinboardEditor content string. The codec never parses this. */
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
}

// ── Extensions & kind enum ───────────────────────────────────────────────

export const TUSK_BOOK_EXT = ".tusk"
export const TUSK_PRESENTATION_EXT = ".tusks"
export const MARKDOWN_EXT = ".md"
export const PLAINTEXT_EXT = ".txt"
export const PDF_EXT = ".pdf"

export type TuskFileKind = "book" | "presentation" | "markdown" | "plaintext" | "pdf"

export function kindForExtension(ext: string): TuskFileKind | null {
  switch (ext.toLowerCase()) {
    case TUSK_BOOK_EXT: return "book"
    case TUSK_PRESENTATION_EXT: return "presentation"
    case MARKDOWN_EXT: return "markdown"
    case PLAINTEXT_EXT: return "plaintext"
    case PDF_EXT: return "pdf"
    default: return null
  }
}

export function extensionForKind(kind: TuskFileKind): string {
  switch (kind) {
    case "book": return TUSK_BOOK_EXT
    case "presentation": return TUSK_PRESENTATION_EXT
    case "markdown": return MARKDOWN_EXT
    case "plaintext": return PLAINTEXT_EXT
    case "pdf": return PDF_EXT
  }
}

// ── In-memory ↔ on-disk kind mapping ────────────────────────────────────

const PROJECT_KIND_BY_FILE_KIND: Record<TuskFileKind, ProjectKind> = {
  book: "Book",
  presentation: "Presentation",
  markdown: "Markdown",
  plaintext: "PlainText",
  pdf: "PDF",
}

const FILE_KIND_BY_PROJECT_KIND: Record<ProjectKind, TuskFileKind> = {
  Book: "book",
  Presentation: "presentation",
  Markdown: "markdown",
  PlainText: "plaintext",
  PDF: "pdf",
}

export function projectKindForFileKind(k: TuskFileKind): ProjectKind {
  return PROJECT_KIND_BY_FILE_KIND[k]
}

export function fileKindForProjectKind(k: ProjectKind): TuskFileKind {
  return FILE_KIND_BY_PROJECT_KIND[k]
}
