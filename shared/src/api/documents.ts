import { request } from "./request"
import { getApiBase } from "./config"
import { ApiError, type DocumentRecord } from "./types"

export async function getDocuments(token: string) {
  const payload = await request<{ documents: DocumentRecord[] }>("/api/documents", {}, token)
  return payload.documents
}

export async function getDocument(token: string, id: string): Promise<DocumentRecord | null> {
  try {
    const payload = await request<{ document: DocumentRecord }>(`/api/documents/${id}`, {}, token)
    return payload.document
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
}

export async function createDocument(
  token: string,
  input: { title: string; content: string; theme?: Record<string, unknown>; metadata?: Record<string, unknown> },
) {
  const payload = await request<{ document: DocumentRecord }>(
    "/api/documents",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
    token,
  )

  return payload.document
}

export async function updateDocument(
  token: string,
  id: string,
  input: { title?: string; content?: string; theme?: Record<string, unknown>; metadata?: Record<string, unknown> },
) {
  const payload = await request<{ document: DocumentRecord }>(
    `/api/documents/${id}`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
    token,
  )

  return payload.document
}

export async function deleteDocument(token: string, id: string) {
  const response = await fetch(`${getApiBase()}/api/documents/${id}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  if (!response.ok && response.status !== 404) {
    throw new Error("Failed to delete document")
  }
}
