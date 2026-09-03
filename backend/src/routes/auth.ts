import { Router, type Request, type Response } from "express";
import { randomBytes, randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import jwt, { type SignOptions } from "jsonwebtoken";
import authMiddleware from "../middleware/auth.ts";
import { Preference, User } from "../models/index.ts";
import type { User as UserModel } from "../models/user.ts";
import {
  sendAccountDeletionEmail,
  sendEmailChangeCurrentEmailVerificationEmail,
  sendEmailChangeNewEmailVerificationEmail,
  sendPasswordResetEmail,
  sendVerificationEmail,
} from "../services/email.ts";
import { errorMessage } from "../lib/errors.ts";
import type { AuthResponse, EmailVerificationPendingResponse } from "../types/api.ts";

/**
 * Request body shapes describe what clients are expected to send. Every
 * runtime guard below is unchanged — these annotations only stop req.body
 * being `any`, they do not validate.
 */
type RegisterBody = { firstName?: unknown; lastName?: unknown; email?: unknown; password?: string };
type LoginBody = { email?: unknown; password?: string };
type UserIdCodeBody = { userId?: unknown; code?: unknown };
type CodeBody = { code?: unknown };
type AccountPatchBody = { firstName?: unknown; lastName?: unknown };
type EmailBody = { email?: unknown };
type ResetPasswordBody = { token?: unknown; newPassword?: unknown };

type EmailChangeChallenge = {
  currentEmail: string;
  newEmail: string;
  currentCode: string;
  newCode: string;
  currentToken: string;
  newToken: string;
  isCurrentVerified: boolean;
};

const router = Router();
const { JWT_SECRET = "replace-this-with-a-secure-secret", JWT_EXPIRES_IN = "7d" } = process.env;
const EMAIL_VERIFICATION_TTL_MINUTES = 15;
const ACCOUNT_DELETION_TTL_MINUTES = 15;
const PASSWORD_RESET_TTL_MINUTES = 15;
const { BACKEND_PUBLIC_URL = "http://localhost:4000", FRONTEND_PUBLIC_URL = "http://localhost:5173" } = process.env;

function buildAuthResponse(user: UserModel): AuthResponse {
  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN as SignOptions["expiresIn"] });
  const fallbackName = sanitizeName(user.name);
  const [fallbackFirst = "", ...fallbackLastParts] = fallbackName.split(/\s+/).filter(Boolean);
  const firstName = sanitizeName(user.firstName) || fallbackFirst;
  const lastName = sanitizeName(user.lastName) || fallbackLastParts.join(" ");

  return {
    token,
    user: {
      id: user.id,
      firstName,
      lastName,
      email: user.email,
      isEmailVerified: Boolean(user.isEmailVerified),
    },
  };
}

function maskEmail(email: string | null): string {
  const [localPart = "", domain = ""] = String(email).split("@");
  if (!localPart || !domain) {
    return "";
  }

  const safeLocal =
    localPart.length <= 2 ? `${localPart[0] ?? "*"}*` : `${localPart.slice(0, 2)}${"*".repeat(Math.max(1, localPart.length - 2))}`;

  return `${safeLocal}@${domain}`;
}

function buildVerificationPendingResponse(user: UserModel): EmailVerificationPendingResponse {
  return {
    requiresEmailVerification: true,
    verification: {
      userId: user.id,
      email: user.email,
      emailMasked: maskEmail(user.email),
    },
  };
}

function sanitizeName(input: unknown): string {
  return typeof input === "string" ? input.trim().slice(0, 80) : "";
}

function sanitizeEmail(input: unknown): string {
  return typeof input === "string" ? input.trim().toLowerCase() : "";
}

