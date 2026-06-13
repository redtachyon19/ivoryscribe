// Editable model of a PDF's built-in bookmarks (its outline / table of
// contents), shared between the read-only PDFViewer (which seeds it from the
// file on load) and the sidebar (a reused DocumentTabsPanel that renders + edits it).
//
// Why a module-level store and not props/context? Same reason as
// pdfTextRegistry: the viewer lives inside the editor tree, the sidebar lives
// in the navigation rail — different subtrees with no common ancestor close
// enough to thread state through. A tiny pub/sub store keyed by the pdf's
// document (tab) id is the lowest-coupling bridge.
//
// Source of truth: the bytes on disk. The viewer reads the outline once per
// load; every edit mutates the in-memory tree (instant UI) and schedules a
// debounced, serialized write back into the .pdf via pdf-lib. When the user
// reopens the file, the viewer re-reads the (now-updated) outline, so the
// in-memory copy and the file never drift.

import { useSyncExternalStore } from "react"

export type PdfBookmark = {
  /** App-local id. NOT persisted into the PDF — outline items have no ids of
   *  their own, so we mint one per node for React keys + edit targeting. */
  id: string
  title: string
  /** 1-indexed target page. Page-level jump only (no stored y/zoom). */
  pageNumber: number
  children: PdfBookmark[]
}

type DocState = {
  /** Absolute path of the PDF on disk, for persistence. Null in web/cloud mode
   *  (no Electron fs) — edits stay in memory and are never written. */
  filePath: string | null
  /** null = outline not read yet (show "loading"); [] = read, no bookmarks. */
  bookmarks: PdfBookmark[] | null
}

const states = new Map<string, DocState>()
const listeners = new Map<string, Set<() => void>>()
// Latest top-of-viewport page the viewer reported, per document. Kept OUT of
// DocState so scroll updates never churn the bookmark snapshot / re-render the
// panel — it's read only at "add bookmark" time to anchor the new entry.
const currentPageByDoc = new Map<string, number>()

function getState(documentId: string): DocState {
  let s = states.get(documentId)
  if (!s) {
    s = { filePath: null, bookmarks: null }
    states.set(documentId, s)
  }
  return s
}

function emit(documentId: string): void {
  const set = listeners.get(documentId)
  if (set) for (const fn of set) fn()
}

function subscribe(documentId: string, listener: () => void): () => void {
  let set = listeners.get(documentId)
  if (!set) {
    set = new Set()
    listeners.set(documentId, set)
  }
  set.add(listener)
  return () => {
    set?.delete(listener)
    if (set && set.size === 0) listeners.delete(documentId)
  }
}

// ── Tree helpers (immutable) ─────────────────────────────────────────────
//
// Rename / delete / reorder all go through the reused DocumentTabsPanel, which
// hands back a whole next tree we store via setPdfBookmarks — so the only
// bespoke mutation left here is the "Add Bookmark" append.

function insertInTree(
  nodes: PdfBookmark[],
  parentId: string | null,
  node: PdfBookmark,
): PdfBookmark[] {
  if (parentId === null) return [...nodes, node]
  return nodes.map((n) => {
    if (n.id === parentId) return { ...n, children: [...n.children, node] }
    return { ...n, children: insertInTree(n.children, parentId, node) }
  })
}

export function findBookmark(nodes: PdfBookmark[], id: string): PdfBookmark | null {
  for (const n of nodes) {
    if (n.id === id) return n
    const found = findBookmark(n.children, id)
    if (found) return found
  }
  return null
}

// ── Persistence (debounced + serialized per document) ────────────────────

const PERSIST_DEBOUNCE_MS = 600
const persistTimers = new Map<string, ReturnType<typeof setTimeout>>()
// Promise chain per document so a debounce flush can't start a write while the
// previous one is mid-rename — each write re-reads the freshest bytes.
const persistChains = new Map<string, Promise<void>>()

