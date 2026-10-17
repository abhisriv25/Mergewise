import { prisma } from "../prisma.js";
import {
  fetchInstallationAccessToken,
  fetchInstallationRepositories,
} from "./github-app-auth.service.js";

export interface RepositorySyncResult {
  /** Repos that are new to Mergewise, or were just reconnected — the ones
   * whose docs need indexing. */
  newlyConnectedIds: string[];
  /** Repos the installation no longer has access to, now disconnected. */
  disconnectedIds: string[];
}

/** Scoped to the org pinned at install-start time (never a client-supplied
 * org id) — fetches the installation's repos from GitHub itself and upserts
 * them, keyed on (organizationId, githubRepoId) so re-running an install
 * never creates duplicates.
 *
 * GitHub is the source of truth for access: a connected repo the
 * installation can no longer see is disconnected. A repo an admin
 * disconnected in Mergewise stays disconnected even though GitHub still
 * lists it — unless it's in `reconnectGithubRepoIds`: the ids GitHub says
 * were just re-added, or "all" after an admin picks repos in GitHub's own
 * install screen. Either way someone chose those repos on GitHub, which is
 * how a repo comes back. */
export async function syncInstallationRepositories(
  organizationId: string,
  installationId: string,
  { reconnectGithubRepoIds = [] }: { reconnectGithubRepoIds?: string[] | "all" } = {},
): Promise<RepositorySyncResult> {
  const accessToken = await fetchInstallationAccessToken(installationId);
  const repos = await fetchInstallationRepositories(accessToken);

  const existing = await prisma.repository.findMany({ where: { organizationId } });
  const existingByGithubId = new Map(existing.map((repo) => [repo.githubRepoId, repo]));
  const shouldReconnect = (githubRepoId: string) =>
    reconnectGithubRepoIds === "all" || reconnectGithubRepoIds.includes(githubRepoId);
  const newlyConnectedIds: string[] = [];

  for (const repo of repos) {
    const before = existingByGithubId.get(repo.githubRepoId);
    const reconnecting = Boolean(before?.disconnectedAt) && shouldReconnect(repo.githubRepoId);

    const saved = await prisma.repository.upsert({
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
        ...(reconnecting ? { disconnectedAt: null } : {}),
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

    if (!before || reconnecting) newlyConnectedIds.push(saved.id);
  }

  const visible = new Set(repos.map((repo) => repo.githubRepoId));
  const disconnectedIds = existing
    .filter((repo) => repo.githubInstallationId === installationId && !repo.disconnectedAt && !visible.has(repo.githubRepoId))
    .map((repo) => repo.id);
  if (disconnectedIds.length > 0) {
    await prisma.repository.updateMany({
      where: { id: { in: disconnectedIds } },
      data: { disconnectedAt: new Date() },
    });
  }

  return { newlyConnectedIds, disconnectedIds };
}

/** Whether the installation can still see this GitHub repo — checked
 * before an admin reconnects a repo in Mergewise. */
export async function installationCanAccessRepository(installationId: string, githubRepoId: string) {
  const accessToken = await fetchInstallationAccessToken(installationId);
  const repos = await fetchInstallationRepositories(accessToken);
  return repos.some((repo) => repo.githubRepoId === githubRepoId);
}

/** Matches an incoming webhook event to the connected Mergewise repository
 * it belongs to — a disconnected repo matches nothing, so its events are
 * ignored. Returns the first match — if the same GitHub repo were ever
 * connected by two different organizations independently, only one org's
 * PR data gets synced from a given webhook event. Not handled because
 * nothing in this codebase creates that scenario yet. */
export async function findRepositoryByGithubIds(githubRepoId: string, githubInstallationId: string) {
  return prisma.repository.findFirst({
    where: { githubRepoId, githubInstallationId, disconnectedAt: null },
  });
}