function buildInternalUsernameFromEmail(email: string): string {
  const localPart = String(email).split("@")[0] ?? "writer";
  const alphanumeric = localPart.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  const base = (alphanumeric || "writer").slice(0, 20);
  const suffix = randomInt(1000, 9999);
  return `${base}${suffix}`.slice(0, 32);
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function generateVerificationCode(): string {
  return String(randomInt(100000, 1000000));
}

function generateDeletionToken(): string {
  return randomBytes(32).toString("hex");
}

function buildDeletionConfirmUrl(token: string): string {
  const normalizedBase = String(BACKEND_PUBLIC_URL).replace(/\/$/, "");
  return `${normalizedBase}/api/auth/confirm-account-deletion?token=${encodeURIComponent(token)}`;
}

function buildPasswordResetUrl(token: string): string {
  const normalizedBase = String(FRONTEND_PUBLIC_URL).replace(/\/$/, "");
  return `${normalizedBase}/reset-password?token=${encodeURIComponent(token)}`;
}

function generateEmailChangeToken(): string {
  return randomBytes(32).toString("hex");
}

function buildEmailChangeLink(step: string, userId: string, token: string): string {
  const normalizedBase = String(BACKEND_PUBLIC_URL).replace(/\/$/, "");
  const safeStep = step === "current" ? "current" : "new";
  return `${normalizedBase}/api/auth/verify-email-change-link?step=${safeStep}&userId=${encodeURIComponent(userId)}&token=${encodeURIComponent(token)}`;
}

function buildEmailChangeChallenge(input: EmailChangeChallenge): string {
  return JSON.stringify(input);
}

function parseEmailChangeChallenge(value: unknown): EmailChangeChallenge | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const currentEmail = typeof parsed?.currentEmail === "string" ? sanitizeEmail(parsed.currentEmail) : "";
    const newEmail = typeof parsed?.newEmail === "string" ? sanitizeEmail(parsed.newEmail) : "";
    const currentCode = typeof parsed?.currentCode === "string" ? parsed.currentCode.trim() : "";
    const newCode = typeof parsed?.newCode === "string" ? parsed.newCode.trim() : "";
    const currentToken = typeof parsed?.currentToken === "string" ? parsed.currentToken.trim() : "";
    const newToken = typeof parsed?.newToken === "string" ? parsed.newToken.trim() : "";
    const isCurrentVerified = parsed?.isCurrentVerified === true;

    if (!currentEmail || !newEmail || !currentCode || !newCode || !currentToken || !newToken) {
      return null;
    }

    return { currentEmail, newEmail, currentCode, newCode, currentToken, newToken, isCurrentVerified };
  } catch {
    return null;
  }
}

async function issueVerificationCode(user: UserModel): Promise<string> {
  const code = generateVerificationCode();
  user.emailVerificationCode = code;
  user.emailVerificationExpiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TTL_MINUTES * 60 * 1000);
  await user.save();
  return code;
}

async function issueAccountDeletionChallenge(user: UserModel): Promise<{ token: string; code: string }> {
  const token = generateDeletionToken();
  const code = generateVerificationCode();

  user.accountDeletionToken = token;
  user.accountDeletionCode = code;
  user.accountDeletionExpiresAt = new Date(Date.now() + ACCOUNT_DELETION_TTL_MINUTES * 60 * 1000);
  await user.save();

  return { token, code };
}

async function issuePasswordResetToken(user: UserModel): Promise<string> {
  const token = randomBytes(32).toString("hex");
  user.passwordResetToken = token;
  user.passwordResetExpiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MINUTES * 60 * 1000);
  await user.save();
  return token;
}

router.post("/register", async (req: Request<unknown, unknown, RegisterBody>, res: Response) => {
  try {
    const firstName = sanitizeName(req.body?.firstName);
    const lastName = sanitizeName(req.body?.lastName);
    const email = sanitizeEmail(req.body?.email);
    const { password } = req.body;
    const fullName = `${firstName} ${lastName}`.trim();

    if (!firstName || !lastName || !password || !email) {
      return res.status(400).json({ message: "firstName, lastName, email, and password are required" });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ message: "email format is invalid" });
    }

    if (String(password).length < 8) {
      return res.status(400).json({ message: "password must be at least 8 characters" });
    }

    const existingEmail = await User.findOne({ where: { email } });
    if (existingEmail) {
      return res.status(409).json({ message: "email already exists" });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({
      username: buildInternalUsernameFromEmail(email),
      email,
      firstName,
      lastName,
      name: fullName,
      passwordHash,
      isEmailVerified: false,
    });
    await Preference.create({ userId: user.id });

    const code = await issueVerificationCode(user);

    try {
      await sendVerificationEmail({ to: email, firstName, code });
    } catch (mailError) {
      return res.status(502).json({
        message: "Account created but failed to send verification email. Please try resend.",
        details: errorMessage(mailError),
        ...buildVerificationPendingResponse(user),
      });
    }

    return res.status(201).json({
      message: "Account created. Check your email for a verification code.",
      ...buildVerificationPendingResponse(user),
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to register user", details: errorMessage(error) });
  }
});

router.post("/login", async (req: Request<unknown, unknown, LoginBody>, res: Response) => {
  try {
    const email = sanitizeEmail(req.body?.email);
    const { password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "email and password are required" });
    }

    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    if (user.email && !user.isEmailVerified) {
      return res.status(403).json({
        code: "EMAIL_NOT_VERIFIED",
        message: "Please verify your email before logging in",
        ...buildVerificationPendingResponse(user),
      });
    }

    return res.status(200).json(buildAuthResponse(user));
  } catch (error) {
    return res.status(500).json({ message: "Failed to log in", details: errorMessage(error) });
  }
});

