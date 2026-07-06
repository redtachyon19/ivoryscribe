// Bridge between in-memory `Project` (the editor's working shape) and the
// on-disk file formats (XML for .tusk / .tusks, raw for .md / .txt).
//
// In-memory state uses parallel id arrays (markdownIds, pinboardIds,
// typewriterIds, plaintextIds) so editor code can stay agnostic about how the
// mode is stored. The on-disk schema collapses these into per-chapter `mode`
// attributes (.tusk) or implicit-by-kind (.tusks / .md / .txt). The bridge
// translates both directions.

import {
  DEFAULT_MARGINS,
  type DocumentTab,
  type Margins,
  type Project,
  type ProjectKind,
  collectTabIds,
  collectTabSequence,
  createId,
  DEFAULT_DOCUMENT_CONTENT,
} from "../utils/projects"
import {
  FILE_FORMAT_VERSION,
  type ChapterMode,
  type TuskBookFile,
  type TuskChapter,
  type TuskPresentationFile,
  type TuskPresentationSlide,
} from "./types"

// ── Book bridge ──────────────────────────────────────────────────────────

function modeFor(
  tabId: string,
  markdownIds: Set<string>,
  typewriterIds: Set<string>,
  plaintextIds: Set<string>,
): ChapterMode {
  // Precedence: typewriter → markdown → plaintext → default. Matches
  // normalizeProjectAfterTabs' ordering (which prevents a tab from being in
  // more than one id array). pinboardIds is never populated on Books.
  if (typewriterIds.has(tabId)) return "typewriter"
  if (markdownIds.has(tabId)) return "markdown"
  if (plaintextIds.has(tabId)) return "plaintext"
  return "default"
}

function tabsToChapters(
  tabs: DocumentTab[],
  contentById: Record<string, string>,
  marginsById: Record<string, Margins>,
  markdownIds: Set<string>,
  typewriterIds: Set<string>,
  plaintextIds: Set<string>,
): TuskChapter[] {
  return tabs.map((tab) => ({
    id: tab.id,
    title: tab.title,
    mode: modeFor(tab.id, markdownIds, typewriterIds, plaintextIds),
    content: contentById[tab.id] ?? DEFAULT_DOCUMENT_CONTENT,
    // Only stamp margins onto typewriter chapters — other modes never read
    // them, so leaving them undefined keeps non-typewriter chapters free of
    // meaningless attributes.
    margins: typewriterIds.has(tab.id) ? (marginsById[tab.id] ?? DEFAULT_MARGINS) : undefined,
    children: tabsToChapters(tab.children, contentById, marginsById, markdownIds, typewriterIds, plaintextIds),
  }))
}

export function projectToBookFile(project: Project): TuskBookFile {
  const markdownIds = new Set(project.markdownIds ?? [])
  const typewriterIds = new Set(project.typewriterIds ?? [])
  const plaintextIds = new Set(project.plaintextIds ?? [])

  return {
    version: FILE_FORMAT_VERSION,
    id: project.id,
    created: project.createdAt,
    name: project.name,
    color: project.color,
    wallpaperEmojis: project.wallpaperEmojis,
    rootPosition: project.rootPosition,
    activeChapterId: project.activeId,
    chapters: tabsToChapters(
      project.tabs,
      project.contentById,
      project.marginsById ?? {},
      markdownIds,
      typewriterIds,
      plaintextIds,
    ),
    // Versions roundtrip verbatim — the in-memory representation and the
    // file representation share the ProjectVersion shape.
    versions: project.versions,
  }
}

type Buckets = {
  tabs: DocumentTab[]
  contentById: Record<string, string>
  marginsById: Record<string, Margins>
  markdownIds: string[]
  typewriterIds: string[]
  plaintextIds: string[]
}

function chaptersToTabsRecursive(chapters: TuskChapter[], buckets: Buckets): DocumentTab[] {
  return chapters.map((chapter) => {
    buckets.contentById[chapter.id] = chapter.content
    if (chapter.margins) buckets.marginsById[chapter.id] = chapter.margins
    if (chapter.mode === "markdown") buckets.markdownIds.push(chapter.id)
    if (chapter.mode === "typewriter") buckets.typewriterIds.push(chapter.id)
    if (chapter.mode === "plaintext") buckets.plaintextIds.push(chapter.id)
    return {
      id: chapter.id,
      title: chapter.title,
      children: chaptersToTabsRecursive(chapter.children, buckets),
    }
  })
}

