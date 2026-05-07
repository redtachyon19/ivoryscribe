// A recursive tab tree used by the sidebar and PDF export.
export type DocumentTab = {
  id: string
  title: string
  children: DocumentTab[]
}

export type ProjectKind = "Book"

export type Project = {
  id: string
  name: string
  createdAt: string
  kind: ProjectKind
  markdownIds?: string[]
  markdownEditorEnabled?: boolean
  pinboardIds?: string[]
  typewriterIds?: string[]
  color: string
  wallpaperEmojis: string
  folderId: string | null
  rootPosition: "top" | "bottom"
  tabs: DocumentTab[]
  activeId: string | null
  contentById: Record<string, string>
  archivedAt?: string | null
  deletedAt?: string | null
}

type LegacyProjectSnapshot = Omit<Project, "kind"> & {
  kind: "Book" | "Blog"
}

export function getProjectEntryTerms(_kind: ProjectKind) {
  return {
    singular: "Chapter",
    plural: "Chapters",
    untitled: "Untitled Chapter",
  }
}

// Default starter text used for any newly created document tab.
export const DEFAULT_DOCUMENT_CONTENT = "<p></p>"

export function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

// Creates a starter tree for every new project.
export function createInitialTabs(kind: ProjectKind): DocumentTab[] {
  const { singular } = getProjectEntryTerms(kind)

  return [
    {
      id: createId(),
      title: `${singular} 1`,
      children: [],
    },
  ]
}

// Depth-first collection of every tab ID in visual tree order.
export function collectTabIds(tabs: DocumentTab[]): string[] {
  return tabs.flatMap((tab) => [tab.id, ...collectTabIds(tab.children)])
}

function collectValidUniqueIds(tabIds: string[], candidateIds: string[] | undefined) {
  const validIds = new Set(tabIds)
  const seen = new Set<string>()
  const next: string[] = []

  for (const id of candidateIds ?? []) {
    if (!validIds.has(id) || seen.has(id)) {
      continue
    }

    seen.add(id)
    next.push(id)
  }

  return next
}

export function getProjectMarkdownIds(project: Pick<Project, "tabs" | "markdownIds" | "markdownEditorEnabled">) {
  if (Array.isArray(project.markdownIds)) {
    return project.markdownIds
  }

  if (project.markdownEditorEnabled) {
    return collectTabIds(project.tabs)
  }

  return []
}

// Depth-first sequence used for cross-document operations (e.g., PDF export).
export function collectTabSequence(tabs: DocumentTab[]): Array<{ id: string; title: string }> {
  return tabs.flatMap((tab) => [{ id: tab.id, title: tab.title }, ...collectTabSequence(tab.children)])
}

// Initializes editor content storage so each tab has isolated content.
export function createContentById(tabs: DocumentTab[]): Record<string, string> {
  const next: Record<string, string> = {}
  for (const id of collectTabIds(tabs)) {
    next[id] = DEFAULT_DOCUMENT_CONTENT
  }
  return next
}

// Keeps project data consistent after tab structure edits:
// - ensures content exists for new tabs
// - ensures active tab still points to an existing tab
export function normalizeProjectAfterTabs(project: Project, nextTabs: DocumentTab[]): Project {
  const tabIds = collectTabIds(nextTabs)
  const nextContentById = { ...project.contentById }
  const nextPinboardIds = collectValidUniqueIds(tabIds, project.pinboardIds)
  const pinboardIdSet = new Set(nextPinboardIds)
  const nextTypewriterIds = collectValidUniqueIds(tabIds, project.typewriterIds)
  const typewriterIdSet = new Set(nextTypewriterIds)
  const nextMarkdownIds = collectValidUniqueIds(
    tabIds,
    getProjectMarkdownIds({
      tabs: nextTabs,
      markdownIds: project.markdownIds,
      markdownEditorEnabled: project.markdownEditorEnabled,
    }),
  ).filter((id) => !pinboardIdSet.has(id) && !typewriterIdSet.has(id))

  for (const id of tabIds) {
    if (!(id in nextContentById)) {
      nextContentById[id] = DEFAULT_DOCUMENT_CONTENT
    }
  }

  const nextActiveId = project.activeId && tabIds.includes(project.activeId) ? project.activeId : (tabIds[0] ?? null)

  return {
    ...project,
    tabs: nextTabs,
    activeId: nextActiveId,
    pinboardIds: nextPinboardIds,
    typewriterIds: nextTypewriterIds,
    markdownIds: nextMarkdownIds,
    contentById: nextContentById,
  }
}

