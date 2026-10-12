import { Prisma, type Organization } from "@prisma/client";
import {
  fetchInstallationAccessToken,
  fetchInstallationAccount,
  isGithubOrganizationMember,
  isGithubOrganizationOwner,
  isGithubRepositoryCollaborator,
} from "../github/github-app-auth.service.js";
import { logger } from "../logger.js";
import { prisma } from "../prisma.js";

export type GithubLinkFailure =
  /** This Mergewise organization is already tied to a different GitHub account. */
  | "account_mismatch"
  /** Another Mergewise organization already claimed that GitHub account. */
  | "account_taken"
  /** The signed-in person doesn't own the GitHub account they installed on. */
  | "not_account_owner";

export class GithubLinkError extends Error {
  constructor(readonly code: GithubLinkFailure) {
    super(code);
  }
}

function isUniqueViolation(err: unknown, field: string) {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === "P2002" &&
    ((err.meta?.target as string[] | undefined)?.includes(field) ?? false)
  );
}

/**
 * Ties an organization to the GitHub account a just-finished App install
 * belongs to. The installation id arrives in a redirect URL anyone could
 * edit, so the account is looked up from GitHub and the signed-in person
 * must own it: be that user, or an owner of that GitHub organization.
 * Throws GithubLinkError, or GithubAppError/GithubPermissionError when
 * GitHub can't answer.
 */
export async function linkInstallationToOrganization(
  organizationId: string,
  installationId: string,
  user: { githubId: string; githubLogin: string },
) {
  const account = await fetchInstallationAccount(installationId);
  const organization = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });

  if (organization.githubAccountId && organization.githubAccountId !== account.id) {
    throw new GithubLinkError("account_mismatch");
  }

  if (account.type === "Organization") {
    const token = await fetchInstallationAccessToken(installationId);
    if (!(await isGithubOrganizationOwner(token, account.login, user.githubLogin))) {
      throw new GithubLinkError("not_account_owner");
    }
  } else if (account.id !== user.githubId) {
    throw new GithubLinkError("not_account_owner");
  }

  try {
    await prisma.organization.update({
      where: { id: organizationId },
      data: {
        githubAccountId: account.id,
        githubAccountLogin: account.login,
        githubAccountType: account.type,
        githubInstallationId: installationId,
      },
    });
  } catch (err) {
    if (isUniqueViolation(err, "githubAccountId")) throw new GithubLinkError("account_taken");
    throw err;
  }
}

/**
 * Organizations whose repos were connected before GitHub-account linking
 * existed have an installation but no link. Fills it in from that
 * installation (leaving it unlinked if another organization already holds
 * the account) and returns the organization as it now stands.
 */
export async function ensureOrganizationLinked(organization: Organization): Promise<Organization> {
  if (organization.githubAccountId) return organization;

  const repository = await prisma.repository.findFirst({
    where: { organizationId: organization.id },
    orderBy: { connectedAt: "asc" },
  });
  if (!repository) return organization;

  try {
    const account = await fetchInstallationAccount(repository.githubInstallationId);
    return await prisma.organization.update({
      where: { id: organization.id },
      data: {
        githubAccountId: account.id,
        githubAccountLogin: account.login,
        githubAccountType: account.type,
        githubInstallationId: repository.githubInstallationId,
      },
    });
  } catch (err) {
    if (isUniqueViolation(err, "githubAccountId")) return organization;
    logger.warn({ err, organizationId: organization.id }, "Couldn't backfill the organization's GitHub link");
    return organization;
  }
}

export class OrganizationNotLinkedError extends Error {
  constructor() {
    super("This organization isn't linked to a GitHub account yet");
  }
}

/**
 * Whether a GitHub user belongs to the organization's GitHub account: a
 * member of the GitHub organization, or — for an account that's a person,
 * which has no members — that person or a collaborator on one of the
 * connected repositories. Errors (missing permission, GitHub down) throw
 * rather than answer "no", so nobody is turned away or removed on a blip.
 */
export async function belongsToLinkedGithubAccount(organization: Organization, githubLogin: string): Promise<boolean> {
  if (!organization.githubInstallationId || !organization.githubAccountLogin) {
    throw new OrganizationNotLinkedError();
  }

  const token = await fetchInstallationAccessToken(organization.githubInstallationId);

  if (organization.githubAccountType === "Organization") {
    return isGithubOrganizationMember(token, organization.githubAccountLogin, githubLogin);
  }

  if (organization.githubAccountLogin.toLowerCase() === githubLogin.toLowerCase()) return true;

  const repositories = await prisma.repository.findMany({
    where: { organizationId: organization.id, githubInstallationId: organization.githubInstallationId },
    orderBy: { connectedAt: "asc" },
    take: 20,
  });
  for (const repository of repositories) {
    if (await isGithubRepositoryCollaborator(token, repository.owner, repository.name, githubLogin)) return true;
  }
  return false;
}
