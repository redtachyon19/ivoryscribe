type AuthResponse = {
  token: string
  user: {
    id: string
    firstName: string
    lastName: string
    email: string
    isEmailVerified: boolean
  }
}

export type EmailVerificationRecord = {
  userId: string
  email: string
  emailMasked: string
}

export type EmailVerificationPendingResponse = {
  message?: string
  requiresEmailVerification: true
  verification: EmailVerificationRecord
}

function isEmailVerificationPendingResponse(value: unknown): value is EmailVerificationPendingResponse {
  if (!value || typeof value !== "object") {
    return false
  }

  const candidate = value as Partial<EmailVerificationPendingResponse>
  return (
    candidate.requiresEmailVerification === true &&
    Boolean(candidate.verification?.userId) &&
    Boolean(candidate.verification?.email)
  )
}

export class ApiError extends Error {
  status: number
  payload: unknown

  constructor(status: number, message: string, payload: unknown) {
    super(message)
    this.status = status
    this.payload = payload
  }
}

export type DocumentRecord = {
  id: string
  title: string
  content: string
  theme: Record<string, unknown>
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export type TuskAiProvider = "gpt" | "claude" | "grok"

export type TuskAiProjectContext = {
  name: string
  kind: "Book" | "Blog"
  activeId: string | null
  tabs: Array<{
    id: string
    title: string
    children: Array<unknown>
  }>
  contentById: Record<string, string>
}

export type TuskAiEdit = {
  id: string
  tabId: string
  tabTitle: string
  summary: string
  before: string
  after: string
}

export type TuskAiChatResponse = {
  provider: TuskAiProvider
  model: string | null
  usedFallback: boolean
  providerNote: string | null
  contextMatches: Array<{
    tabId: string
    tabTitle: string
    relevanceScore: number
  }>
  edits: TuskAiEdit[]
}

export type BillingStatusResponse = {
  tuskAiActivated: boolean
  tuskAiActivatedAt: string | null
  purchase: {
    id: string
    amountTotal: number | null
    currency: string | null
    paidAt: string | null
    stripeCheckoutSessionId: string
  } | null
}

type PreferencesRecord = {
  id: string
  theme: Record<string, unknown>
  editorSettings: Record<string, unknown>
  uiSettings: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

const configuredApiBase = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "")
const API_BASE = configuredApiBase ?? "http://localhost:4000"
const DEV_FALLBACK_API_BASE = "http://localhost:4000"

function isLikelyNetworkFailure(message: string) {
  const normalized = message.toLowerCase()
  return (
    normalized.includes("load failed") ||
    normalized.includes("failed to fetch") ||
    normalized.includes("networkerror") ||
    normalized.includes("network request failed") ||
    normalized.includes("fetch failed") ||
    normalized.includes("network error")
  )
}

async function request<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const headers = new Headers(options.headers)

  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json")
  }

  if (token) {
    headers.set("Authorization", `Bearer ${token}`)
  }

  let response: Response
  const shouldTryDevFallback = import.meta.env.DEV && API_BASE !== DEV_FALLBACK_API_BASE
  const tryFetch = (baseUrl: string) =>
    fetch(`${baseUrl}${path}`, {
      ...options,
      headers,
    })

  try {
    response = await tryFetch(API_BASE)
  } catch (error) {
    const originalMessage = error instanceof Error ? error.message : "Request failed"
    if (isLikelyNetworkFailure(originalMessage) && shouldTryDevFallback) {
      try {
        response = await tryFetch(DEV_FALLBACK_API_BASE)
      } catch (fallbackError) {
        const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : "Request failed"
        if (isLikelyNetworkFailure(fallbackMessage)) {
          throw new Error(
            `[NETWORK] Unable to reach backend at ${API_BASE} or fallback ${DEV_FALLBACK_API_BASE}. Check that the API server is running.`,
          )
        }

        throw new Error(`[NETWORK] ${fallbackMessage}`)
      }
    } else if (isLikelyNetworkFailure(originalMessage)) {
      throw new Error(`[NETWORK] Unable to reach backend at ${API_BASE}. Check that the API server is running.`)
    } else {
      throw new Error(`[NETWORK] ${originalMessage}`)
    }
  }

  const payload = (await response.json().catch(() => ({}))) as { message?: string; details?: string }

  if (!response.ok) {
    const details = payload.details ? ` (${payload.details})` : ""
    throw new ApiError(response.status, `[${response.status}] ${payload.message ?? "Request failed"}${details}`, payload)
  }

  return payload as T
}

export async function login(email: string, password: string) {
  return request<AuthResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  })
}

export async function register(firstName: string, lastName: string, email: string, password: string) {
  const payload = await request<AuthResponse | EmailVerificationPendingResponse>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ firstName, lastName, email, password }),
  })

  if (isEmailVerificationPendingResponse(payload)) {
    return payload
  }

  return payload
}

export async function verifyEmail(userId: string, code: string) {
  return request<AuthResponse>("/api/auth/verify-email", {
    method: "POST",
    body: JSON.stringify({ userId, code }),
  })
}

export async function resendEmailVerification(userId: string) {
  return request<EmailVerificationPendingResponse>("/api/auth/resend-verification", {
    method: "POST",
    body: JSON.stringify({ userId }),
  })
}

