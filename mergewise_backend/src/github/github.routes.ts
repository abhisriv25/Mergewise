import { randomBytes } from "node:crypto";
import { Router, type Response } from "express";
import type { Repository } from "@prisma/client";
import { resolvePrimaryOrganizationId } from "../auth/auth.service.js";
import { requireAuth } from "../auth/auth.routes.js";
import { env } from "../env.js";
import { indexRepositoryDocsInBackground } from "../knowledge/docs-indexer.js";
import { logger } from "../logger.js";
import { authFlowRateLimiter, repositoryActionRateLimiter } from "../middleware/rate-limit.js";
import { prisma } from "../prisma.js";
import { GithubLinkError, linkInstallationToOrganization } from "../organizations/github-link.service.js";
import {
  currentMembership,
  findCurrentMembership,
  requireOrganizationAdmin,
} from "../organizations/membership.service.js";
import { GithubAppError, GithubPermissionError } from "./github-app-auth.service.js";
import { installationCanAccessRepository, syncInstallationRepositories } from "./repository.service.js";

export const githubRouter = Router();

const SETUP_PATH = "/github/setup";
const INSTALL_FAILED_REDIRECT = `${env.WEB_BASE_URL}/repositories?error=install_failed`;
const GITHUB_UNREACHABLE = "Couldn't reach GitHub. Try again in a moment.";

function repositoryResponse(repo: Repository) {
  return {
    id: repo.id,
    owner: repo.owner,
    name: repo.name,
    fullName: repo.fullName,
    private: repo.private,
    connectedAt: repo.connectedAt.toISOString(),
    disconnectedAt: repo.disconnectedAt?.toISOString() ?? null,
    docsIndexedAt: repo.docsIndexedAt?.toISOString() ?? null,
  };
}

/** Only a repository in the caller's own organization — any other id is a
 * 404, same as a missing one. */
function findOrganizationRepository(organizationId: string, repositoryId: string) {
  return prisma.repository.findFirst({ where: { id: repositoryId, organizationId } });
}

/** Every repository, disconnected ones included, so the UI can offer to
 * reconnect them. */
githubRouter.get("/repositories", requireAuth, async (req, res) => {
  const organizationId = await resolvePrimaryOrganizationId(req.session.userId as string);

  if (!organizationId) {
    res.json({ repositories: [] });
    return;
  }

  const repositories = await prisma.repository.findMany({
    where: { organizationId },
    orderBy: { connectedAt: "desc" },
  });

  res.json({ repositories: repositories.map(repositoryResponse) });
});

/** Re-reads the installation's repo list from GitHub — the fallback for a
 * missed installation_repositories webhook after repos were added to or
 * removed from the App in GitHub's own settings. */
githubRouter.post(
  "/repositories/sync",
  repositoryActionRateLimiter,
  requireAuth,
  requireOrganizationAdmin,
  async (_req, res) => {
    const { organization } = currentMembership(res);
    if (!organization.githubInstallationId) {
      res.status(409).json({ error: { message: "Connect a repository first" } });
      return;
    }

    try {
      const result = await syncInstallationRepositories(organization.id, organization.githubInstallationId);
      indexRepositoryDocsInBackground(result.newlyConnectedIds);
      res.json({ added: result.newlyConnectedIds.length, disconnected: result.disconnectedIds.length });
    } catch (err) {
      if (err instanceof GithubAppError) {
        res.status(502).json({ error: { message: GITHUB_UNREACHABLE } });
        return;
      }
      throw err;
    }
  },
);

/** Stops tracking a repository without deleting anything: its PRs are
 * hidden and its webhooks ignored until an admin reconnects it. */
githubRouter.post(
  "/repositories/:id/disconnect",
  repositoryActionRateLimiter,
  requireAuth,
  requireOrganizationAdmin,
  async (req, res) => {
    const { organizationId } = currentMembership(res);
    const repository = await findOrganizationRepository(organizationId, req.params.id);
    if (!repository) {
      res.status(404).json({ error: { message: "Repository not found" } });
      return;
    }

    const updated = repository.disconnectedAt
      ? repository
      : await prisma.repository.update({ where: { id: repository.id }, data: { disconnectedAt: new Date() } });
    logger.info({ repositoryId: repository.id, organizationId }, "Repository disconnected");
    res.json(repositoryResponse(updated));
  },
);

/** Undoes a disconnect, as long as the GitHub App can still see the repo,
 * and re-indexes its docs since they may have changed in the meantime. */
