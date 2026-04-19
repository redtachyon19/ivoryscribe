import { Resend } from "resend";

const {
  RESEND_API_KEY = "",
  RESEND_FROM_EMAIL = "IvoryScribe <noreply@ivoryscribe.com>",
} = process.env;

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

export function isEmailServiceConfigured() {
  return Boolean(resend);
}

export async function sendVerificationEmail({ to, firstName, code }) {
  if (!resend) {
    throw new Error("Resend is not configured. Set RESEND_API_KEY in backend/.env");
  }

  await resend.emails.send({
    from: RESEND_FROM_EMAIL,
    to,
    subject: "Verify your IvoryScribe account",
    text: `Hi ${firstName || "there"},\n\nYour IvoryScribe verification code is: ${code}\n\nThis code expires in 15 minutes.\n\nIf you did not create this account, you can ignore this email.`,
  });
}

export async function sendAccountDeletionEmail({ to, firstName, code, confirmUrl }) {
  if (!resend) {
    throw new Error("Resend is not configured. Set RESEND_API_KEY in backend/.env");
  }

  await resend.emails.send({
    from: RESEND_FROM_EMAIL,
    to,
    subject: "Confirm account deletion for IvoryScribe",
    text:
      `Hi ${firstName || "there"},\n\n` +
      `We received a request to permanently delete your IvoryScribe account.\n\n` +
      `Your 6-digit deletion code is: ${code}\n\n` +
      `Confirm with this link: ${confirmUrl}\n\n` +
      `This request expires in 15 minutes. If you did not request this, you can ignore this email.`,
  });
}

export async function sendPasswordResetEmail({ to, firstName, username, resetUrl }) {
  if (!resend) {
    throw new Error("Resend is not configured. Set RESEND_API_KEY in backend/.env");
  }

  await resend.emails.send({
    from: RESEND_FROM_EMAIL,
    to,
    subject: "Reset your IvoryScribe password",
    text:
      `Hi ${firstName || "there"},\n\n` +
      `We received a request to change your IvoryScribe password.\n\n` +
      `Username: ${username}\n\n` +
      `Open this link to set a new password: ${resetUrl}\n\n` +
      `This link expires in 15 minutes. If you did not request this, you can ignore this email.`,
  });
}

export async function sendEmailChangeCurrentEmailVerificationEmail({ to, firstName, code, newEmail, verifyUrl }) {
  if (!resend) {
    throw new Error("Resend is not configured. Set RESEND_API_KEY in backend/.env");
  }

  await resend.emails.send({
    from: RESEND_FROM_EMAIL,
    to,
    subject: "Verify current email for IvoryScribe change",
    text:
      `Hi ${firstName || "there"},\n\n` +
      `You requested an IvoryScribe account email change to: ${newEmail}\n\n` +
      `Use this 6-digit code to verify your current email first: ${code}\n\n` +
      `Or open this verification link: ${verifyUrl}\n\n` +
      `This code expires in 15 minutes. If you did not request this, you can ignore this email.`,
  });
}

export async function sendEmailChangeNewEmailVerificationEmail({ to, firstName, code, verifyUrl }) {
  if (!resend) {
    throw new Error("Resend is not configured. Set RESEND_API_KEY in backend/.env");
  }

  await resend.emails.send({
    from: RESEND_FROM_EMAIL,
    to,
    subject: "Verify new email for IvoryScribe account",
    text:
      `Hi ${firstName || "there"},\n\n` +
      `Use this 6-digit code to confirm this as your new IvoryScribe account email: ${code}\n\n` +
      `Or open this verification link: ${verifyUrl}\n\n` +
      `This code expires in 15 minutes. If you did not request this, you can ignore this email.`,
  });
}
