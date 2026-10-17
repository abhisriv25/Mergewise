import type { WebhookEvent } from "@prisma/client";
import { GithubAppError, fetchInstallationAccessToken } from "../github/github-app-auth.service.js";
import { GithubApiNotFoundError, fetchPullRequest } from "../github/pull-request.service.js";
import { findRepositoryByGithubIds, syncInstallationRepositories } from "../github/repository.service.js";
import { indexRepositoryDocs, indexRepositoryDocsInBackground } from "../knowledge/docs-indexer.js";
import { logger } from "../logger.js";
import { prisma } from "../prisma.js";
import { getOrCreateLatestRiskAssessment } from "../risk/risk-assessment.service.js";
import { upsertPullRequest } from "./pull-request.repository.js";

interface PullRequestWebhookPayload {
  number?: number;
  pull_request?: { number?: number };
}

interface InstallationRepositoriesPayload {
  repositories_added?: { id?: number }[];
}

function extractPrNumber(payload: unknown): number | undefined {
  const body = payload as PullRequestWebhookPayload;
  if (typeof body?.number === "number") return body.number;
  if (typeof body?.pull_request?.number === "number") return body.pull_request.number;
  return undefined;
}

async function markEvent(id: string, status: "PROCESSED" | "FAILED" | "IGNORED") {
  await prisma.webhookEvent.update({
    where: { id },
    data: { status, processedAt: new Date() },
  });
}

/** Dispatches one RECEIVED WebhookEvent by type. The webhook route only
 * stores the event types handled here as RECEIVED; anything else is
 * already IGNORED. */
export async function processWebhookEvent(event: WebhookEvent): Promise<void> {
  switch (event.eventType) {
    case "push":
      return processDocsPush(event);
    case "installation_repositories":
      return processInstallationRepositoriesChange(event);
    case "installation":
      return processInstallationRemoved(event);
    default:
      return processPullRequestEvent(event);
  }
}

/** Turns one pull_request event into current PullRequest state. Never
 * trusts the webhook payload's own PR fields — always fetches the PR's
 * canonical state from GitHub, using the GitHub App installation's
 * credentials, not any user's OAuth token, since the installation (not
 * whoever happened to be logged in) is what was actually granted access. */
async function processPullRequestEvent(event: WebhookEvent): Promise<void> {
  const prNumber = extractPrNumber(event.payload);

  if (!event.githubRepoId || !event.githubInstallationId || prNumber === undefined) {
    await markEvent(event.id, "FAILED");
    return;
  }

  const repository = await findRepositoryByGithubIds(event.githubRepoId, event.githubInstallationId);

  // Not an error — the repo may have been disconnected since, or this is
  // an installation Mergewise doesn't track. Nothing to retry.
  if (!repository) {
    await markEvent(event.id, "IGNORED");
    return;
  }

  try {
    const accessToken = await fetchInstallationAccessToken(event.githubInstallationId);
    const pr = await fetchPullRequest(accessToken, repository.owner, repository.name, prNumber);
    const saved = await upsertPullRequest(repository.id, pr);
    await markEvent(event.id, "PROCESSED");
    await scoreBestEffort(saved.id, event.id);
  } catch (err) {
    if (err instanceof GithubApiNotFoundError) {
      await markEvent(event.id, "FAILED");
      return;
    }

    // Transient (network blip, GitHub 5xx, rate limit) — leave the event
    // untouched at RECEIVED so the next poll pass retries it, rather than
    // giving up on something that might just work next time.
    logger.error({ err, webhookEventId: event.id }, "Transient failure processing webhook event");
  }
}

/** Scores the PR right away so the dashboard can rank it without anyone
 * opening it first, and re-scores it after every new commit (the PR's
 * updatedAt moves past the last assessment). A failure here doesn't
 * un-process the event — the PR page scores on demand as a fallback. */
async function scoreBestEffort(pullRequestId: string, webhookEventId: string) {
  try {
    await getOrCreateLatestRiskAssessment(pullRequestId);
  } catch (err) {
    logger.warn({ err, webhookEventId, pullRequestId }, "Couldn't score pull request after webhook");
  }
}

/** A push that changed README.md or docs/ on the default branch (the
 * webhook route already checked that): re-index the repo's docs so AI
 * review cites what's current. Unchanged files are skipped by content
 * hash, so this costs little beyond fetching the file list. */
async function processDocsPush(event: WebhookEvent): Promise<void> {
  if (!event.githubRepoId || !event.githubInstallationId) {
    await markEvent(event.id, "FAILED");
    return;
  }

  const repository = await findRepositoryByGithubIds(event.githubRepoId, event.githubInstallationId);
  if (!repository) {
    await markEvent(event.id, "IGNORED");
    return;
  }

  try {
    await indexRepositoryDocs(repository.id);
    await markEvent(event.id, "PROCESSED");
  } catch (err) {
    if (err instanceof GithubApiNotFoundError) {
      await markEvent(event.id, "FAILED");
      return;
    }
    logger.error({ err, webhookEventId: event.id }, "Transient failure indexing docs after push");
  }
}

/** Repos were added to or removed from the installation in GitHub's
 * settings. Re-syncs the whole list rather than trusting the payload, and
 * reconnects the repos GitHub says were just added. */
async function processInstallationRepositoriesChange(event: WebhookEvent): Promise<void> {
  const organization = event.githubInstallationId
    ? await prisma.organization.findFirst({ where: { githubInstallationId: event.githubInstallationId } })
    : null;
  if (!organization || !event.githubInstallationId) {
    await markEvent(event.id, "IGNORED");
    return;
  }

  const added = (event.payload as InstallationRepositoriesPayload)?.repositories_added ?? [];
  try {
    const result = await syncInstallationRepositories(organization.id, event.githubInstallationId, {
      reconnectGithubRepoIds: added.flatMap((repo) => (repo.id != null ? [String(repo.id)] : [])),
    });
    await markEvent(event.id, "PROCESSED");
    indexRepositoryDocsInBackground(result.newlyConnectedIds);
  } catch (err) {
    if (err instanceof GithubAppError) {
      logger.error({ err, webhookEventId: event.id }, "Transient failure syncing installation repositories");
      return;
    }
    throw err;
  }
}

/** The App was uninstalled or suspended: Mergewise can't read any of the
 * installation's repos any more, so they're all disconnected. */
async function processInstallationRemoved(event: WebhookEvent): Promise<void> {
  if (!event.githubInstallationId) {
    await markEvent(event.id, "FAILED");
    return;
  }

  await prisma.repository.updateMany({
    where: { githubInstallationId: event.githubInstallationId, disconnectedAt: null },
    data: { disconnectedAt: new Date() },
  });
  await markEvent(event.id, "PROCESSED");
}

export async function processPendingWebhookEvents(limit = 25): Promise<{ processed: number }> {
  const events = await prisma.webhookEvent.findMany({
    where: { status: "RECEIVED" },
    orderBy: { receivedAt: "asc" },
    take: limit,
  });

  for (const event of events) {
    await processWebhookEvent(event);
  }

  return { processed: events.length };
}