// Factory for a brand-new project with starter tabs and per-tab content state.
export function createProject(name: string, kind: ProjectKind): Project {
  const tabs = createInitialTabs(kind)
  const color = "#7ea8ff"

  return {
    id: createId(),
    name,
    createdAt: new Date().toISOString(),
    kind,
    markdownIds: [],
    pinboardIds: [],
    typewriterIds: [],
    color,
    wallpaperEmojis: "",
    folderId: null,
    rootPosition: "top",
    tabs,
    activeId: collectTabIds(tabs)[0] ?? null,
    contentById: createContentById(tabs),
  }
}

export function generateUntitledName(projects: Project[], kind: ProjectKind): string {
  const base = `Untitled ${kind}`
  const existingNames = new Set(projects.map((p) => p.name))
  if (!existingNames.has(base)) {
    return base
  }
  let n = 2
  while (existingNames.has(`${base} ${n}`)) {
    n++
  }
  return `${base} ${n}`
}

export function extractCounterFromNames(projects: Project[], kind: ProjectKind) {
  const matcher = /^Book\s+(\d+)$/i
  const max = projects.reduce((currentMax, project) => {
    if (project.kind !== kind) {
      return currentMax
    }

    const normalizedName = /^Blog\s+\d+$/i.test(project.name)
      ? project.name.replace(/^Blog/i, "Book")
      : project.name
    const match = normalizedName.match(matcher)
    if (!match) {
      return currentMax
    }

    const value = Number.parseInt(match[1], 10)
    return Number.isNaN(value) ? currentMax : Math.max(currentMax, value)
  }, 0)

  return max + 1
}

export function isProjectSnapshot(value: unknown): value is LegacyProjectSnapshot {
  if (!value || typeof value !== "object") {
    return false
  }

  const candidate = value as Partial<LegacyProjectSnapshot>
  const rawKind = (candidate as { kind?: unknown }).kind
  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    (rawKind === "Book" || rawKind === "Blog") &&
    Array.isArray(candidate.tabs) &&
    typeof candidate.contentById === "object" &&
    candidate.contentById !== null
  )
}

export function parseProjectFromDocument(documentRecord: { title: string; content: string; metadata: Record<string, unknown> }) {
  try {
    const parsedContent = JSON.parse(documentRecord.content)
    if (!isProjectSnapshot(parsedContent)) {
      return null
    }

    const tabIds = collectTabIds(parsedContent.tabs)
    const normalizedPinboardIds = collectValidUniqueIds(tabIds, parsedContent.pinboardIds)
    const pinboardIdSet = new Set(normalizedPinboardIds)
    const normalizedTypewriterIds = collectValidUniqueIds(tabIds, (parsedContent as { typewriterIds?: string[] }).typewriterIds)
    const typewriterIdSet = new Set(normalizedTypewriterIds)
    const normalizedMarkdownIds = collectValidUniqueIds(
      tabIds,
      getProjectMarkdownIds({
        tabs: parsedContent.tabs,
        markdownIds: parsedContent.markdownIds,
        markdownEditorEnabled: parsedContent.markdownEditorEnabled,
      }),
    ).filter((id) => !pinboardIdSet.has(id) && !typewriterIdSet.has(id))

    const normalizedName = /^Blog\s+\d+$/i.test(parsedContent.name)
      ? parsedContent.name.replace(/^Blog/i, "Book")
      : parsedContent.name

    const { markdownEditorEnabled: _legacyMarkdownMode, ...rest } = parsedContent

    return {
      ...rest,
      kind: "Book",
      name: normalizedName,
      pinboardIds: normalizedPinboardIds,
      typewriterIds: normalizedTypewriterIds,
      markdownIds: normalizedMarkdownIds,
    } satisfies Project
  } catch {
    return null
  }
}

export function collectTabTitles(tabs: Project["tabs"]): string[] {
  return tabs.flatMap((tab) => [tab.title, ...collectTabTitles(tab.children)])
}

export function findTabTitleById(tabs: Project["tabs"], targetId: string): string | null {
  for (const tab of tabs) {
    if (tab.id === targetId) {
      return tab.title
    }

    const nested = findTabTitleById(tab.children, targetId)
    if (nested) {
      return nested
    }
  }

  return null
}

export function buildDuplicateProjectName(baseName: string, existingNames: string[]) {
  const normalizedExistingNames = new Set(existingNames.map((name) => name.trim().toLowerCase()))
  let suffix = 1

  while (true) {
    const candidate = suffix === 1 ? `${baseName} Copy` : `${baseName} Copy ${suffix}`
    if (!normalizedExistingNames.has(candidate.trim().toLowerCase())) {
      return candidate
    }

    suffix += 1
  }
}
