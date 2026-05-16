// Tusk AI endpoints (chat mode + edit mode share the same /api/ai/chat route,
// differentiated by a `mode` discriminator in the body).

import { request } from "./request"
import type {
  TuskAiChatReplyResponse,
  TuskAiChatResponse,
  TuskAiProjectContext,
  TuskAiProvider,
} from "./types"

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
      body: JSON.stringify({ ...input, mode: "edit" }),
    },
    token,
  )
}

export async function requestTuskAiChat(
  token: string,
  input: {
    provider: TuskAiProvider
    message: string
    project: TuskAiProjectContext
  },
) {
  return request<TuskAiChatReplyResponse>(
    "/api/ai/chat",
    {
      method: "POST",
      body: JSON.stringify({ ...input, mode: "chat" }),
    },
    token,
  )
}
