import { Resend } from "resend";

const {
  RESEND_API_KEY = "",
  RESEND_FROM_EMAIL = "IvoryScribe <onboarding@resend.dev>",
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
