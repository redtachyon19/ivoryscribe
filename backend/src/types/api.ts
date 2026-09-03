/**
 * Response shapes the HTTP API promises to clients.
 *
 * These mirror frontend/src/core/api/types.ts. The two files cannot import
 * each other: the backend Docker build context is the backend/ directory alone
 * (see backend/Dockerfile), so anything reached through ../frontend would not
 * exist in the image. Keep them in step by hand — this file is the server-side
 * half of that contract and is what the route handlers are checked against.
 */

export type AuthUser = {
  id: string;
  firstName: string;
  lastName: string;
  /** Nullable because User.email is allowNull on the model. */
  email: string | null;
  isEmailVerified: boolean;
};

export type AuthResponse = {
  token: string;
  user: AuthUser;
};

export type EmailVerificationRecord = {
  userId: string;
  email: string | null;
  emailMasked: string;
};

export type EmailVerificationPendingResponse = {
  requiresEmailVerification: true;
  verification: EmailVerificationRecord;
};
