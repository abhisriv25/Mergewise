import { env } from "../env.js";
import { logger } from "../logger.js";

export function isEmailConfigured(): boolean {
  return Boolean(env.RESEND_API_KEY && env.EMAIL_FROM);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Sends one invitation email through Resend. Returns whether it was sent —
 * false when email isn't configured or Resend refuses — so the caller can
 * fall back to showing the admin the link instead of failing the invite.
 */
export async function sendInvitationEmail(input: {
  to: string;
  organizationName: string;
  inviterLogin: string;
  url: string;
}): Promise<boolean> {
  if (!isEmailConfigured()) return false;

  const org = escapeHtml(input.organizationName);
  const inviter = escapeHtml(input.inviterLogin);
  const url = escapeHtml(input.url);

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [input.to],
        subject: `${input.inviterLogin} invited you to ${input.organizationName} on Mergewise`,
        text:
          `${input.inviterLogin} invited you to join ${input.organizationName} on Mergewise.\n\n` +
          `Accept the invitation: ${input.url}\n\n` +
          `The link works once and expires in 24 hours. You'll sign in with your GitHub account, ` +
          `which must belong to the team's GitHub organization.\n\n` +
          `If you weren't expecting this, you can ignore this email.`,
        html:
          `<p><strong>${inviter}</strong> invited you to join <strong>${org}</strong> on Mergewise.</p>` +
          `<p><a href="${url}">Accept the invitation</a></p>` +
          `<p>The link works once and expires in 24 hours. You'll sign in with your GitHub account, ` +
          `which must belong to the team's GitHub organization.</p>` +
          `<p style="color:#64748b">If you weren't expecting this, you can ignore this email.</p>`,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      logger.warn({ status: res.status }, "Resend refused an invitation email");
      return false;
    }
    return true;
  } catch (err) {
    logger.warn({ err }, "Couldn't send an invitation email");
    return false;
  }
}
