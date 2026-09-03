import { request } from "./request"
import type {
  AuthResponse,
  EmailVerificationPendingResponse,
} from "./types"

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
