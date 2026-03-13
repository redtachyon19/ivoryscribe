import { Router } from "express";
import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import authMiddleware from "../middleware/auth.js";
import { Preference, User } from "../models/index.js";
import { sendVerificationEmail } from "../services/email.js";

const router = Router();
const { JWT_SECRET = "replace-this-with-a-secure-secret", JWT_EXPIRES_IN = "7d" } = process.env;
const EMAIL_VERIFICATION_TTL_MINUTES = 15;

function buildAuthResponse(user) {
  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
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

function maskEmail(email) {
  const [localPart = "", domain = ""] = String(email).split("@");
  if (!localPart || !domain) {
    return "";
  }

  const safeLocal =
    localPart.length <= 2 ? `${localPart[0] ?? "*"}*` : `${localPart.slice(0, 2)}${"*".repeat(Math.max(1, localPart.length - 2))}`;

  return `${safeLocal}@${domain}`;
}

function buildVerificationPendingResponse(user) {
  return {
    requiresEmailVerification: true,
    verification: {
      userId: user.id,
      email: user.email,
      emailMasked: maskEmail(user.email),
    },
  };
}

function sanitizeName(input) {
  return typeof input === "string" ? input.trim().slice(0, 80) : "";
}

function sanitizeEmail(input) {
  return typeof input === "string" ? input.trim().toLowerCase() : "";
}

function buildInternalUsernameFromEmail(email) {
  const localPart = String(email).split("@")[0] ?? "writer";
  const alphanumeric = localPart.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  const base = (alphanumeric || "writer").slice(0, 20);
  const suffix = randomInt(1000, 9999);
  return `${base}${suffix}`.slice(0, 32);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function generateVerificationCode() {
  return String(randomInt(100000, 1000000));
}

async function issueVerificationCode(user) {
  const code = generateVerificationCode();
  user.emailVerificationCode = code;
  user.emailVerificationExpiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TTL_MINUTES * 60 * 1000);
  await user.save();
  return code;
}

router.post("/register", async (req, res) => {
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
      await sendVerificationEmail({ to: user.email, firstName, code });
    } catch (mailError) {
      return res.status(502).json({
        message: "Account created but failed to send verification email. Please try resend.",
        details: mailError.message,
        ...buildVerificationPendingResponse(user),
      });
    }

    return res.status(201).json({
      message: "Account created. Check your email for a verification code.",
      ...buildVerificationPendingResponse(user),
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to register user", details: error.message });
  }
});

router.post("/login", async (req, res) => {
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
    return res.status(500).json({ message: "Failed to log in", details: error.message });
  }
});

router.post("/verify-email", async (req, res) => {
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
    return res.status(500).json({ message: "Failed to verify email", details: error.message });
  }
});

router.post("/resend-verification", async (req, res) => {
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
    return res.status(500).json({ message: "Failed to resend verification email", details: error.message });
  }
});

router.get("/account", authMiddleware, async (req, res) => {
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

router.patch("/account", authMiddleware, async (req, res) => {
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
    return res.status(500).json({ message: "Failed to update account", details: error.message });
  }
});

router.patch("/password", authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body ?? {};

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "currentPassword and newPassword are required" });
    }

    if (String(newPassword).length < 8) {
      return res.status(400).json({ message: "new password must be at least 8 characters" });
    }

    const isCurrentPasswordValid = await bcrypt.compare(String(currentPassword), req.user.passwordHash);
    if (!isCurrentPasswordValid) {
      return res.status(401).json({ message: "Current password is incorrect" });
    }

    req.user.passwordHash = await bcrypt.hash(String(newPassword), 12);
    await req.user.save();

    return res.status(200).json({ message: "Password updated" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to update password", details: error.message });
  }
});

router.delete("/account", authMiddleware, async (req, res) => {
  try {
    const { currentPassword } = req.body ?? {};

    if (!currentPassword) {
      return res.status(400).json({ message: "currentPassword is required" });
    }

    const isCurrentPasswordValid = await bcrypt.compare(String(currentPassword), req.user.passwordHash);
    if (!isCurrentPasswordValid) {
      return res.status(401).json({ message: "Current password is incorrect" });
    }

    await req.user.destroy();

    return res.status(200).json({ message: "Account deleted" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to delete account", details: error.message });
  }
});

export default router;
