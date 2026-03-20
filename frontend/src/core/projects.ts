// A recursive tab tree used by the sidebar and PDF export.
export type DocumentTab = {
  id: string
  title: string
  children: DocumentTab[]
}

export type ProjectKind = "Book" | "Blog"

export type Project = {
  id: string
  name: string
  createdAt: string
  kind: ProjectKind
  markdownEditorEnabled?: boolean
  color: string
  wallpaperEmojis: string
  folderId: string | null
  rootPosition: "top" | "bottom"
  tabs: DocumentTab[]
  activeId: string | null
  contentById: Record<string, string>
}

export function getProjectEntryTerms(kind: ProjectKind) {
  if (kind === "Book") {
    return {
      singular: "Chapter",
      plural: "Chapters",
      untitled: "Untitled Chapter",
    }
  }

  return {
    singular: "Post",
    plural: "Posts",
    untitled: "Untitled Post",
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
      children: [
        {
          id: createId(),
          title: `${singular} 1.1`,
          children: [],
        },
      ],
    },
    {
      id: createId(),
      title: `${singular} 2`,
      children: [],
    },
  ]
}

// Depth-first collection of every tab ID in visual tree order.
export function collectTabIds(tabs: DocumentTab[]): string[] {
  return tabs.flatMap((tab) => [tab.id, ...collectTabIds(tab.children)])
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
    contentById: nextContentById,
  }
}

// Factory for a brand-new project with starter tabs and per-tab content state.
export function createProject(name: string, kind: ProjectKind): Project {
  const tabs = createInitialTabs(kind)
  const color = kind === "Book" ? "#7ea8ff" : "#8ad39f"

  return {
    id: createId(),
    name,
    createdAt: new Date().toISOString(),
    kind,
    markdownEditorEnabled: false,
    color,
    wallpaperEmojis: "",
    folderId: null,
    rootPosition: "top",
    tabs,
    activeId: collectTabIds(tabs)[0] ?? null,
    contentById: createContentById(tabs),
  }
}

export function extractCounterFromNames(projects: Project[], kind: ProjectKind) {
  const prefix = kind === "Book" ? "Book" : "Blog"
  const matcher = new RegExp(`^${prefix}\\s+(\\d+)$`, "i")
  const max = projects.reduce((currentMax, project) => {
    if (project.kind !== kind) {
      return currentMax
    }

    const match = project.name.match(matcher)
    if (!match) {
      return currentMax
    }

    const value = Number.parseInt(match[1], 10)
    return Number.isNaN(value) ? currentMax : Math.max(currentMax, value)
  }, 0)

  return max + 1
}

export function isProjectSnapshot(value: unknown): value is Project {
  if (!value || typeof value !== "object") {
    return false
  }

  const candidate = value as Partial<Project>
  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.kind === "string" &&
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

    return parsedContent
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
