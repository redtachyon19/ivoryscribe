// A recursive tab tree used by the sidebar and PDF export.
export type DocumentTab = {
  id: string
  title: string
  children: DocumentTab[]
}

export type ProjectKind = "Book" | "Presentation" | "Markdown" | "PlainText" | "PDF" | "Image" | "Unknown"

/** Where a project's source of truth lives.
 *
 *  - `"local"` → file on disk, no cloud presence. Edits write to disk.
 *  - `"cloud"` → cloud Document only, no local file, no resolvable path.
 *                Edits write to the API. Can be shared. Cannot be opened
 *                offline.
 *
 *  A project is one or the other, never both — no cache, no sync, no
 *  cloud-id backup stamped into a local file. The legacy dual-state
 *  model is being torn out in phases; see plan in this commit.
 *
 *  Optional for backward compat with older snapshots that predate the
 *  field; consumers default missing values to `"local"`. */
export type ProjectSource = "local" | "cloud"

/** Discriminates manual ("Save Version" menu) saves from autosaves triggered
 *  by word-count deltas. Manual versions get roman-numeral labels (I, II, …);
 *  autosaves get arabic-number labels (1, 2, …). The two counters are
 *  independent — so I, II, 1, 2, III, 3 is a legal sequence. */
export type ProjectVersionKind = "manual" | "autosave"

/** A single snapshot of a Book or Presentation at a point in time, kept
 *  *inside* the project (and therefore inside the .tusk / .tusks file on
 *  disk, or the cloud Document blob). Markdown / PlainText projects do not
 *  carry versions — there's no schema slot for them and the editor never
 *  produces any.
 *
 *  `snapshot` is the JSON-stringified Project at the moment of save, with
 *  its own `versions` array stripped (no recursion). Stored as a string so
 *  it stays opaque to React reconciliation and to the diff effects in
 *  useLocalFilesystemSync — only the wrapping Project mutates per render,
 *  not every nested snapshot. mapVersionsForSettings parses on demand for
 *  the UI. */
export type ProjectVersion = {
  id: string
  /** Roman numeral for manual saves ("I", "II", "IV", …); arabic string for
   *  autosaves ("1", "2", "47"). */
  label: string
  kind: ProjectVersionKind
  /** ISO timestamp of when the snapshot was taken. */
  savedAt: string
  /** Total word count across every editable tab at save time. The autosave
   *  effect compares the current word count against the most recent version's
   *  to decide whether to push a new snapshot. */
  wordCount: number
  /** JSON.stringify of the Project at save time, with `versions` removed. */
  snapshot: string
}

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
  /** Tab ids rendered as plain-text (.txt). Mutually exclusive with the
   *  other id arrays — see `normalizeProjectAfterTabs`. */
  plaintextIds?: string[]
  /** Tab ids rendered as a read-only PDF viewer. For a standalone PDF
   *  project this holds the single synthetic tab id; the on-disk path
   *  for the PDF is stored in `contentById[tabId]` (no editable text). */
  pdfIds?: string[]
  /** Tab ids rendered as a read-only image viewer (PNG / JPEG). Mirrors
   *  `pdfIds`: the synthetic tab's id sits here, and the workspace-relative
   *  path to the image file lives in `contentById[tabId]`. ImageViewer
   *  resolves that against the live workspace root at render time. */
  imageIds?: string[]
  color: string
  wallpaperEmojis: string
  folderId: string | null
  rootPosition: "top" | "bottom"
  tabs: DocumentTab[]
  activeId: string | null
  contentById: Record<string, string>
  archivedAt?: string | null
  deletedAt?: string | null
  /** Sorted newest-first. Only Book and Presentation projects populate this;
   *  Markdown/PlainText/PDF/Image keep it `undefined`. Newest version is
   *  always at index 0. */
  versions?: ProjectVersion[]
}

/** Word-count delta that triggers an autosave snapshot. The unified
 *  versioning hook diffs the current project's total word count against the
 *  most recent version's `wordCount`; once the delta crosses this threshold,
 *  it pushes a new autosave entry. */
export const AUTOSAVE_WORD_DELTA = 500

/** Project kinds that carry an embedded version history. Markdown / PlainText
 *  documents are single-file edits and don't earn snapshots; PDF / Image /
 *  Unknown are read-only. Keep this as the single source of truth — every
 *  version-creating path checks it before pushing. */
export function projectKindSupportsVersions(kind: ProjectKind): boolean {
  return kind === "Book" || kind === "Presentation"
}

type LegacyProjectSnapshot = Omit<Project, "kind"> & {
  // "Blog" is a legacy alias for "Book" we still occasionally see in older
  // snapshots; the rename happens in `parseProjectFromDocument`.
  kind: ProjectKind | "Blog"
}