export function bookFileToProject(file: TuskBookFile): Project {
  const buckets: Buckets = {
    tabs: [],
    contentById: {},
    marginsById: {},
    markdownIds: [],
    typewriterIds: [],
    plaintextIds: [],
  }
  buckets.tabs = chaptersToTabsRecursive(file.chapters, buckets)

  const tabIds = collectTabIds(buckets.tabs)
  const activeId = file.activeChapterId && tabIds.includes(file.activeChapterId)
    ? file.activeChapterId
    : (tabIds[0] ?? null)

  return {
    id: file.id,
    name: file.name,
    createdAt: file.created,
    kind: "Book",
    // Bridge functions in this module only ever build projects from
    // on-disk files, so the source is always local. Cloud projects
    // come from useCloudHydration (separate module).
    source: "local",
    markdownIds: buckets.markdownIds,
    pinboardIds: [],
    typewriterIds: buckets.typewriterIds,
    plaintextIds: buckets.plaintextIds,
    color: file.color,
    wallpaperEmojis: file.wallpaperEmojis,
    folderId: null,
    rootPosition: file.rootPosition,
    tabs: buckets.tabs,
    activeId,
    contentById: buckets.contentById,
    marginsById: buckets.marginsById,
    // Carry the embedded history forward. v1 files (no <versions> block)
    // arrive here as []; the autosave/manual paths begin populating it on
    // the next save.
    versions: file.versions ?? [],
  }
}

// Factory for a fresh book file with a single starter chapter.
export function createNewBookFile(name: string): TuskBookFile {
  const chapterId = createId()
  return {
    version: FILE_FORMAT_VERSION,
    id: createId(),
    created: new Date().toISOString(),
    name,
    color: "#7ea8ff",
    wallpaperEmojis: "",
    rootPosition: "top",
    activeChapterId: chapterId,
    chapters: [
      {
        id: chapterId,
        title: "Chapter 1",
        mode: "default",
        content: DEFAULT_DOCUMENT_CONTENT,
        children: [],
      },
    ],
  }
}

// ── Presentation bridge ──────────────────────────────────────────────────

export function presentationFileToProject(file: TuskPresentationFile): Project {
  const tabs: DocumentTab[] = file.slides.map((slide) => ({
    id: slide.id,
    title: slide.title,
    children: [],
  }))
  const contentById: Record<string, string> = {}
  for (const slide of file.slides) {
    contentById[slide.id] = slide.board
  }

  const tabIds = tabs.map((t) => t.id)
  const activeId = file.activeSlideId && tabIds.includes(file.activeSlideId)
    ? file.activeSlideId
    : (tabIds[0] ?? null)

  return {
    id: file.id,
    name: file.name,
    createdAt: file.created,
    kind: "Presentation",
    source: "local",
    markdownIds: [],
    pinboardIds: tabIds,
    typewriterIds: [],
    plaintextIds: [],
    color: file.color,
    wallpaperEmojis: "",
    folderId: null,
    rootPosition: "top",
    tabs,
    activeId,
    contentById,
    // See codecBook bridge — versions roundtrip verbatim, missing => [].
    versions: file.versions ?? [],
  }
}

export function projectToPresentationFile(project: Project): TuskPresentationFile {
  // Defensive flatten — Presentations should not have nested tabs (G3), but
  // if a nested tree slipped through we linearize via collectTabSequence so
  // every slide still makes it to disk.
  const flat = collectTabSequence(project.tabs)
  const slides: TuskPresentationSlide[] = flat.map((tab) => ({
    id: tab.id,
    title: tab.title,
    board: project.contentById[tab.id] ?? "",
  }))

  return {
    version: FILE_FORMAT_VERSION,
    id: project.id,
    created: project.createdAt,
    name: project.name,
    color: project.color,
    activeSlideId: project.activeId,
    slides,
    versions: project.versions,
  }
}

export function createNewPresentationFile(name: string): TuskPresentationFile {
  const slideId = createId()
  return {
    version: FILE_FORMAT_VERSION,
    id: createId(),
    created: new Date().toISOString(),
    name,
    color: "#ef4444",
    activeSlideId: slideId,
    slides: [
      { id: slideId, title: "Slide 1", board: "" },
    ],
  }
}

// ── Plain-doc bridge (.md / .txt) ────────────────────────────────────────

/** Convert a raw .md or .txt file body into a single-tab Project. The
 *  filename (without extension) becomes the project name. `kind` selects
 *  Markdown vs PlainText, which determines which id array claims the
 *  synthetic tab and therefore which editor renders. */
export function plainDocFileToProject(
  raw: string,
  kind: "Markdown" | "PlainText",
  opts: { name: string; id?: string; createdAt?: string; color?: string },
): Project {
  const tabId = createId()
  const projectKind: ProjectKind = kind
  return {
    id: opts.id ?? createId(),
    name: opts.name,
    createdAt: opts.createdAt ?? new Date().toISOString(),
    kind: projectKind,
    source: "local",
    markdownIds:  kind === "Markdown"  ? [tabId] : [],
    pinboardIds:  [],
    typewriterIds: [],
    plaintextIds: kind === "PlainText" ? [tabId] : [],
    color: opts.color ?? (kind === "Markdown" ? "#a78bfa" : "#9ca3af"),
    wallpaperEmojis: "",
    folderId: null,
    rootPosition: "top",
    tabs: [{ id: tabId, title: opts.name, children: [] }],
    activeId: tabId,
    contentById: { [tabId]: raw },
  }
}

