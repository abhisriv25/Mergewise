import { prisma } from "../prisma.js";
import {
  fetchInstallationAccessToken,
  fetchInstallationRepositories,
} from "./github-app-auth.service.js";

/** Scoped to the org pinned at install-start time (never a client-supplied
 * org id) — fetches the installation's repos from GitHub itself and upserts
 * them, keyed on (organizationId, githubRepoId) so re-running an install
 * never creates duplicates. */
export async function syncInstallationRepositories(
  organizationId: string,
  installationId: string,
): Promise<void> {
  const accessToken = await fetchInstallationAccessToken(installationId);
  const repos = await fetchInstallationRepositories(accessToken);

  for (const repo of repos) {
    await prisma.repository.upsert({
      where: {
        organizationId_githubRepoId: {
          organizationId,
          githubRepoId: repo.githubRepoId,
        },
      },
      update: {
        githubInstallationId: installationId,
        owner: repo.owner,
        name: repo.name,
        fullName: repo.fullName,
        private: repo.private,
      },
      create: {
        organizationId,
        githubInstallationId: installationId,
        githubRepoId: repo.githubRepoId,
        owner: repo.owner,
        name: repo.name,
        fullName: repo.fullName,
        private: repo.private,
      },
    });
  }
}

/** Matches an incoming webhook event to the Mergewise-connected repository
 * it belongs to. Returns the first match — if the same GitHub repo were
 * ever connected by two different organizations independently, only one
 * org's PR data gets synced from a given webhook event. Not handled
 * because nothing in this codebase creates that scenario yet. */
export async function findRepositoryByGithubIds(githubRepoId: string, githubInstallationId: string) {
  return prisma.repository.findFirst({
    where: { githubRepoId, githubInstallationId },
  });
}
