import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma.js";
import type { GithubOAuthProfile } from "./github-oauth.service.js";

/**
 * Upserts the User row for this GitHub identity. Signing in never creates an
 * organization: a user with no membership is sent to create one (see
 * createOrganizationForUser), and later slices let them join by invitation.
 */
export async function findOrCreateUserForGithubProfile(profile: GithubOAuthProfile) {
  return prisma.user.upsert({
    where: { githubId: profile.githubId },
    update: {
      githubLogin: profile.githubLogin,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
    },
    create: {
      githubId: profile.githubId,
      githubLogin: profile.githubLogin,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
    },
  });
}

export class AlreadyInOrganizationError extends Error {
  constructor() {
    super("You already belong to an organization");
  }
}

/** "Acme Inc." -> "acme-inc"; falls back to "org" when nothing usable is left. */
export function slugifyOrganizationName(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
  return slug || "org";
}

/**
 * Creates an organization with the caller as its ADMIN, in one write so an
 * organization never exists without an admin. One organization per user for
 * now — resolvePrimaryOrganizationId assumes it until org switching exists.
 */
export async function createOrganizationForUser(userId: string, name: string) {
  const existing = await prisma.membership.findFirst({ where: { userId } });
  if (existing) throw new AlreadyInOrganizationError();

  const baseSlug = slugifyOrganizationName(name);
  const candidates = [baseSlug, `${baseSlug}-${randomBytes(3).toString("hex")}`, `${baseSlug}-${randomBytes(3).toString("hex")}`];

  for (const slug of candidates) {
    try {
      return await prisma.organization.create({
        data: { name, slug, memberships: { create: { userId, role: "ADMIN" } } },
      });
    } catch (err) {
      const isSlugCollision =
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002" &&
        (err.meta?.target as string[] | undefined)?.includes("slug");
      if (!isSlugCollision) throw err;
    }
  }

  throw new Error(`Could not allocate a unique organization slug for "${name}"`);
}

/**
 * "The" organization a user belongs to, or null before they've created or
 * joined one. A user has at most one membership today (see
 * createOrganizationForUser), so "their first membership" is correct — this
 * is a placeholder for real org selection once multi-org membership exists.
 */
export async function resolvePrimaryOrganizationId(userId: string): Promise<string | null> {
  const membership = await prisma.membership.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });

  return membership?.organizationId ?? null;
}
