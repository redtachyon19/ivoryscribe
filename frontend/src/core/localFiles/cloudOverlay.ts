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

export async function uploadLocalFileAsCloudDocument(token: string, filePath: string): Promise<string> {
  const raw = await fs().readFile(filePath)
  const title = readDisplayName(filePath)
  const document = await createDocument(token, {
    title,
    content: raw,
    metadata: {
      ivoryscribeLocal: true,
    },
  })
  return document.id
}

export { getDocumentShares, createShare, revokeShare }
export type { ShareRecord }