/** Inverse: returns the content string we should write to disk for a
 *  single-doc project. Falls back to the first tab's content if `activeId`
 *  is stale. Empty string if the project has no tabs (shouldn't happen). */
export function projectToPlainDocString(project: Project): string {
  const id = project.activeId ?? project.tabs[0]?.id ?? null
  if (!id) return ""
  return project.contentById[id] ?? ""
}

// ── PDF bridge ───────────────────────────────────────────────────────────
//
// PDFs are read-only — we never write them and never parse their bytes.
// `pdfFileToProject` records the file's path RELATIVE to the workspace
// root (not absolute). The viewer joins it with the current workspace
// root from settings at render time, so the path is always derived from
// live state and switching workspace folders automatically reroots
// every PDF. There's no `projectToPdf…` counterpart.

/** Build a single-tab Project pointing at a PDF on disk. The
 *  `relativePath` is the file's location relative to the workspace
 *  root (e.g. `"Subfolder/foo.pdf"`); stored in `contentById[tabId]`
 *  as the sentinel the PDFViewer reads. */
export function pdfFileToProject(
  relativePath: string,
  opts: { name: string; id?: string; createdAt?: string; color?: string },
): Project {
  const tabId = createId()
  return {
    id: opts.id ?? createId(),
    name: opts.name,
    createdAt: opts.createdAt ?? new Date().toISOString(),
    kind: "PDF",
    source: "local",
    markdownIds:   [],
    pinboardIds:   [],
    typewriterIds: [],
    plaintextIds:  [],
    pdfIds:        [tabId],
    color: opts.color ?? "#f97316",
    wallpaperEmojis: "",
    folderId: null,
    rootPosition: "top",
    tabs: [{ id: tabId, title: opts.name, children: [] }],
    activeId: tabId,
    contentById: { [tabId]: relativePath },
  }
}

// ── Image bridge ─────────────────────────────────────────────────────────
//
// PNG / JPEG files mirror PDFs almost exactly — they're read-only, the
// app never writes their bytes, and the Project stores a path RELATIVE
// to the workspace root in `contentById[tabId]`. The ImageViewer joins
// that with the live workspace root at render time, so switching
// workspaces in settings automatically reroots every image.

/** Build a single-tab Project pointing at an image on disk. The
 *  `relativePath` is the file's location relative to the workspace
 *  root (e.g. `"Assets/photo.png"`). */
export function imageFileToProject(
  relativePath: string,
  opts: { name: string; id?: string; createdAt?: string; color?: string },
): Project {
  const tabId = createId()
  return {
    id: opts.id ?? createId(),
    name: opts.name,
    createdAt: opts.createdAt ?? new Date().toISOString(),
    kind: "Image",
    source: "local",
    markdownIds:   [],
    pinboardIds:   [],
    typewriterIds: [],
    plaintextIds:  [],
    pdfIds:        [],
    imageIds:      [tabId],
    color: opts.color ?? "#10b981",
    wallpaperEmojis: "",
    folderId: null,
    rootPosition: "top",
    tabs: [{ id: tabId, title: opts.name, children: [] }],
    activeId: tabId,
    contentById: { [tabId]: relativePath },
  }
}

// ── Unknown bridge ───────────────────────────────────────────────────────
//
// Files whose extension the app has no editor for still show up in the
// library so the user can see / drag / delete / move them — they just
// can't be opened or renamed. We never read or write their bytes; we
// just track the on-disk path in the hook's fileMetaRef. The Project
// itself carries no tabs / contentById data — the card branches on
// kind === "Unknown" to skip the entry-count line, and EditorWorkspace
// never mounts for these because clicks are gated off.

/** Build a "shell" Project for an unsupported file. `name` is the full
 *  basename (with extension) so the user can see what file it is. */
export function unknownFileToProject(
  opts: { name: string; id?: string; createdAt?: string },
): Project {
  return {
    id: opts.id ?? createId(),
    name: opts.name,
    createdAt: opts.createdAt ?? new Date().toISOString(),
    kind: "Unknown",
    source: "local",
    markdownIds:   [],
    pinboardIds:   [],
    typewriterIds: [],
    plaintextIds:  [],
    pdfIds:        [],
    color: "#9ca3af",
    wallpaperEmojis: "",
    folderId: null,
    rootPosition: "top",
    tabs: [],
    activeId: null,
    contentById: {},
  }
}