/** Single-document kinds have exactly one synthetic tab and hide the tab-list
 *  UI. See update.md §2.1 for why we keep one tab rather than removing it.
 *  PDFs are read-only single-document projects, so they sit here too.
 *  Images (PNG/JPEG) follow the same pattern. Unknown files have no tabs
 *  at all but we treat them as single-document so any tab-list UI stays
 *  hidden. */
export function isSingleDocumentKind(kind: ProjectKind): boolean {
  return kind === "Markdown" || kind === "PlainText" || kind === "PDF" || kind === "Image" || kind === "Unknown"
}

/** Read-only kinds — autosave and cloud sync are skipped for these. PDFs
 *  and Images are viewable but can't be modified through the app.
 *  Unknown-extension files have no in-app editor at all, so they're
 *  treated as read-only: the user can drag / delete / move them, but
 *  we never read or write their bytes. */
export function isReadOnlyKind(kind: ProjectKind): boolean {
  return kind === "PDF" || kind === "Image" || kind === "Unknown"
}

/** True for files the app has no editor for and therefore cannot open.
 *  Library entries for these still appear (greyed out) so drag/delete/move
 *  still work, but click-to-open and rename are gated off. */
export function isUnopenableKind(kind: ProjectKind): boolean {
  return kind === "Unknown"
}

export type ProjectEntryTerms = {
  singular: string
  plural: string
  untitled: string
}

// Single source of truth for the per-kind "entry" noun (a Book's entries are
// Chapters). Keyed on `kind` so adding a ProjectKind forces a matching entry
// here; callers must never hard-code these nouns.
const ENTRY_TERMS_BY_KIND: Record<ProjectKind, ProjectEntryTerms> = {
  Book:         { singular: "Chapter",  plural: "Chapters",  untitled: "Untitled Chapter" },
  Presentation: { singular: "Slide",    plural: "Slides",    untitled: "Untitled Slide" },
  Markdown:     { singular: "Document", plural: "Documents", untitled: "Untitled Document" },
  PlainText:    { singular: "Document", plural: "Documents", untitled: "Untitled Document" },
  PDF:          { singular: "Document", plural: "Documents", untitled: "Untitled PDF" },
  Image:        { singular: "Image",    plural: "Images",    untitled: "Untitled Image" },
  // Unknown files have no in-app entries, but the per-kind table is
  // typed as a Record so we still have to supply something. The card
  // skips rendering this label for Unknown projects.
  Unknown:      { singular: "File",     plural: "Files",     untitled: "Untitled File" },
}

