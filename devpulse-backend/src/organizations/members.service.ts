import type { MembershipRole, Organization } from "@prisma/client";
import { GithubAppError } from "../github/github-app-auth.service.js";
import { logger } from "../logger.js";
import { prisma } from "../prisma.js";
import { belongsToLinkedGithubAccount, ensureOrganizationLinked } from "./github-link.service.js";

/** "member" / "not_member" are GitHub's answer; "unknown" means it couldn't
 * be asked (not linked yet, missing permission, GitHub down). */
export type GithubMembershipStatus = "member" | "not_member" | "unknown";

async function githubStatus(organization: Organization, githubLogin: string): Promise<GithubMembershipStatus> {
  if (!organization.githubAccountId) return "unknown";
  try {
    return (await belongsToLinkedGithubAccount(organization, githubLogin)) ? "member" : "not_member";
  } catch (err) {
    if (err instanceof GithubAppError) return "unknown";
    throw err;
  }
}

/** Everyone in the organization, with how they joined and — asked of
 * GitHub live — whether they still belong to its GitHub account. */
export async function listMembers(organization: Organization) {
  const linked = await ensureOrganizationLinked(organization);

  const memberships = await prisma.membership.findMany({
    where: { organizationId: organization.id },
    orderBy: { createdAt: "asc" },
    include: { user: true },
  });

  const invitations = await prisma.invitation.findMany({
    where: { organizationId: organization.id, acceptedById: { in: memberships.map((m) => m.userId) } },
    orderBy: { acceptedAt: "desc" },
    include: { invitedBy: true },
  });
  const invitationByUser = new Map<string, (typeof invitations)[number]>();
  for (const invitation of invitations) {
    if (invitation.acceptedById && !invitationByUser.has(invitation.acceptedById)) {
      invitationByUser.set(invitation.acceptedById, invitation);
    }
  }

  return Promise.all(
    memberships.map(async (membership) => {
      const invitation = invitationByUser.get(membership.userId);
      return {
        id: membership.id,
        role: membership.role,
        joinedAt: membership.createdAt,
        user: {
          id: membership.user.id,
          githubLogin: membership.user.githubLogin,
          displayName: membership.user.displayName,
          avatarUrl: membership.user.avatarUrl,
          lastActiveAt: membership.user.lastActiveAt,
        },
        invitedEmail: invitation?.email ?? null,
        invitedBy: invitation?.invitedBy?.githubLogin ?? null,
        githubStatus: await githubStatus(linked, membership.user.githubLogin),
      };
    }),
  );
}

export class LastAdminError extends Error {
  constructor() {
    super("An organization needs at least one admin");
  }
}

/** Null when there's no such membership in this organization. Refuses to
 * demote the last ADMIN; the count runs in the same transaction as the
 * change so two admins demoting each other can't both succeed. */
export async function changeMemberRole(organizationId: string, membershipId: string, role: MembershipRole) {
  return prisma.$transaction(async (tx) => {
    const membership = await tx.membership.findFirst({ where: { id: membershipId, organizationId } });
    if (!membership) return null;
    if (membership.role === role) return membership;

    if (membership.role === "ADMIN") {
      const admins = await tx.membership.count({ where: { organizationId, role: "ADMIN" } });
      if (admins <= 1) throw new LastAdminError();
    }
    return tx.membership.update({ where: { id: membership.id }, data: { role } });
  });
}

/** False when there's no such membership in this organization. Access ends
 * immediately: every request resolves the caller's organization afresh. */
export async function removeMember(organizationId: string, membershipId: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const membership = await tx.membership.findFirst({ where: { id: membershipId, organizationId } });
    if (!membership) return false;

    if (membership.role === "ADMIN") {
      const admins = await tx.membership.count({ where: { organizationId, role: "ADMIN" } });
      if (admins <= 1) throw new LastAdminError();
    }
    await tx.membership.delete({ where: { id: membership.id } });
    return true;
  });
}

/**
 * Run at sign-in: a MEMBER who has definitively left the organization's
 * GitHub account loses their Mergewise membership. Admins are left alone,
 * and anything short of GitHub saying "not a member" (an error, a missing
 * permission) changes nothing — nobody is removed on a blip.
 */
export async function removeMembershipsLostOnGithub(user: { id: string; githubLogin: string }) {
  let memberships;
  try {
    memberships = await prisma.membership.findMany({
      where: { userId: user.id, role: "MEMBER", organization: { githubAccountId: { not: null } } },
      include: { organization: true },
    });
  } catch (err) {
    // Never let this housekeeping stand between someone and signing in.
    logger.warn({ err, userId: user.id }, "Couldn't load memberships to re-check at sign-in");
    return;
  }

  for (const membership of memberships) {
    try {
      if (!(await belongsToLinkedGithubAccount(membership.organization, user.githubLogin))) {
        await prisma.membership.delete({ where: { id: membership.id } });
        logger.info(
          { userId: user.id, organizationId: membership.organizationId },
          "Removed a member who no longer belongs to the organization's GitHub account",
        );
      }
    } catch (err) {
      logger.warn({ err, membershipId: membership.id }, "Couldn't re-check GitHub membership at sign-in");
    }
  }
}
