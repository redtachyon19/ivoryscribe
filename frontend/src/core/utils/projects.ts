export type DocumentTab = {
  id: string
  title: string
  children: DocumentTab[]
}

export type ProjectKind = "Book" | "Presentation" | "Markdown" | "PlainText" | "PDF" | "Image" | "Unknown"

export type ProjectSource = "local" | "cloud"

export type ProjectVersionKind = "manual" | "autosave"

export type ProjectVersion = {
  id: string
  label: string
  kind: ProjectVersionKind
  savedAt: string
  wordCount: number
  snapshot: string
}

export type Margins = { top: number; bottom: number; left: number; right: number }

export const DEFAULT_MARGINS: Margins = { top: 1, bottom: 1, left: 1, right: 1 }

export type Project = {
  id: string
  name: string
  createdAt: string
  kind: ProjectKind
  source?: ProjectSource
  markdownIds?: string[]
  markdownEditorEnabled?: boolean
  pinboardIds?: string[]
  typewriterIds?: string[]
  plaintextIds?: string[]
  pdfIds?: string[]
  imageIds?: string[]
  color: string
  wallpaperEmojis: string
  folderId: string | null
  rootPosition: "top" | "bottom"
  tabs: DocumentTab[]
  activeId: string | null
  contentById: Record<string, string>
  marginsById?: Record<string, Margins>
  archivedAt?: string | null
  deletedAt?: string | null
  versions?: ProjectVersion[]
}

export const AUTOSAVE_WORD_DELTA = 500

export function projectKindSupportsVersions(kind: ProjectKind): boolean {
  return kind === "Book" || kind === "Presentation"
}

type LegacyProjectSnapshot = Omit<Project, "kind"> & {
  kind: ProjectKind | "Blog"
}

export function isSingleDocumentKind(kind: ProjectKind): boolean {
  return kind === "Markdown" || kind === "PlainText" || kind === "PDF" || kind === "Image" || kind === "Unknown"
}

export function isReadOnlyKind(kind: ProjectKind): boolean {
  return kind === "PDF" || kind === "Image" || kind === "Unknown"
}

export function isUnopenableKind(kind: ProjectKind): boolean {
  return kind === "Unknown"
}

export type ProjectEntryTerms = {
  singular: string
  plural: string
  untitled: string
}

const ENTRY_TERMS_BY_KIND: Record<ProjectKind, ProjectEntryTerms> = {
  Book:         { singular: "Chapter",  plural: "Chapters",  untitled: "Untitled Chapter" },
  Presentation: { singular: "Slide",    plural: "Slides",    untitled: "Untitled Slide" },
  Markdown:     { singular: "Document", plural: "Documents", untitled: "Untitled Document" },
  PlainText:    { singular: "Document", plural: "Documents", untitled: "Untitled Document" },
  PDF:          { singular: "Document", plural: "Documents", untitled: "Untitled PDF" },
  Image:        { singular: "Image",    plural: "Images",    untitled: "Untitled Image" },
  Unknown:      { singular: "File",     plural: "Files",     untitled: "Untitled File" },
}

export function getProjectEntryTerms(kind: ProjectKind): ProjectEntryTerms {
  return ENTRY_TERMS_BY_KIND[kind]
}

export const DEFAULT_DOCUMENT_CONTENT = "<p></p>"

export function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

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

export function collectTabSequence(tabs: DocumentTab[]): Array<{ id: string; title: string }> {
  return tabs.flatMap((tab) => [{ id: tab.id, title: tab.title }, ...collectTabSequence(tab.children)])
}

export function createContentById(tabs: DocumentTab[]): Record<string, string> {
  const next: Record<string, string> = {}
  for (const id of collectTabIds(tabs)) {
    next[id] = DEFAULT_DOCUMENT_CONTENT
  }
  return next
}