router.post("/verify-email", async (req: Request<unknown, unknown, UserIdCodeBody>, res: Response) => {
  try {
    const userId = typeof req.body?.userId === "string" ? req.body.userId.trim() : "";
    const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";

    if (!userId || !code) {
      return res.status(400).json({ message: "userId and code are required" });
    }

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.isEmailVerified) {
      return res.status(200).json(buildAuthResponse(user));
    }

    if (!user.emailVerificationCode || !user.emailVerificationExpiresAt) {
      return res.status(400).json({ message: "No verification code found. Please request a new code." });
    }

    const expiresAtMs = new Date(user.emailVerificationExpiresAt).getTime();
    if (Number.isNaN(expiresAtMs) || expiresAtMs < Date.now()) {
      return res.status(400).json({ message: "Verification code has expired. Please request a new code." });
    }

    if (user.emailVerificationCode !== code) {
      return res.status(400).json({ message: "Verification code is invalid" });
    }

    user.isEmailVerified = true;
    user.emailVerificationCode = null;
    user.emailVerificationExpiresAt = null;
    await user.save();

    return res.status(200).json(buildAuthResponse(user));
  } catch (error) {
    return res.status(500).json({ message: "Failed to verify email", details: errorMessage(error) });
  }
});

router.post("/resend-verification", async (req: Request<unknown, unknown, { userId?: unknown }>, res: Response) => {
  try {
    const userId = typeof req.body?.userId === "string" ? req.body.userId.trim() : "";
    if (!userId) {
      return res.status(400).json({ message: "userId is required" });
    }

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.isEmailVerified) {
      return res.status(400).json({ message: "Email is already verified" });
    }

    if (!user.email) {
      return res.status(400).json({ message: "User email is missing" });
    }

    const code = await issueVerificationCode(user);
    await sendVerificationEmail({ to: user.email, firstName: sanitizeName(user.firstName) || "there", code });

    return res.status(200).json({
      message: "Verification email sent",
      ...buildVerificationPendingResponse(user),
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to resend verification email", details: errorMessage(error) });
  }
});

router.get("/account", authMiddleware, async (req: Request, res: Response) => {
  const fallbackName = sanitizeName(req.user.name);
  const [fallbackFirst = "", ...fallbackLastParts] = fallbackName.split(/\s+/).filter(Boolean);

  return res.status(200).json({
    user: {
      id: req.user.id,
      firstName: sanitizeName(req.user.firstName) || fallbackFirst,
      lastName: sanitizeName(req.user.lastName) || fallbackLastParts.join(" "),
      email: req.user.email,
      isEmailVerified: Boolean(req.user.isEmailVerified),
    },
  });
});

router.patch("/account", authMiddleware, async (req: Request<unknown, unknown, AccountPatchBody>, res: Response) => {
  try {
    const nextFirstName = sanitizeName(req.body?.firstName);
    const nextLastName = sanitizeName(req.body?.lastName);

    if (!nextFirstName || !nextLastName) {
      return res.status(400).json({ message: "firstName and lastName are required" });
    }

    if (nextFirstName.length > 80 || nextLastName.length > 80) {
      return res.status(400).json({ message: "firstName and lastName must be 80 characters or fewer" });
    }

    req.user.firstName = nextFirstName;
    req.user.lastName = nextLastName;
    req.user.name = `${nextFirstName} ${nextLastName}`.trim();
    await req.user.save();

    return res.status(200).json({
      user: {
        id: req.user.id,
        firstName: req.user.firstName,
        lastName: req.user.lastName,
        email: req.user.email,
        isEmailVerified: Boolean(req.user.isEmailVerified),
      },
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to update account", details: errorMessage(error) });
  }
});

router.post("/request-email-change", authMiddleware, async (req: Request<unknown, unknown, EmailBody>, res: Response) => {
  try {
    const nextEmail = sanitizeEmail(req.body?.email);

    if (!nextEmail) {
      return res.status(400).json({ message: "email is required" });
    }

    if (!isValidEmail(nextEmail)) {
      return res.status(400).json({ message: "email format is invalid" });
    }

    if (nextEmail === req.user.email) {
      return res.status(400).json({ message: "That email is already on your account" });
    }

    if (!req.user.email || !isValidEmail(req.user.email)) {
      return res.status(400).json({ message: "Current account email is missing or invalid" });
    }

    const existingEmail = await User.findOne({ where: { email: nextEmail } });
    if (existingEmail && existingEmail.id !== req.user.id) {
      return res.status(409).json({ message: "email already exists" });
    }

    const currentCode = generateVerificationCode();
    const newCode = generateVerificationCode();
    const currentToken = generateEmailChangeToken();
    const newToken = generateEmailChangeToken();

    req.user.emailVerificationCode = buildEmailChangeChallenge({
      currentEmail: req.user.email,
      newEmail: nextEmail,
      currentCode,
      newCode,
      currentToken,
      newToken,
      isCurrentVerified: false,
    });
    req.user.emailVerificationExpiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TTL_MINUTES * 60 * 1000);
    await req.user.save();

    await sendEmailChangeCurrentEmailVerificationEmail({
      to: req.user.email,
      firstName: sanitizeName(req.user.firstName) || "there",
      code: currentCode,
      newEmail: nextEmail,
      verifyUrl: buildEmailChangeLink("current", req.user.id, currentToken),
    });

    return res.status(200).json({
      message: "Verification code sent to your current email. Enter it to continue.",
      change: {
        currentEmail: req.user.email,
        newEmail: nextEmail,
        step: "verify-current-email",
      },
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to request email change", details: errorMessage(error) });
  }
});

router.post("/verify-current-email-change", authMiddleware, async (req: Request<unknown, unknown, CodeBody>, res: Response) => {
  try {
    const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";
    if (!code) {
      return res.status(400).json({ message: "code is required" });
    }

    if (!req.user.emailVerificationCode || !req.user.emailVerificationExpiresAt) {
      return res.status(400).json({ message: "No pending email change found. Request a new code." });
    }

    const expiresAtMs = new Date(req.user.emailVerificationExpiresAt).getTime();
    if (Number.isNaN(expiresAtMs) || expiresAtMs < Date.now()) {
      return res.status(400).json({ message: "Email change code expired. Request a new one." });
    }

    const challenge = parseEmailChangeChallenge(req.user.emailVerificationCode);
    if (!challenge) {
      return res.status(400).json({ message: "No pending email change found. Request a new code." });
    }

    if (challenge.currentEmail !== sanitizeEmail(req.user.email)) {
      req.user.emailVerificationCode = null;
      req.user.emailVerificationExpiresAt = null;
      await req.user.save();
      return res.status(400).json({ message: "Email change request is no longer valid. Request again." });
    }

    if (challenge.currentCode !== code) {
      return res.status(400).json({ message: "Current email verification code is invalid" });
    }

    req.user.emailVerificationCode = buildEmailChangeChallenge({
      ...challenge,
      isCurrentVerified: true,
    });
    await req.user.save();

    await sendEmailChangeNewEmailVerificationEmail({
      to: challenge.newEmail,
      firstName: sanitizeName(req.user.firstName) || "there",
      code: challenge.newCode,
      verifyUrl: buildEmailChangeLink("new", req.user.id, challenge.newToken),
    });

    return res.status(200).json({
      message: "Current email verified. Code sent to your new email.",
      change: {
        currentEmail: challenge.currentEmail,
        newEmail: challenge.newEmail,
        step: "verify-new-email",
      },
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to verify current email", details: errorMessage(error) });
  }
});

router.get("/verify-email-change-link", async (req: Request, res: Response) => {
  try {
    const step = typeof req.query?.step === "string" ? req.query.step.trim().toLowerCase() : "";
    const userId = typeof req.query?.userId === "string" ? req.query.userId.trim() : "";
    const token = typeof req.query?.token === "string" ? req.query.token.trim() : "";

    if (!step || !userId || !token) {
      return res.status(400).send("Missing email change verification parameters.");
    }

    const user = await User.findByPk(userId);
    if (!user || !user.emailVerificationCode || !user.emailVerificationExpiresAt) {
      return res.status(400).send("Email change request is invalid.");
    }

    const expiresAtMs = new Date(user.emailVerificationExpiresAt).getTime();
    if (Number.isNaN(expiresAtMs) || expiresAtMs < Date.now()) {
      return res.status(400).send("Email change request expired. Request a new one.");
    }

    const challenge = parseEmailChangeChallenge(user.emailVerificationCode);
    if (!challenge) {
      return res.status(400).send("Email change request is invalid.");
    }

    if (step === "current") {
      if (challenge.currentEmail !== sanitizeEmail(user.email) || challenge.currentToken !== token) {
        return res.status(400).send("Current email verification link is invalid.");
      }

      user.emailVerificationCode = buildEmailChangeChallenge({
        ...challenge,
        isCurrentVerified: true,
      });
      await user.save();

      await sendEmailChangeNewEmailVerificationEmail({
        to: challenge.newEmail,
        firstName: sanitizeName(user.firstName) || "there",
        code: challenge.newCode,
        verifyUrl: buildEmailChangeLink("new", user.id, challenge.newToken),
      });

      return res.status(200).send("Current email verified. We sent verification to your new email.");
    }

    if (step === "new") {
      if (!challenge.isCurrentVerified) {
        return res.status(400).send("Verify your current email before confirming your new email.");
      }

      if (challenge.newToken !== token) {
        return res.status(400).send("New email verification link is invalid.");
      }

      const existingEmail = await User.findOne({ where: { email: challenge.newEmail } });
      if (existingEmail && existingEmail.id !== user.id) {
        return res.status(409).send("This email is already in use.");
      }

      user.email = challenge.newEmail;
      user.isEmailVerified = true;
      user.emailVerificationCode = null;
      user.emailVerificationExpiresAt = null;
      await user.save();

      return res.status(200).send("New email verified. Your account email has been updated.");
    }

    return res.status(400).send("Invalid email change verification step.");
  } catch (error) {
    return res.status(500).send(`Failed to verify email change: ${errorMessage(error)}`);
  }
});

router.post("/confirm-email-change", authMiddleware, async (req: Request<unknown, unknown, CodeBody>, res: Response) => {
  try {
    const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";
    if (!code) {
      return res.status(400).json({ message: "code is required" });
    }

    if (!req.user.emailVerificationCode || !req.user.emailVerificationExpiresAt) {
      return res.status(400).json({ message: "No pending email change found. Request a new code." });
    }

    const expiresAtMs = new Date(req.user.emailVerificationExpiresAt).getTime();
    if (Number.isNaN(expiresAtMs) || expiresAtMs < Date.now()) {
      return res.status(400).json({ message: "Email change code expired. Request a new one." });
    }

    const challenge = parseEmailChangeChallenge(req.user.emailVerificationCode);
    if (!challenge) {
      return res.status(400).json({ message: "No pending email change found. Request a new code." });
    }

    if (!challenge.isCurrentVerified) {
      return res.status(400).json({ message: "Verify your current email before confirming the new email." });
    }

    if (challenge.newCode !== code) {
      return res.status(400).json({ message: "New email verification code is invalid" });
    }

    const existingEmail = await User.findOne({ where: { email: challenge.newEmail } });
    if (existingEmail && existingEmail.id !== req.user.id) {
      return res.status(409).json({ message: "email already exists" });
    }

    req.user.email = challenge.newEmail;
    req.user.isEmailVerified = true;
    req.user.emailVerificationCode = null;
    req.user.emailVerificationExpiresAt = null;
    await req.user.save();

    return res.status(200).json({
      message: "Email updated",
      user: {
        id: req.user.id,
        firstName: req.user.firstName,
        lastName: req.user.lastName,
        email: req.user.email,
        isEmailVerified: Boolean(req.user.isEmailVerified),
      },
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to confirm email change", details: errorMessage(error) });
  }
});

router.patch("/password", authMiddleware, async (_req: Request, res: Response) => {
  return res.status(405).json({
    message: "Direct password updates are disabled. Use /api/auth/request-password-reset instead.",
  });
});

router.post("/request-password-reset", authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.user.email) {
      return res.status(400).json({ message: "An email address is required to change this password" });
    }

    const token = await issuePasswordResetToken(req.user);
    const resetUrl = buildPasswordResetUrl(token);

    await sendPasswordResetEmail({
      to: req.user.email,
      firstName: sanitizeName(req.user.firstName) || "there",
      username: req.user.username,
      resetUrl,
    });

    return res.status(200).json({
      message: "Password reset link sent. Check your email.",
      reset: {
        username: req.user.username,
        email: req.user.email,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to start password reset", details: errorMessage(error) });
  }
});

router.get("/password-reset-info", async (req: Request, res: Response) => {
  try {
    const token = typeof req.query?.token === "string" ? req.query.token.trim() : "";
    if (!token) {
      return res.status(400).json({ message: "Missing password reset token" });
    }

    const user = await User.findOne({ where: { passwordResetToken: token } });
    if (!user || !user.passwordResetExpiresAt) {
      return res.status(400).json({ message: "Password reset link is invalid" });
    }

    const expiresAtMs = new Date(user.passwordResetExpiresAt).getTime();
    if (Number.isNaN(expiresAtMs) || expiresAtMs < Date.now()) {
      return res.status(400).json({ message: "Password reset link expired. Request a new one." });
    }

    return res.status(200).json({
      reset: {
        username: user.username,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to inspect password reset", details: errorMessage(error) });
  }
});

router.post("/reset-password", async (req: Request<unknown, unknown, ResetPasswordBody>, res: Response) => {
  try {
    const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
    const newPassword = typeof req.body?.newPassword === "string" ? req.body.newPassword : "";

    if (!token || !newPassword) {
      return res.status(400).json({ message: "token and newPassword are required" });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ message: "new password must be at least 8 characters" });
    }

    const user = await User.findOne({ where: { passwordResetToken: token } });
    if (!user || !user.passwordResetExpiresAt) {
      return res.status(400).json({ message: "Password reset link is invalid" });
    }

    const expiresAtMs = new Date(user.passwordResetExpiresAt).getTime();
    if (Number.isNaN(expiresAtMs) || expiresAtMs < Date.now()) {
      return res.status(400).json({ message: "Password reset link expired. Request a new one." });
    }

    user.passwordHash = await bcrypt.hash(newPassword, 12);
    user.passwordResetToken = null;
    user.passwordResetExpiresAt = null;
    await user.save();

    return res.status(200).json({ message: "Password updated" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to reset password", details: errorMessage(error) });
  }
});

router.post("/request-account-deletion", authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.user.email) {
      return res.status(400).json({ message: "An email address is required to delete this account" });
    }

    const { token, code } = await issueAccountDeletionChallenge(req.user);
    const confirmUrl = buildDeletionConfirmUrl(token);

    await sendAccountDeletionEmail({
      to: req.user.email,
      firstName: sanitizeName(req.user.firstName) || "there",
      code,
      confirmUrl,
    });

    return res.status(200).json({
      message: "Deletion confirmation sent. Check your email.",
      deletion: {
        userId: req.user.id,
        email: req.user.email,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to start account deletion", details: errorMessage(error) });
  }
});

router.post("/confirm-account-deletion-code", async (req: Request<unknown, unknown, UserIdCodeBody>, res: Response) => {
  try {
    const userId = typeof req.body?.userId === "string" ? req.body.userId.trim() : "";
    const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";

    if (!userId || !code) {
      return res.status(400).json({ message: "userId and code are required" });
    }

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!user.accountDeletionCode || !user.accountDeletionExpiresAt) {
      return res.status(400).json({ message: "No deletion request found. Request deletion again." });
    }

    const expiresAtMs = new Date(user.accountDeletionExpiresAt).getTime();
    if (Number.isNaN(expiresAtMs) || expiresAtMs < Date.now()) {
      return res.status(400).json({ message: "Deletion code expired. Request deletion again." });
    }

    if (user.accountDeletionCode !== code) {
      return res.status(400).json({ message: "Deletion code is invalid" });
    }

    await user.destroy();
    return res.status(200).json({ message: "Account deleted" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to confirm account deletion", details: errorMessage(error) });
  }
});

router.get("/confirm-account-deletion", async (req: Request, res: Response) => {
  try {
    const token = typeof req.query?.token === "string" ? req.query.token.trim() : "";

    if (!token) {
      return res.status(400).send("Missing deletion token.");
    }

    const user = await User.findOne({ where: { accountDeletionToken: token } });
    if (!user || !user.accountDeletionExpiresAt) {
      return res.status(400).send("Deletion link is invalid.");
    }

    const expiresAtMs = new Date(user.accountDeletionExpiresAt).getTime();
    if (Number.isNaN(expiresAtMs) || expiresAtMs < Date.now()) {
      return res.status(400).send("Deletion link expired. Request deletion again.");
    }

    await user.destroy();
    return res.status(200).send("Your IvoryScribe account has been deleted.");
  } catch (error) {
    return res.status(500).send(`Failed to delete account: ${errorMessage(error)}`);
  }
});

router.delete("/account", authMiddleware, async (_req: Request, res: Response) => {
  return res.status(405).json({
    message: "Direct account deletion is disabled. Use /api/auth/request-account-deletion instead.",
  });
});

export default router;
