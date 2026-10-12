import { createHash, randomBytes } from "node:crypto";
import type { Invitation, Organization } from "@prisma/client";
import { env } from "../env.js";
import { GithubAppError } from "../github/github-app-auth.service.js";
import { logger } from "../logger.js";
import { prisma } from "../prisma.js";
import { sendInvitationEmail } from "./email.service.js";
import { belongsToLinkedGithubAccount, ensureOrganizationLinked } from "./github-link.service.js";

export const INVITATION_TTL_MS = 24 * 60 * 60 * 1000;

/** What an invite link's token looks like — checked before any lookup so
 * junk never reaches the database or the session. */
export const INVITATION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function invitationUrl(token: string): string {
  return `${env.WEB_BASE_URL}/invite/${token}`;
}

export type InvitationStatus = "pending" | "expired" | "accepted" | "revoked";

export function invitationStatus(
  invitation: Pick<Invitation, "acceptedAt" | "revokedAt" | "expiresAt">,
  now = new Date(),
): InvitationStatus {
  if (invitation.acceptedAt) return "accepted";
  if (invitation.revokedAt) return "revoked";
  if (invitation.expiresAt <= now) return "expired";
  return "pending";
}

/** Revokes any still-open invitation for this email in this organization,
 * then issues a fresh one — so there's only ever one live link per person. */
async function issueInvitation(organization: Organization, email: string, inviter: { id: string; githubLogin: string }) {
  const now = new Date();
  await prisma.invitation.updateMany({
    where: { organizationId: organization.id, email, acceptedAt: null, revokedAt: null },
    data: { revokedAt: now },
  });

  const token = randomBytes(32).toString("base64url");
  const invitation = await prisma.invitation.create({
    data: {
      organizationId: organization.id,
      email,
      tokenHash: hashInvitationToken(token),
      role: "MEMBER",
      invitedById: inviter.id,
      expiresAt: new Date(now.getTime() + INVITATION_TTL_MS),
    },
  });

  const url = invitationUrl(token);
  const emailSent = await sendInvitationEmail({
    to: email,
    organizationName: organization.name,
    inviterLogin: inviter.githubLogin,
    url,
  });

  // The link is only ever returned here, at creation: the token itself is
  // never stored, so it can't be shown again later.
  return { invitation, url, emailSent };
}

export async function createInvitations(
  organization: Organization,
  inviter: { id: string; githubLogin: string },
  emails: string[],
) {
  const unique = [...new Set(emails.map((email) => email.trim().toLowerCase()))];
  const results = [];
  for (const email of unique) {
    results.push(await issueInvitation(organization, email, inviter));
  }
  return results;
}

/** A new link for an invitation that hasn't been accepted; the old link
 * stops working. Null when there's no such invitation in this organization. */
export async function resendInvitation(
  organization: Organization,
  invitationId: string,
  inviter: { id: string; githubLogin: string },
) {
  const invitation = await prisma.invitation.findFirst({
    where: { id: invitationId, organizationId: organization.id, acceptedAt: null },
  });
  if (!invitation) return null;
  return issueInvitation(organization, invitation.email, inviter);
}

/** False when there's no open invitation with this id in this organization. */
export async function revokeInvitation(organizationId: string, invitationId: string): Promise<boolean> {
  const { count } = await prisma.invitation.updateMany({
    where: { id: invitationId, organizationId, acceptedAt: null, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return count > 0;
}

export function listInvitations(organizationId: string) {
  return prisma.invitation.findMany({
    where: { organizationId, acceptedAt: null },
    orderBy: { createdAt: "desc" },
    include: { invitedBy: true },
    take: 200,
  });
}

/** What the accept-invitation page shows before anyone signs in. Null for
 * an unknown token. */
export async function previewInvitation(token: string) {
  const invitation = await prisma.invitation.findUnique({
    where: { tokenHash: hashInvitationToken(token) },
    include: { organization: true, invitedBy: true },
  });
  if (!invitation) return null;

  return {
    organizationName: invitation.organization.name,
    githubAccountLogin: invitation.organization.githubAccountLogin,
    githubAccountType: invitation.organization.githubAccountType,
    invitedBy: invitation.invitedBy?.githubLogin ?? null,
    email: invitation.email,
    expiresAt: invitation.expiresAt,
    status: invitationStatus(invitation),
  };
}

export type AcceptFailure =
  | "invalid"
  | "expired"
  | "used"
  | "revoked"
  | "other_organization"
  | "not_linked"
  | "not_in_github"
  | "github_unavailable";

export type AcceptResult = { ok: true; organizationId: string } | { ok: false; reason: AcceptFailure };

/**
 * Joins a just-signed-in user to the organization an invitation is for.
 * Every check must pass: the link exists, isn't revoked, used or expired;
 * the user isn't already in another organization; and their GitHub account
 * belongs to the organization's GitHub account. The link is claimed with a
 * conditional update inside the same transaction as the membership, so two
 * simultaneous uses can't both succeed.
 */
export async function acceptInvitation(
  token: string,
  user: { id: string; githubLogin: string },
): Promise<AcceptResult> {
  const invitation = await prisma.invitation.findUnique({
    where: { tokenHash: hashInvitationToken(token) },
    include: { organization: true },
  });
  if (!invitation) return { ok: false, reason: "invalid" };

  const existing = await prisma.membership.findFirst({ where: { userId: user.id } });
  if (existing?.organizationId === invitation.organizationId) {
    // Already in — e.g. they opened the link twice. Nothing to do.
    return { ok: true, organizationId: invitation.organizationId };
  }

  const status = invitationStatus(invitation);
  if (status === "accepted") return { ok: false, reason: "used" };
  if (status === "revoked") return { ok: false, reason: "revoked" };
  if (status === "expired") return { ok: false, reason: "expired" };
  if (existing) return { ok: false, reason: "other_organization" };

  const organization = await ensureOrganizationLinked(invitation.organization);
  if (!organization.githubAccountId) return { ok: false, reason: "not_linked" };

  try {
    if (!(await belongsToLinkedGithubAccount(organization, user.githubLogin))) {
      return { ok: false, reason: "not_in_github" };
    }
  } catch (err) {
    if (err instanceof GithubAppError) {
      logger.warn({ err, organizationId: organization.id }, "Couldn't check GitHub membership for an invitation");
      return { ok: false, reason: "github_unavailable" };
    }
    throw err;
  }

  const now = new Date();
  const joined = await prisma.$transaction(async (tx) => {
    const claimed = await tx.invitation.updateMany({
      where: { id: invitation.id, acceptedAt: null, revokedAt: null, expiresAt: { gt: now } },
      data: { acceptedAt: now, acceptedById: user.id },
    });
    if (claimed.count === 0) return false;

    await tx.membership.create({
      data: { userId: user.id, organizationId: invitation.organizationId, role: invitation.role },
    });
    return true;
  });

  return joined ? { ok: true, organizationId: invitation.organizationId } : { ok: false, reason: "used" };
}