export function normalizeProjectAfterTabs(project: Project, nextTabs: DocumentTab[]): Project {
  const tabIds = collectTabIds(nextTabs)
  const nextContentById = { ...project.contentById }
  const nextPinboardIds = collectValidUniqueIds(tabIds, project.pinboardIds)
  const pinboardIdSet = new Set(nextPinboardIds)
  const nextTypewriterIds = collectValidUniqueIds(tabIds, project.typewriterIds)
    .filter((id) => !pinboardIdSet.has(id))
  const typewriterIdSet = new Set(nextTypewriterIds)
  const nextPdfIds = collectValidUniqueIds(tabIds, project.pdfIds)
    .filter((id) => !pinboardIdSet.has(id) && !typewriterIdSet.has(id))
  const pdfIdSet = new Set(nextPdfIds)
  const nextImageIds = collectValidUniqueIds(tabIds, project.imageIds)
    .filter((id) => !pinboardIdSet.has(id) && !typewriterIdSet.has(id) && !pdfIdSet.has(id))
  const imageIdSet = new Set(nextImageIds)
  const nextPlaintextIds = collectValidUniqueIds(tabIds, project.plaintextIds)
    .filter((id) => !pinboardIdSet.has(id) && !typewriterIdSet.has(id) && !pdfIdSet.has(id) && !imageIdSet.has(id))
  const plaintextIdSet = new Set(nextPlaintextIds)
  const nextMarkdownIds = collectValidUniqueIds(
    tabIds,
    getProjectMarkdownIds({
      tabs: nextTabs,
      markdownIds: project.markdownIds,
      markdownEditorEnabled: project.markdownEditorEnabled,
    }),
  ).filter((id) => !pinboardIdSet.has(id) && !typewriterIdSet.has(id) && !pdfIdSet.has(id) && !imageIdSet.has(id) && !plaintextIdSet.has(id))

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
    plaintextIds: nextPlaintextIds,
    pdfIds: nextPdfIds,
    imageIds: nextImageIds,
    markdownIds: nextMarkdownIds,
    contentById: nextContentById,
  }
}

