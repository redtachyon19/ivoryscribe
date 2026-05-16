// Billing / Stripe checkout for Tusk AI access.

import { request } from "./request"
import type { BillingStatusResponse } from "./types"

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
