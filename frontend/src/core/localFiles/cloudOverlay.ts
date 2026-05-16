// Cloud overlay for shared documents.
//
// Sharing model: a local file is the source of truth UNTIL the user shares it.
// At share time we POST the serialized XML as a Document to the cloud, stamp
// the file's `cloud-id` attribute with the returned Document.id, and from then
// on every save also pushes to the cloud (debounced). When you open a file
// that already has a cloud-id, we fetch the cloud copy first and prefer it if
// it's newer than what's on disk — that's how collaborator edits make their
// way back to your machine.
//
// This module provides the imperative ops; useLocalDocument uses them.

import { createDocument, getDocument, updateDocument, deleteDocument, getDocumentShares, createShare, revokeShare } from "../api"
import type { ShareRecord } from "../api"
import { parseTuskBook, serializeTuskBook } from "./codecBook"
import { parseTuskPinboard, serializeTuskPinboard } from "./codecPinboard"
import { parseTuskSlideshow, serializeTuskSlideshow } from "./codecSlideshow"
import { kindForExtension, type TuskFileKind } from "./types"

function pathApi() {
  const api = window.electronAPI?.path
  if (!api) throw new Error("Path unavailable")
  return api
}

function fs() {
  const api = window.electronAPI?.fs
  if (!api) throw new Error("Filesystem unavailable")
  return api
}

function detectKind(filePath: string): TuskFileKind {
  const ext = pathApi().extname(filePath)
  const k = kindForExtension(ext)
  if (!k) throw new Error(`Unsupported file extension: ${ext}`)
  return k
}

// Read a local file and rewrite its cloud-id. Used after upload (set new id)
// and after stop-sharing (clear it).
export async function setCloudIdInLocalFile(filePath: string, nextCloudId: string | null): Promise<void> {
  const raw = await fs().readFile(filePath)
  const kind = detectKind(filePath)
  let next: string
  switch (kind) {
    case "book": {
      const file = parseTuskBook(raw)
      next = serializeTuskBook({ ...file, cloudId: nextCloudId })
      break
    }
    case "pinboard": {
      const file = parseTuskPinboard(raw)
      next = serializeTuskPinboard({ ...file, cloudId: nextCloudId })
      break
    }
    case "slideshow": {
      const file = parseTuskSlideshow(raw)
      next = serializeTuskSlideshow({ ...file, cloudId: nextCloudId })
      break
    }
  }
  await fs().writeFile(filePath, next)
}

function readDisplayName(filePath: string): string {
  const filename = pathApi().basename(filePath)
  const ext = pathApi().extname(filename)
  return filename.slice(0, filename.length - ext.length)
}

// Upload the current contents of a local file to the cloud as a new Document.
// Returns the Document.id, which the caller should write back into the file
// as cloud-id.
export async function uploadLocalFileAsCloudDocument(token: string, filePath: string): Promise<string> {
  const raw = await fs().readFile(filePath)
  const title = readDisplayName(filePath)
  const kind = detectKind(filePath)
  const document = await createDocument(token, {
    title,
    content: raw,
    metadata: {
      // Tag so a future "Shared with me" view can filter to ivoryscribe-local
      // uploads vs. legacy SQL projects.
      ivoryscribeLocal: true,
      tuskKind: kind,
    },
  })
  return document.id
}

// Push current contents to the cloud copy. Caller usually invokes this on
// save when cloudId is present.
export async function pushLocalFileToCloud(token: string, cloudId: string, filePath: string): Promise<void> {
  const raw = await fs().readFile(filePath)
  const title = readDisplayName(filePath)
  await updateDocument(token, cloudId, { content: raw, title })
}

// Pull the cloud copy onto disk. Returns true if local was actually updated.
// Strategy: compare cloud `updatedAt` with local mtime; if cloud is newer,
// overwrite local. Otherwise no-op.
export async function pullCloudIntoLocal(token: string, cloudId: string, filePath: string): Promise<boolean> {
  const document = await getDocument(token, cloudId)
  if (!document) return false
  const cloudUpdatedAt = new Date(document.updatedAt).getTime()
  let localMtime = 0
  try {
    const stat = await fs().stat(filePath)
    localMtime = stat.modifiedAt
  } catch {
    localMtime = 0
  }
  // Allow 2-second slack so we don't ping-pong over our own writes.
  if (cloudUpdatedAt > localMtime + 2000) {
    await fs().writeFile(filePath, document.content)
    return true
  }
  return false
}

// Stop sharing — delete cloud Document, clear cloud-id from local file.
export async function unshareCloudDocument(token: string, cloudId: string, filePath: string): Promise<void> {
  await deleteDocument(token, cloudId)
  await setCloudIdInLocalFile(filePath, null)
}

// Convenience re-exports so callers only need this one module.
export { getDocumentShares, createShare, revokeShare }
export type { ShareRecord }