githubRouter.post(
  "/repositories/:id/reconnect",
  repositoryActionRateLimiter,
  requireAuth,
  requireOrganizationAdmin,
  async (req, res) => {
    const { organizationId } = currentMembership(res);
    const repository = await findOrganizationRepository(organizationId, req.params.id);
    if (!repository) {
      res.status(404).json({ error: { message: "Repository not found" } });
      return;
    }
    if (!repository.disconnectedAt) {
      res.json(repositoryResponse(repository));
      return;
    }

    try {
      if (!(await installationCanAccessRepository(repository.githubInstallationId, repository.githubRepoId))) {
        res.status(409).json({
          error: {
            code: "access_removed",
            message: "The Mergewise GitHub App no longer has access to this repository. Add it back on GitHub first.",
          },
        });
        return;
      }
    } catch (err) {
      if (err instanceof GithubAppError) {
        res.status(502).json({ error: { message: GITHUB_UNREACHABLE } });
        return;
      }
      throw err;
    }

    const updated = await prisma.repository.update({ where: { id: repository.id }, data: { disconnectedAt: null } });
    logger.info({ repositoryId: repository.id, organizationId }, "Repository reconnected");
    indexRepositoryDocsInBackground([updated.id]);
    res.json(repositoryResponse(updated));
  },
);

githubRouter.get("/github/install-url", authFlowRateLimiter, requireAuth, async (req, res) => {
  const membership = await findCurrentMembership(req.session.userId as string);

  if (!membership) {
    res.status(400).json({ error: { message: "No organization to install into" } });
    return;
  }
  // Installing links the organization to a GitHub account and decides which
  // repos everyone sees — an admin decision. The browser navigates here
  // from a "Connect repo" link, so explain on the page rather than in JSON.
  if (membership.role !== "ADMIN") {
    res.redirect(`${env.WEB_BASE_URL}/repositories?error=admin_only`);
    return;
  }
  const organizationId = membership.organizationId;

  const state = randomBytes(16).toString("hex");
  req.session.githubInstallState = state;
  req.session.githubInstallOrgId = organizationId;

  const url = new URL(`https://github.com/apps/${env.GITHUB_APP_SLUG}/installations/new`);
  url.searchParams.set("state", state);
  res.redirect(url.toString());
});

githubRouter.get(SETUP_PATH, async (req, res) => {
  const { installation_id: installationId, state, setup_action: setupAction } = req.query;

  // An admin changed which repos the existing installation covers, from
  // GitHub's own settings — GitHub redirects here without our state. This
  // path links no account, so it only needs the installation to already be
  // the admin's own organization's.
  if (setupAction === "update" && typeof installationId === "string" && typeof state !== "string") {
    await handleInstallationUpdate(req.session.userId, installationId, res);
    return;
  }

  const expectedState = req.session.githubInstallState;
  const organizationId = req.session.githubInstallOrgId;
  req.session.githubInstallState = undefined;
  req.session.githubInstallOrgId = undefined;

  if (
    typeof installationId !== "string" ||
    typeof state !== "string" ||
    !expectedState ||
    !organizationId ||
    state !== expectedState
  ) {
    res.redirect(INSTALL_FAILED_REDIRECT);
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: req.session.userId as string } });
  if (!user) {
    res.redirect(INSTALL_FAILED_REDIRECT);
    return;
  }

  try {
    await linkInstallationToOrganization(organizationId, installationId, user);
    // The admin just picked these repos on GitHub, so any that were
    // disconnected come back too.
    const result = await syncInstallationRepositories(organizationId, installationId, {
      reconnectGithubRepoIds: "all",
    });
    indexRepositoryDocsInBackground(result.newlyConnectedIds);
    res.redirect(`${env.WEB_BASE_URL}/repositories`);
  } catch (err) {
    if (err instanceof GithubLinkError) {
      res.redirect(`${env.WEB_BASE_URL}/repositories?error=${err.code}`);
      return;
    }
    if (err instanceof GithubPermissionError) {
      res.redirect(`${env.WEB_BASE_URL}/repositories?error=app_permission_missing`);
      return;
    }
    if (err instanceof GithubAppError) {
      res.redirect(INSTALL_FAILED_REDIRECT);
      return;
    }
    throw err;
  }
});

async function handleInstallationUpdate(userId: string | undefined, installationId: string, res: Response) {
  const membership = userId ? await findCurrentMembership(userId) : null;
  if (!membership || membership.role !== "ADMIN" || membership.organization.githubInstallationId !== installationId) {
    res.redirect(INSTALL_FAILED_REDIRECT);
    return;
  }

  try {
    const result = await syncInstallationRepositories(membership.organizationId, installationId, {
      reconnectGithubRepoIds: "all",
    });
    indexRepositoryDocsInBackground(result.newlyConnectedIds);
    res.redirect(`${env.WEB_BASE_URL}/repositories`);
  } catch (err) {
    if (err instanceof GithubAppError) {
      res.redirect(INSTALL_FAILED_REDIRECT);
      return;
    }
    throw err;
  }
}
