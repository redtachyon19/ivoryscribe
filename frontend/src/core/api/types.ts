// HTTP-layer types shared by every endpoint module.

export type AuthResponse = {
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

export type PreferencesRecord = {
  id: string
  theme: Record<string, unknown>
  editorSettings: Record<string, unknown>
  uiSettings: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export type TuskAiProvider = "auto" | "gpt" | "claude" | "grok"

export type TuskAiProjectContext = {
  name: string
  // Widened with the file-type overhaul. The AI provider is told the kind so
  // it can adjust its prompts for a Presentation / Markdown / PlainText
  // document instead of always treating the context as a Book.
  kind: "Book" | "Presentation" | "Markdown" | "PlainText" | "PDF"
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
  isNew?: boolean
}

export type TuskAiContextMatch = {
  tabId: string
  tabTitle: string
  relevanceScore: number
}

export type TuskAiChatResponse = {
  mode: "edit"
  provider: TuskAiProvider
  providerUsed: TuskAiProvider
  fellBackFrom: TuskAiProvider | null
  model: string | null
  usedFallback: boolean
  providerNote: string | null
  contextMatches: TuskAiContextMatch[]
  edits: TuskAiEdit[]
}

export type TuskAiChatReplyResponse = {
  mode: "chat"
  provider: TuskAiProvider
  providerUsed: TuskAiProvider
  fellBackFrom: TuskAiProvider | null
  model: string | null
  providerNote: string | null
  error: string | null
  reply: string | null
  contextMatches: TuskAiContextMatch[]
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

export type ShareRecord = {
  id: string
  documentId: string
  recipientEmail: string
  recipientId: string | null
  permission: "view" | "edit"
  status: "pending" | "accepted" | "rejected" | "revoked"
  createdAt: string
  acceptedAt: string | null
}

export type PendingShareRequest = {
  id: string
  permission: "view" | "edit"
  createdAt: string
  owner: { id: string; name: string; email: string }
  projectName: string
}

export type SharedDocumentEntry = {
  shareId: string
  permission: "view" | "edit"
  acceptedAt: string
  owner: { id: string; name: string; email: string }
  document: DocumentRecord | null
}