export async function updateAccountProfile(token: string, input: { firstName: string; lastName: string }) {
  const payload = await request<{
    user: {
      id: string
      firstName: string
      lastName: string
      email: string
      isEmailVerified: boolean
    }
  }>(
    "/api/auth/account",
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
    token,
  )

  return payload.user
}

export async function requestAccountEmailChange(token: string, email: string) {
  return request<{
    message: string
    change: {
      currentEmail: string
      newEmail: string
      step: "verify-current-email"
    }
  }>(
    "/api/auth/request-email-change",
    {
      method: "POST",
      body: JSON.stringify({ email }),
    },
    token,
  )
}

export async function verifyCurrentEmailForAccountChange(token: string, code: string) {
  return request<{
    message: string
    change: {
      currentEmail: string
      newEmail: string
      step: "verify-new-email"
    }
  }>(
    "/api/auth/verify-current-email-change",
    {
      method: "POST",
      body: JSON.stringify({ code }),
    },
    token,
  )
}

export async function confirmAccountEmailChange(token: string, code: string) {
  const payload = await request<{
    message: string
    user: {
      id: string
      firstName: string
      lastName: string
      email: string
      isEmailVerified: boolean
    }
  }>(
    "/api/auth/confirm-email-change",
    {
      method: "POST",
      body: JSON.stringify({ code }),
    },
    token,
  )

  return payload.user
}

export async function requestPasswordResetLink(token: string) {
  return request<{
    message: string
    reset: {
      username: string
      email: string
    }
  }>(
    "/api/auth/request-password-reset",
    {
      method: "POST",
    },
    token,
  )
}

export async function getPasswordResetInfo(token: string) {
  return request<{
    reset: {
      username: string
    }
  }>(`/api/auth/password-reset-info?token=${encodeURIComponent(token)}`)
}

export async function resetPasswordFromToken(input: { token: string; newPassword: string }) {
  return request<{ message: string }>(
    "/api/auth/reset-password",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  )
}

export async function requestAccountDeletion(token: string) {
  return request<{
    message: string
    deletion: {
      userId: string
      email: string
    }
  }>(
    "/api/auth/request-account-deletion",
    {
      method: "POST",
    },
    token,
  )
}

export async function confirmAccountDeletionCode(input: { userId: string; code: string }) {
  return request<{ message: string }>(
    "/api/auth/confirm-account-deletion-code",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  )
}

export async function getDocuments(token: string) {
  const payload = await request<{ documents: DocumentRecord[] }>("/api/documents", {}, token)
  return payload.documents
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
  const response = await fetch(`${API_BASE}/api/documents/${id}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  if (!response.ok && response.status !== 404) {
    throw new Error("Failed to delete document")
  }
}

export async function getPreferences(token: string) {
  const payload = await request<{ preferences: PreferencesRecord }>("/api/preferences", {}, token)
  return payload.preferences
}

export async function updatePreferences(
  token: string,
  input: {
    theme?: Record<string, unknown>
    editorSettings?: Record<string, unknown>
    uiSettings?: Record<string, unknown>
  },
) {
  const payload = await request<{ preferences: PreferencesRecord }>(
    "/api/preferences",
    {
      method: "PUT",
      body: JSON.stringify(input),
    },
    token,
  )

  return payload.preferences
}

export async function requestTuskAiEdits(
  token: string,
  input: {
    provider: TuskAiProvider
    message: string
    project: TuskAiProjectContext
  },
) {
  return request<TuskAiChatResponse>(
    "/api/ai/chat",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
    token,
  )
}

export async function getBillingStatus(token: string) {
  return request<BillingStatusResponse>("/api/billing/status", {}, token)
}

export async function createTuskAiCheckoutSession(token: string) {
  return request<{
    checkoutUrl: string | null
    checkoutSessionId: string
  }>(
    "/api/billing/checkout-session",
    {
      method: "POST",
      body: JSON.stringify({}),
    },
    token,
  )
}

export async function confirmTuskAiCheckoutSession(token: string, sessionId: string) {
  return request<{
    tuskAiActivated: boolean
    tuskAiActivatedAt: string | null
    paymentStatus: string | null
  }>(
    "/api/billing/confirm-session",
    {
      method: "POST",
      body: JSON.stringify({ sessionId }),
    },
    token,
  )
}

// ── Sharing ────────────────────────────────────────────────────

export type ShareRecord = {
  id: string
  documentId: string
  recipientEmail: string
  recipientId: string | null
  permission: "view" | "edit"
  status: "pending" | "accepted" | "revoked"
  createdAt: string
  acceptedAt: string | null
}

export type ShareInviteInfo = {
  id: string
  ownerName: string
  projectName: string
  permission: "view" | "edit"
  recipientEmail: string
}

export type SharedDocumentEntry = {
  shareId: string
  permission: "view" | "edit"
  acceptedAt: string
  owner: { id: string; name: string; email: string }
  document: DocumentRecord | null
}

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

export async function acceptShareInvite(token: string, inviteToken: string) {
  return request<{
    share: { id: string; documentId: string; permission: string; status: string; acceptedAt: string }
    document: DocumentRecord | null
  }>(
    "/api/shares/accept",
    {
      method: "POST",
      body: JSON.stringify({ inviteToken }),
    },
    token,
  )
}

export async function getShareInviteInfo(inviteToken: string) {
  return request<{ invite: ShareInviteInfo }>(
    `/api/shares/invite/${encodeURIComponent(inviteToken)}`,
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
