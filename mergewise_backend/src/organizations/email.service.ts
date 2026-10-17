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

export interface InvitationEmailInput {
  to: string;
  organizationName: string;
  inviterLogin: string;
  url: string;
  expiresAt: Date;
  /** The GitHub account the organization is linked to, which decides who
   * can join. Null before the organization has connected a repository. */
  githubAccount: { login: string; type: string } | null;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Fri 18 Oct 2026, 13:05 UTC" — in UTC, and saying so, since we don't
 * know the reader's time zone. Built by hand rather than with
 * toLocaleString, whose punctuation varies between Node versions. */
function formatExpiry(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${WEEKDAYS[date.getUTCDay()]} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}, ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`
  );
}

/** Who can accept, in the same terms the server checks at sign-in (see
 * belongsToLinkedGithubAccount): members of a GitHub organization, or for a
 * personal account, collaborators on its connected repositories. */
function joinRule(githubAccount: InvitationEmailInput["githubAccount"]): string {
  if (!githubAccount) return "You'll sign in with your GitHub account.";
  if (githubAccount.type === "Organization") {
    return `You'll sign in with GitHub. Your account needs to be a member of the ${githubAccount.login} organization on GitHub.`;
  }
  return `You'll sign in with GitHub. Your account needs access to at least one of ${githubAccount.login}'s repositories connected to Mergewise.`;
}

const ABOUT_MERGEWISE =
  "Mergewise scores every pull request by review risk, with every point explained, so your team spends review time where it matters.";

/** The invitation email's subject, plain text and HTML. Pure, so it can be
 * tested and previewed without sending anything. The HTML is table-based
 * with inline styles, which is what email clients (Outlook included)
 * reliably render. */
export function renderInvitationEmail(input: InvitationEmailInput) {
  const site = env.WEB_BASE_URL;
  const expiry = formatExpiry(input.expiresAt);
  const rule = joinRule(input.githubAccount);
  const subject = `${input.inviterLogin} invited you to join ${input.organizationName} on Mergewise`;
  const preheader = `Join your team on Mergewise. The link works once and expires ${expiry}.`;

  const text = [
    `${input.inviterLogin} invited you to join ${input.organizationName} on Mergewise.`,
    "",
    ABOUT_MERGEWISE,
    "",
    `Accept the invitation: ${input.url}`,
    "",
    rule,
    `The link works once and expires on ${expiry}.`,
    "",
    `You're receiving this because ${input.inviterLogin} invited ${input.to} on Mergewise. ` +
      "If you weren't expecting it, you can ignore this email; nothing happens unless you open the link.",
  ].join("\n");

  const e = {
    org: escapeHtml(input.organizationName),
    inviter: escapeHtml(input.inviterLogin),
    url: escapeHtml(input.url),
    to: escapeHtml(input.to),
    rule: escapeHtml(rule),
    expiry: escapeHtml(expiry),
    avatar: escapeHtml(`https://github.com/${encodeURIComponent(input.inviterLogin)}.png?size=96`),
    logo: escapeHtml(`${site}/logo-full.png`),
    site: escapeHtml(site),
  };

  const font = "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;";

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f1f5f9;">
<tr><td align="center" style="padding:32px 16px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
    <tr><td style="padding:0 4px 20px;">
      <a href="${e.site}" style="text-decoration:none;"><img src="${e.logo}" width="150" height="32" alt="Mergewise" style="display:block;border:0;width:150px;height:auto;"></a>
    </td></tr>
    <tr><td style="background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td style="height:4px;background:#10b981;font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td style="padding:32px 32px 8px;${font}">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td style="vertical-align:middle;padding-right:14px;">
              <img src="${e.avatar}" width="48" height="48" alt="" style="display:block;border:0;border-radius:24px;">
            </td>
            <td style="vertical-align:middle;${font}font-size:14px;color:#64748b;">
              <strong style="color:#0f172a;">${e.inviter}</strong> invited you
            </td>
          </tr></table>
          <h1 style="margin:22px 0 0;${font}font-size:24px;line-height:32px;font-weight:700;color:#0f172a;">Join ${e.org} on Mergewise</h1>
          <p style="margin:12px 0 0;${font}font-size:15px;line-height:24px;color:#475569;">${escapeHtml(ABOUT_MERGEWISE)}</p>
        </td></tr>
        <tr><td align="center" style="padding:24px 32px 8px;">
          <table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;"><tr>
            <td style="border-radius:10px;background:#0f172a;">
              <a href="${e.url}" style="display:inline-block;padding:14px 26px;${font}font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">Accept invitation</a>
            </td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:20px 32px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;">
            <tr><td style="padding:16px 18px;${font}font-size:13px;line-height:20px;color:#475569;">
              ${e.rule}<br>
              The link works once and expires on <strong style="color:#0f172a;">${e.expiry}</strong>.
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:20px 32px 32px;${font}font-size:12px;line-height:18px;color:#64748b;">
          Button not working? Paste this link into your browser:<br>
          <a href="${e.url}" style="color:#0f766e;word-break:break-all;">${e.url}</a>
        </td></tr>
      </table>
    </td></tr>
    <tr><td style="padding:20px 8px 0;${font}font-size:12px;line-height:18px;color:#94a3b8;">
      You're receiving this because ${e.inviter} invited ${e.to} on Mergewise. If you weren't expecting it, you can ignore this email; nothing happens unless you open the link.<br><br>
      <a href="${e.site}" style="color:#94a3b8;">Mergewise</a> · Pull request risk scoring for GitHub
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;

  return { subject, text, html };
}

/**
 * Sends one invitation email through Resend. Returns whether it was sent —
 * false when email isn't configured or Resend refuses — so the caller can
 * fall back to showing the admin the link instead of failing the invite.
 */
export async function sendInvitationEmail(input: InvitationEmailInput): Promise<boolean> {
  if (!isEmailConfigured()) return false;

  const { subject, text, html } = renderInvitationEmail(input);

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: env.EMAIL_FROM, to: [input.to], subject, text, html }),
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