export function getProjectEntryTerms(kind: ProjectKind): ProjectEntryTerms {
  return ENTRY_TERMS_BY_KIND[kind]
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
  // Precedence rule: a tab is in *at most* one mode array. Pinboard wins,
  // then typewriter, then plaintext, then markdown. The order matters for
  // tabs that were (incorrectly) listed in multiple arrays — we keep the
  // most specific renderer for that id.
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

// Factory for a brand-new project with starter tabs and per-tab content state.
// Per-kind seeding of the parallel id arrays makes the editor pick the right
// renderer immediately — no post-create reconciliation needed.
export function createProject(name: string, kind: ProjectKind): Project {
  // Unknown and Image projects can't be created from the app — they only
  // ever come from the hydrate path (Unknown = scanner didn't recognise
  // the extension; Image = the user dropped a PNG/JPEG into the workspace
  // folder). Calling createProject for those is a bug, so fail loudly
  // rather than silently materialising a corrupt entry.
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
    // Every freshly-created project is local. The "Move to cloud" flow
    // promotes a local project to cloud and trashes the local file in
    // the same step; nothing else ever flips this field.
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

    // Migrate the legacy "Blog" alias and validate the kind against the
    // 4-member union. Anything else is treated as a Book so we never lose
    // the snapshot, but the type system stays honest.
    // TODO: full cloud/web support for Presentation/Markdown/PlainText
    // snapshots — for now only Book is exercised in cloud mode. See
    // update.md §1 (G9). Presentation snapshots will load (their pinboardIds
    // are preserved), but no cloud-side editor flow creates them yet.
    const rawKind = (parsedContent as { kind: ProjectKind | "Blog" }).kind
    const resolvedKind: ProjectKind =
      rawKind === "Blog" ? "Book"
      : rawKind === "Presentation" || rawKind === "Markdown" || rawKind === "PlainText" || rawKind === "PDF" ? rawKind
      : "Book"

    const { markdownEditorEnabled: _legacyMarkdownMode, ...rest } = parsedContent

    // NB: `source` is *not* set here. Callers tag it themselves —
    // useWorkspaceHydration tags as "cloud" when reading cloud
    // Documents; the versioning module re-uses this parser for
    // snapshots and inherits the active project's source on restore.
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

/** Returns `project` with the active tab's content replaced. Returns the same
 *  project unchanged when there is no active tab. Consolidates the
 *  contentById-spread updater the editor surfaces each previously inlined. */
export function setActiveTabContent(project: Project, nextContent: string): Project {
  if (!project.activeId) return project
  return {
    ...project,
    contentById: { ...project.contentById, [project.activeId]: nextContent },
  }
}

/** Set content for a SPECIFIC document id rather than whichever tab happens to
 *  be active. The prose editors debounce their saves, so a flush can land after
 *  the user has already switched tabs — targeting the editor's own captured id
 *  (not `activeId`) guarantees that trailing write goes to the right document
 *  instead of clobbering the newly-active one. No-op for an empty id or when the
 *  id is not a tab in this project. */
export function setTabContentById(project: Project, documentId: string | null, nextContent: string): Project {
  if (!documentId || !(documentId in project.contentById)) return project
  return {
    ...project,
    contentById: { ...project.contentById, [documentId]: nextContent },
  }
}

// ── Word counting ──────────────────────────────────────────────────────────
//
// Lives here (rather than in core/utils/markdown.ts where countWords is)
// so the versioning hook can take a project-wide count without dragging
// the markdown module's marked/highlight.js bundle into its closure.
// Mirrors countWordsFromContent's behavior for HTML-wrapped content but
// without importing it.

const HTML_TAG_PATTERN = /<\/?[a-z][^>]*>/gi
const WORD_PATTERN = /[\p{L}\p{N}'']+/gu

function stripHtml(value: string): string {
  return value.replace(HTML_TAG_PATTERN, " ")
}

function countWordsInText(value: string): number {
  if (!value) return 0
  // Strip HTML if present; ProseMirror/TipTap stores content as wrapped HTML
  // for prose tabs but as raw text/markdown for others.
  const text = value.includes("<") ? stripHtml(value) : value
  const matches = text.match(WORD_PATTERN)
  return matches ? matches.length : 0
}

/** Sum of word counts across every tab in `contentById`. Used by the
 *  versioning hook to decide when an autosave snapshot is due. */
export function countProjectWords(project: Project): number {
  let total = 0
  for (const value of Object.values(project.contentById)) {
    if (typeof value !== "string") continue
    total += countWordsInText(value)
  }
  return total
}

// ── Version labels ─────────────────────────────────────────────────────────

const ROMAN_NUMERALS: ReadonlyArray<readonly [number, string]> = [
  [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"],
  [100,  "C"], [90,  "XC"], [50,  "L"], [40,  "XL"],
  [10,   "X"], [9,   "IX"], [5,   "V"], [4,   "IV"],
  [1,    "I"],
]

/** Convert a positive integer to its roman numeral. 0 returns "" — but the
 *  callers below pass 1 or higher (the count is always "existing manual
 *  versions + 1"). */
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

/** Next manual label = roman numeral one past the count of existing manual
 *  versions. The two counters (manual/autosave) are independent — see the
 *  ProjectVersion comment. */
export function nextManualVersionLabel(versions: ReadonlyArray<ProjectVersion>): string {
  const manualCount = versions.reduce((n, v) => v.kind === "manual" ? n + 1 : n, 0)
  return toRomanNumeral(manualCount + 1)
}

/** Next autosave label = stringified arabic number one past the count of
 *  existing autosave versions. */
export function nextAutosaveVersionLabel(versions: ReadonlyArray<ProjectVersion>): string {
  const autosaveCount = versions.reduce((n, v) => v.kind === "autosave" ? n + 1 : n, 0)
  return String(autosaveCount + 1)
}

// ── Snapshot factory ──────────────────────────────────────────────────────

/** Returns a copy of `project` with `versions` stripped. We snapshot this
 *  shape (never the project as-is) so versions never contain other versions
 *  — a `.tusk` opened, edited, saved twenty times would otherwise carry an
 *  exponentially growing nested history. */
export function projectWithoutVersions(project: Project): Project {
  if (!project.versions) return project
  const { versions: _versions, ...rest } = project
  return rest
}

/** Build a new `ProjectVersion` from the current state of `project`. Caller
 *  is responsible for appending it (via `appendProjectVersion`) and pushing
 *  the result back into React state. */
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

/** Returns a copy of `project` with `version` prepended to its `versions`
 *  array (newest-first ordering). */
export function appendProjectVersion(project: Project, version: ProjectVersion): Project {
  return {
    ...project,
    versions: [version, ...(project.versions ?? [])],
  }
}

/** Returns a copy of `project` with every version whose id is in `idsToRemove`
 *  filtered out. Used by the version-history modal's Delete action — the
 *  hook calls this through `setProjects`, the FS sync writes the resulting
 *  project (sans those versions) back to disk, and the cloud sync pushes
 *  the same updated content. No special "tombstone" handling needed: a
 *  deleted version is simply absent on next read. */
export function removeProjectVersions(project: Project, idsToRemove: ReadonlySet<string>): Project {
  if (!project.versions || project.versions.length === 0 || idsToRemove.size === 0) {
    return project
  }
  const next = project.versions.filter((version) => !idsToRemove.has(version.id))
  if (next.length === project.versions.length) return project
  return { ...project, versions: next }
}