function runPersist(documentId: string): void {
  const s = states.get(documentId)
  if (!s || !s.filePath || s.bookmarks === null) return
  const filePath = s.filePath
  const tree = s.bookmarks
  const prev = persistChains.get(documentId) ?? Promise.resolve()
  const next = prev
    .catch(() => {})
    .then(async () => {
      // Loaded lazily so pdf-lib (and the write path) only enter the bundle the
      // first time a bookmark is actually edited.
      const { persistOutline } = await import("./pdfOutlineWriter")
      await persistOutline(filePath, tree)
    })
    .catch((err) => {
      console.error("Failed to write PDF bookmarks:", err)
    })
  persistChains.set(documentId, next)
}

function schedulePersist(documentId: string): void {
  const existing = persistTimers.get(documentId)
  if (existing) clearTimeout(existing)
  persistTimers.set(
    documentId,
    setTimeout(() => {
      persistTimers.delete(documentId)
      runPersist(documentId)
    }, PERSIST_DEBOUNCE_MS),
  )
}

function flushPersist(documentId: string): void {
  const existing = persistTimers.get(documentId)
  if (existing) {
    clearTimeout(existing)
    persistTimers.delete(documentId)
    runPersist(documentId)
  }
}

// ── Public API ───────────────────────────────────────────────────────────

/** Called by the viewer once the outline has been read + resolved to pages.
 *  Replaces any in-memory copy with the freshly-read tree (disk is the source
 *  of truth — pending edits were flushed when the previous mount cleared). */
export function initPdfBookmarks(
  documentId: string,
  filePath: string | null,
  bookmarks: PdfBookmark[],
): void {
  const s = getState(documentId)
  s.filePath = filePath
  s.bookmarks = bookmarks
  emit(documentId)
}

/** Viewer reports the current top-of-viewport page (for anchoring new adds). */
export function reportCurrentPage(documentId: string, pageNumber: number): void {
  currentPageByDoc.set(documentId, pageNumber)
}

export function getCurrentPage(documentId: string): number {
  return currentPageByDoc.get(documentId) ?? 1
}

/** Add a bookmark. `parentId === null` appends at the root; otherwise it
 *  becomes the last child of that node. Returns the new node's id. */
export function addPdfBookmark(
  documentId: string,
  opts: { title: string; pageNumber: number; parentId?: string | null },
): string | null {
  const s = states.get(documentId)
  if (!s || s.bookmarks === null) return null
  const id = createBookmarkId()
  const node: PdfBookmark = { id, title: opts.title, pageNumber: opts.pageNumber, children: [] }
  s.bookmarks = insertInTree(s.bookmarks, opts.parentId ?? null, node)
  emit(documentId)
  schedulePersist(documentId)
  return id
}

/** Replace the whole tree (used by reorder / future drag-drop). */
export function setPdfBookmarks(documentId: string, bookmarks: PdfBookmark[]): void {
  const s = states.get(documentId)
  if (!s) return
  s.bookmarks = bookmarks
  emit(documentId)
  schedulePersist(documentId)
}

/** Viewer unmount / document switch: flush any pending write so no edit is lost,
 *  then drop the in-memory copy (next mount re-reads from disk). */
export function clearPdfBookmarks(documentId: string): void {
  flushPersist(documentId)
  states.delete(documentId)
  currentPageByDoc.delete(documentId)
}

export function createBookmarkId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID()
  return `bm-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

// ── React binding ──────────────────────────────────────────────────────────

/** Subscribe a component to one document's bookmark tree. Returns `null` while
 *  the outline is still being read, `[]` when read-but-empty, else the tree. */
export function usePdfBookmarks(documentId: string | null): PdfBookmark[] | null {
  const sub = (cb: () => void) => (documentId ? subscribe(documentId, cb) : () => {})
  const snapshot = () => (documentId ? states.get(documentId)?.bookmarks ?? null : null)
  return useSyncExternalStore(sub, snapshot, snapshot)
}