export function createProject(name: string, kind: ProjectKind): Project {
  if (kind === "Unknown") {
    throw new Error("createProject: 'Unknown' projects are only built via the local-FS hydrate path")
  }
  if (kind === "Image") {
    throw new Error("createProject: 'Image' projects are only built via the local-FS hydrate path")
  }
  const tabs = createInitialTabs(kind)
  const firstId = collectTabIds(tabs)[0] ?? null
  const color = ({
    Book: "#7ea8ff",
    Presentation: "#ef4444",
    Markdown: "#a78bfa",
    PlainText: "#9ca3af",
    PDF: "#f97316",
    Image: "#10b981",
    Unknown: "#9ca3af",
  } satisfies Record<ProjectKind, string>)[kind]

  return {
    id: createId(),
    name,
    createdAt: new Date().toISOString(),
    kind,
    source: "local",
    markdownIds:   kind === "Markdown"     && firstId ? [firstId] : [],
    pinboardIds:   kind === "Presentation" && firstId ? [firstId] : [],
    plaintextIds:  kind === "PlainText"    && firstId ? [firstId] : [],
    pdfIds:        kind === "PDF"          && firstId ? [firstId] : [],
    typewriterIds: [],
    color,
    wallpaperEmojis: "",
    folderId: null,
    rootPosition: "top",
    tabs,
    activeId: firstId,
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

const KNOWN_PROJECT_KINDS: ReadonlySet<ProjectKind | "Blog"> = new Set([
  "Book", "Presentation", "Markdown", "PlainText", "PDF", "Blog",
])

export function isProjectSnapshot(value: unknown): value is LegacyProjectSnapshot {
  if (!value || typeof value !== "object") {
    return false
  }

  const candidate = value as Partial<LegacyProjectSnapshot>
  const rawKind = (candidate as { kind?: unknown }).kind
  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    typeof rawKind === "string" &&
    KNOWN_PROJECT_KINDS.has(rawKind as ProjectKind | "Blog") &&
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
      .filter((id) => !pinboardIdSet.has(id))
    const typewriterIdSet = new Set(normalizedTypewriterIds)
    const normalizedPdfIds = collectValidUniqueIds(tabIds, (parsedContent as { pdfIds?: string[] }).pdfIds)
      .filter((id) => !pinboardIdSet.has(id) && !typewriterIdSet.has(id))
    const pdfIdSet = new Set(normalizedPdfIds)
    const normalizedPlaintextIds = collectValidUniqueIds(tabIds, (parsedContent as { plaintextIds?: string[] }).plaintextIds)
      .filter((id) => !pinboardIdSet.has(id) && !typewriterIdSet.has(id) && !pdfIdSet.has(id))
    const plaintextIdSet = new Set(normalizedPlaintextIds)
    const normalizedMarkdownIds = collectValidUniqueIds(
      tabIds,
      getProjectMarkdownIds({
        tabs: parsedContent.tabs,
        markdownIds: parsedContent.markdownIds,
        markdownEditorEnabled: parsedContent.markdownEditorEnabled,
      }),
    ).filter((id) => !pinboardIdSet.has(id) && !typewriterIdSet.has(id) && !pdfIdSet.has(id) && !plaintextIdSet.has(id))

    const normalizedName = /^Blog\s+\d+$/i.test(parsedContent.name)
      ? parsedContent.name.replace(/^Blog/i, "Book")
      : parsedContent.name

    // TODO: full cloud/web support for Presentation/Markdown/PlainText
    const rawKind = (parsedContent as { kind: ProjectKind | "Blog" }).kind
    const resolvedKind: ProjectKind =
      rawKind === "Blog" ? "Book"
      : rawKind === "Presentation" || rawKind === "Markdown" || rawKind === "PlainText" || rawKind === "PDF" ? rawKind
      : "Book"

    const { markdownEditorEnabled: _legacyMarkdownMode, ...rest } = parsedContent

    return {
      ...rest,
      kind: resolvedKind,
      name: normalizedName,
      pinboardIds: normalizedPinboardIds,
      typewriterIds: normalizedTypewriterIds,
      plaintextIds: normalizedPlaintextIds,
      pdfIds: normalizedPdfIds,
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

export function findTabPathById(
  tabs: Project["tabs"],
  targetId: string,
  ancestors: Array<{ id: string; title: string }> = [],
): Array<{ id: string; title: string }> | null {
  for (const tab of tabs) {
    const nextAncestors = [...ancestors, { id: tab.id, title: tab.title }]
    if (tab.id === targetId) {
      return nextAncestors
    }

    const nestedPath = findTabPathById(tab.children, targetId, nextAncestors)
    if (nestedPath) {
      return nestedPath
    }
  }

  return null
}

export function renameTabTitle(tabs: Project["tabs"], targetId: string, nextTitle: string): Project["tabs"] {
  return tabs.map((tab) => {
    if (tab.id === targetId) {
      return {
        ...tab,
        title: nextTitle,
      }
    }

    return {
      ...tab,
      children: renameTabTitle(tab.children, targetId, nextTitle),
    }
  })
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function collectEntryNumbers(tabs: Project["tabs"], singular: string): number[] {
  const matcher = new RegExp(`^${escapeRegex(singular)}\\s+(\\d+)$`, "i")

  return tabs.flatMap((tab) => {
    const match = tab.title.match(matcher)
    const current = match ? [Number.parseInt(match[1], 10)] : []
    return [...current, ...collectEntryNumbers(tab.children, singular)]
  })
}

export function getNextEntryName(tabs: Project["tabs"], singular: string): string {
  const used = new Set(collectEntryNumbers(tabs, singular))
  let candidate = 1

  while (used.has(candidate)) {
    candidate += 1
  }

  return `${singular} ${candidate}`
}

export function setActiveTabContent(project: Project, nextContent: string): Project {
  if (!project.activeId) return project
  return {
    ...project,
    contentById: { ...project.contentById, [project.activeId]: nextContent },
  }
}

export function setTabContentById(project: Project, documentId: string | null, nextContent: string): Project {
  if (!documentId || !(documentId in project.contentById)) return project
  return {
    ...project,
    contentById: { ...project.contentById, [documentId]: nextContent },
  }
}

export function getTabMargins(project: Project, documentId: string | null): Margins {
  if (!documentId) return DEFAULT_MARGINS
  return project.marginsById?.[documentId] ?? DEFAULT_MARGINS
}

export function setTabMarginsById(project: Project, documentId: string | null, nextMargins: Margins): Project {
  if (!documentId) return project
  return {
    ...project,
    marginsById: { ...project.marginsById, [documentId]: nextMargins },
  }
}

const HTML_TAG_PATTERN = /<\/?[a-z][^>]*>/gi
const WORD_PATTERN = /[\p{L}\p{N}'']+/gu

function stripHtml(value: string): string {
  return value.replace(HTML_TAG_PATTERN, " ")
}

function countWordsInText(value: string): number {
  if (!value) return 0
  const text = value.includes("<") ? stripHtml(value) : value
  const matches = text.match(WORD_PATTERN)
  return matches ? matches.length : 0
}

export function countProjectWords(project: Project): number {
  let total = 0
  for (const value of Object.values(project.contentById)) {
    if (typeof value !== "string") continue
    total += countWordsInText(value)
  }
  return total
}

const ROMAN_NUMERALS: ReadonlyArray<readonly [number, string]> = [
  [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"],
  [100,  "C"], [90,  "XC"], [50,  "L"], [40,  "XL"],
  [10,   "X"], [9,   "IX"], [5,   "V"], [4,   "IV"],
  [1,    "I"],
]

export function toRomanNumeral(value: number): string {
  if (value <= 0 || !Number.isFinite(value)) return ""
  let remaining = Math.floor(value)
  let result = ""
  for (const [digit, glyph] of ROMAN_NUMERALS) {
    while (remaining >= digit) {
      result += glyph
      remaining -= digit
    }
  }
  return result
}

export function nextManualVersionLabel(versions: ReadonlyArray<ProjectVersion>): string {
  const manualCount = versions.reduce((n, v) => v.kind === "manual" ? n + 1 : n, 0)
  return toRomanNumeral(manualCount + 1)
}

export function nextAutosaveVersionLabel(versions: ReadonlyArray<ProjectVersion>): string {
  const autosaveCount = versions.reduce((n, v) => v.kind === "autosave" ? n + 1 : n, 0)
  return String(autosaveCount + 1)
}

export function projectWithoutVersions(project: Project): Project {
  if (!project.versions) return project
  const { versions: _versions, ...rest } = project
  return rest
}

export function createProjectVersion(project: Project, kind: ProjectVersionKind): ProjectVersion {
  const existingVersions = project.versions ?? []
  const label = kind === "manual"
    ? nextManualVersionLabel(existingVersions)
    : nextAutosaveVersionLabel(existingVersions)
  return {
    id: createId(),
    label,
    kind,
    savedAt: new Date().toISOString(),
    wordCount: countProjectWords(project),
    snapshot: JSON.stringify(projectWithoutVersions(project)),
  }
}

export function appendProjectVersion(project: Project, version: ProjectVersion): Project {
  return {
    ...project,
    versions: [version, ...(project.versions ?? [])],
  }
}

export function removeProjectVersions(project: Project, idsToRemove: ReadonlySet<string>): Project {
  if (!project.versions || project.versions.length === 0 || idsToRemove.size === 0) {
    return project
  }
  const next = project.versions.filter((version) => !idsToRemove.has(version.id))
  if (next.length === project.versions.length) return project
  return { ...project, versions: next }
}
