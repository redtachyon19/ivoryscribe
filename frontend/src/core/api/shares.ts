import { request } from "./request"
import type {
  DocumentRecord,
  PendingShareRequest,
  ShareRecord,
  SharedDocumentEntry,
} from "./types"

export async function createShare(
  token: string,
  input: { documentId: string; recipientEmail: string; permission: "view" | "edit" },
) {
  const payload = await request<{ share: ShareRecord }>(
    "/api/shares",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
    token,
  )
  return payload.share
}

export async function getDocumentShares(token: string, documentId: string) {
  const payload = await request<{ shares: ShareRecord[] }>(
    `/api/shares/document/${documentId}`,
    {},
    token,
  )
  return payload.shares
}

export async function updateShare(
  token: string,
  shareId: string,
  input: { permission: "view" | "edit" },
) {
  const payload = await request<{ share: ShareRecord }>(
    `/api/shares/${shareId}`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
    token,
  )
  return payload.share
}

export async function revokeShare(token: string, shareId: string) {
  return request<{ message: string }>(
    `/api/shares/${shareId}`,
    { method: "DELETE" },
    token,
  )
}

export async function transferOwnership(
  token: string,
  input: { documentId: string; recipientEmail: string },
) {
  return request<{ message: string }>(
    "/api/shares/transfer-ownership",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
    token,
  )
}

export async function leaveShare(token: string, shareId: string) {
  return request<{ message: string }>(
    `/api/shares/${shareId}/leave`,
    { method: "POST" },
    token,
  )
}

export async function getPendingShareRequests(token: string) {
  const payload = await request<{ pendingRequests: PendingShareRequest[] }>(
    "/api/shares/pending-requests",
    {},
    token,
  )
  return payload.pendingRequests
}

export async function respondToShareRequest(
  token: string,
  shareId: string,
  action: "accept" | "reject",
) {
  return request<{
    share?: { id: string; documentId: string; permission: string; status: string; acceptedAt: string }
    document?: DocumentRecord | null
    message?: string
  }>(
    `/api/shares/${shareId}/respond`,
    {
      method: "POST",
      body: JSON.stringify({ action }),
    },
    token,
  )
}

export async function getSharedWithMe(token: string) {
  const payload = await request<{ sharedDocuments: SharedDocumentEntry[] }>(
    "/api/shares/shared-with-me",
    {},
    token,
  )
  return payload.sharedDocuments
}
