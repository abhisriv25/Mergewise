import type { WebhookEvent } from "@prisma/client";
import { fetchInstallationAccessToken } from "../github/github-app-auth.service.js";
import { GithubApiNotFoundError, fetchPullRequest } from "../github/pull-request.service.js";
import { findRepositoryByGithubIds } from "../github/repository.service.js";
import { logger } from "../logger.js";
import { prisma } from "../prisma.js";
import { getOrCreateLatestRiskAssessment } from "../risk/risk-assessment.service.js";
import { upsertPullRequest } from "./pull-request.repository.js";

interface PullRequestWebhookPayload {
  number?: number;
  pull_request?: { number?: number };
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

/** Turns one RECEIVED WebhookEvent into current PullRequest state. Never
 * trusts the webhook payload's own PR fields — always fetches the PR's
 * canonical state from GitHub, using the GitHub App installation's
 * credentials, not any user's OAuth token, since the installation (not
 * whoever happened to be logged in) is what was actually granted access. */
export async function processWebhookEvent(event: WebhookEvent): Promise<void> {
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
 * opening it first. A failure here doesn't un-process the event — the PR
 * page scores on demand as a fallback. */
async function scoreBestEffort(pullRequestId: string, webhookEventId: string) {
  try {
    await getOrCreateLatestRiskAssessment(pullRequestId);
  } catch (err) {
    logger.warn({ err, webhookEventId, pullRequestId }, "Couldn't score pull request after webhook");
  }
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
