// cloudOverlay — what's left of the old dual-state sync layer.
//
// In the previous model this file owned a push/pull/stamp loop that
// kept local files and cloud Documents in lockstep ("cache" with
// embedded cloud-id). The new model forbids that — a project is
// local or cloud, never both — so almost everything here was removed
// in Phase 6:
//
//   • setCloudIdInLocalFile  — no cloud-id attribute exists anymore.
//   • pushLocalFileToCloud   — local edits never push (cloud edits
//                              autosave via useCloudProjectsInLocalMode).
//   • pullCloudIntoLocal     — cloud projects have no local file to
//                              pull into.
//   • unshareCloudDocument   — share dialog calls deleteDocument
//                              directly via the API surface below.
//
// What remains is the one operation that survives: uploading a local
// file's bytes into a new cloud Document. The "Move to Cloud" flow
// uses it; everything else has been folded into normal API calls.

import { createDocument } from "../api"
import { getDocumentShares, createShare, revokeShare } from "../api"
import type { ShareRecord } from "../api"

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

function readDisplayName(filePath: string): string {
  const filename = pathApi().basename(filePath)
  const ext = pathApi().extname(filename)
  return filename.slice(0, filename.length - ext.length)
}

// Upload the current contents of a local file to the cloud as a new
// Document. Returns the new Document.id. Caller is responsible for
// trashing the local file afterwards (the "Move to Cloud" flow does
// this via LocalFilesystemHandle.promoteLocalProjectToCloud).
//
// The Document content is the raw file bytes verbatim — we don't
// transform it. The cloud-side parser handles XML payloads the same
// way it always has.
export async function uploadLocalFileAsCloudDocument(token: string, filePath: string): Promise<string> {
  const raw = await fs().readFile(filePath)
  const title = readDisplayName(filePath)
  const document = await createDocument(token, {
    title,
    content: raw,
    metadata: {
      // Tag so a future "Shared with me" view can filter to ivoryscribe
      // uploads vs. legacy SQL projects. Cloud-side schema is unchanged.
      ivoryscribeLocal: true,
    },
  })
  return document.id
}

// Convenience re-exports so callers only need this one module.
export { getDocumentShares, createShare, revokeShare }
export type { ShareRecord }
