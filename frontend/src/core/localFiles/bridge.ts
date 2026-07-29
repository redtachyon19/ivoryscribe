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

function modeFor(
  tabId: string,
  markdownIds: Set<string>,
  typewriterIds: Set<string>,
  plaintextIds: Set<string>,
): ChapterMode {
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
    versions: file.versions ?? [],
  }
}

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
    versions: file.versions ?? [],
  }
}

export function projectToPresentationFile(project: Project): TuskPresentationFile {
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

export function projectToPlainDocString(project: Project): string {
  const id = project.activeId ?? project.tabs[0]?.id ?? null
  if (!id) return ""
  return project.contentById[id] ?? ""
}

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
