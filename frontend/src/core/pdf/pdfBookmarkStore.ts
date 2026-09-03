import { useSyncExternalStore } from "react"

export type PdfBookmark = {
  id: string
  title: string
  pageNumber: number
  children: PdfBookmark[]
}

type DocState = {
  filePath: string | null
  bookmarks: PdfBookmark[] | null
}

const states = new Map<string, DocState>()
const listeners = new Map<string, Set<() => void>>()
const currentPageByDoc = new Map<string, number>()
// Kept apart from the tree listeners: the page changes as the reader scrolls, and the
// bookmark list itself is unaffected by it.
const pageListeners = new Map<string, Set<() => void>>()

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

function subscribePage(documentId: string, listener: () => void): () => void {
  let set = pageListeners.get(documentId)
  if (!set) {
    set = new Set()
    pageListeners.set(documentId, set)
  }
  set.add(listener)
  return () => {
    set?.delete(listener)
    if (set && set.size === 0) pageListeners.delete(documentId)
  }
}

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

// The bookmark a reader is sitting inside on a given page: a bookmark's section runs
// until the next one starts, so it is the one with the highest page at or before this
// page — the last of them in tree order when several share that page.
export function findBookmarkForPage(nodes: PdfBookmark[], pageNumber: number): PdfBookmark | null {
  let match: PdfBookmark | null = null
  const walk = (list: PdfBookmark[]): void => {
    for (const n of list) {
      if (n.pageNumber <= pageNumber && (!match || n.pageNumber >= match.pageNumber)) match = n
      walk(n.children)
    }
  }
  walk(nodes)
  return match
}

export function findBookmark(nodes: PdfBookmark[], id: string): PdfBookmark | null {
  for (const n of nodes) {
    if (n.id === id) return n
    const found = findBookmark(n.children, id)
    if (found) return found
  }
  return null
}

const PERSIST_DEBOUNCE_MS = 600
const persistTimers = new Map<string, ReturnType<typeof setTimeout>>()
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

export function reportCurrentPage(documentId: string, pageNumber: number): void {
  // Fires on every scroll frame, so only a page boundary is worth waking anyone for.
  if (currentPageByDoc.get(documentId) === pageNumber) return
  currentPageByDoc.set(documentId, pageNumber)
  const set = pageListeners.get(documentId)
  if (set) for (const fn of set) fn()
}

export function getCurrentPage(documentId: string): number {
  return currentPageByDoc.get(documentId) ?? 1
}

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

export function setPdfBookmarks(documentId: string, bookmarks: PdfBookmark[]): void {
  const s = states.get(documentId)
  if (!s) return
  s.bookmarks = bookmarks
  emit(documentId)
  schedulePersist(documentId)
}

export function clearPdfBookmarks(documentId: string): void {
  flushPersist(documentId)
  states.delete(documentId)
  currentPageByDoc.delete(documentId)
}

export function createBookmarkId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID()
  return `bm-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function usePdfCurrentPage(documentId: string | null): number {
  const sub = (cb: () => void) => (documentId ? subscribePage(documentId, cb) : () => {})
  const snapshot = () => (documentId ? currentPageByDoc.get(documentId) ?? 1 : 1)
  return useSyncExternalStore(sub, snapshot, snapshot)
}

export function usePdfBookmarks(documentId: string | null): PdfBookmark[] | null {
  const sub = (cb: () => void) => (documentId ? subscribe(documentId, cb) : () => {})
  const snapshot = () => (documentId ? states.get(documentId)?.bookmarks ?? null : null)
  return useSyncExternalStore(sub, snapshot, snapshot)
}
