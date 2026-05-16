// Bridge between in-memory `Project` (the editor's working shape) and the
// on-disk `TuskBookFile` (XML-serialized book).
//
// In-memory state still uses parallel id arrays (markdownIds, pinboardIds,
// typewriterIds) for backward compat with all existing editor code. The XML
// schema collapses these into a per-chapter `mode` attribute. The bridge
// translates in both directions so we don't have to refactor every editor at
// once — that cleanup lands in a later phase.

import {
  type DocumentTab,
  type Project,
  collectTabIds,
  createId,
  DEFAULT_DOCUMENT_CONTENT,
} from "../utils/projects"
import { FILE_FORMAT_VERSION, type ChapterMode, type TuskBookFile, type TuskChapter } from "./types"

function modeFor(
  tabId: string,
  markdownIds: Set<string>,
  typewriterIds: Set<string>,
): ChapterMode {
  if (typewriterIds.has(tabId)) return "typewriter"
  if (markdownIds.has(tabId)) return "markdown"
  return "default"
}

function tabsToChapters(
  tabs: DocumentTab[],
  contentById: Record<string, string>,
  markdownIds: Set<string>,
  typewriterIds: Set<string>,
): TuskChapter[] {
  return tabs.map((tab) => ({
    id: tab.id,
    title: tab.title,
    mode: modeFor(tab.id, markdownIds, typewriterIds),
    content: contentById[tab.id] ?? DEFAULT_DOCUMENT_CONTENT,
    children: tabsToChapters(tab.children, contentById, markdownIds, typewriterIds),
  }))
}

export function projectToBookFile(project: Project, opts: { cloudId?: string | null } = {}): TuskBookFile {
  const markdownIds = new Set(project.markdownIds ?? [])
  const typewriterIds = new Set(project.typewriterIds ?? [])

  return {
    version: FILE_FORMAT_VERSION,
    id: project.id,
    cloudId: opts.cloudId ?? null,
    created: project.createdAt,
    name: project.name,
    color: project.color,
    wallpaperEmojis: project.wallpaperEmojis,
    rootPosition: project.rootPosition,
    activeChapterId: project.activeId,
    chapters: tabsToChapters(project.tabs, project.contentById, markdownIds, typewriterIds),
  }
}

type Buckets = {
  tabs: DocumentTab[]
  contentById: Record<string, string>
  markdownIds: string[]
  typewriterIds: string[]
}

function chaptersToTabsRecursive(chapters: TuskChapter[], buckets: Buckets): DocumentTab[] {
  return chapters.map((chapter) => {
    buckets.contentById[chapter.id] = chapter.content
    if (chapter.mode === "markdown") buckets.markdownIds.push(chapter.id)
    if (chapter.mode === "typewriter") buckets.typewriterIds.push(chapter.id)
    return {
      id: chapter.id,
      title: chapter.title,
      children: chaptersToTabsRecursive(chapter.children, buckets),
    }
  })
}

export function bookFileToProject(file: TuskBookFile): Project {
  const buckets: Buckets = { tabs: [], contentById: {}, markdownIds: [], typewriterIds: [] }
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
    markdownIds: buckets.markdownIds,
    pinboardIds: [],
    typewriterIds: buckets.typewriterIds,
    color: file.color,
    wallpaperEmojis: file.wallpaperEmojis,
    folderId: null,
    rootPosition: file.rootPosition,
    tabs: buckets.tabs,
    activeId,
    contentById: buckets.contentById,
  }
}

// Factory for a fresh book file with a single starter chapter.
export function createNewBookFile(name: string): TuskBookFile {
  const chapterId = createId()
  return {
    version: FILE_FORMAT_VERSION,
    id: createId(),
    cloudId: null,
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
