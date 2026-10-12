import { fetchInstallationAccessToken } from "../github/github-app-auth.service.js";
import { fetchPullRequestFiles } from "../github/pull-request.service.js";
import { prisma } from "../prisma.js";
import { createRiskAssessment } from "./risk-assessment.repository.js";
import { buildRiskInput } from "./risk-context.service.js";
import { calculateRiskScore, calculateRiskSignals } from "./risk-engine.js";
import { RISK_ENGINE_VERSION } from "./risk-rules.config.js";

export class PullRequestNotFoundError extends Error {}
export class RepositoryNotFoundError extends Error {}

/** The only entry point this slice adds — not triggered automatically from
 * the webhook processor, and not exposed over HTTP yet (that's a later
 * slice's job). Fetches the PR's changed files from GitHub using the
 * repository's own GitHub App installation credentials — never any user's
 * OAuth token — scores them with the pure, deterministic engine, and
 * persists a new RiskAssessment row. */
export async function assessPullRequest(pullRequestId: string) {
  const pullRequest = await prisma.pullRequest.findUnique({ where: { id: pullRequestId } });
  if (!pullRequest) {
    throw new PullRequestNotFoundError(`Pull request ${pullRequestId} not found`);
  }

  const repository = await prisma.repository.findUnique({ where: { id: pullRequest.repositoryId } });
  if (!repository) {
    throw new RepositoryNotFoundError(`Repository ${pullRequest.repositoryId} not found`);
  }

  const accessToken = await fetchInstallationAccessToken(repository.githubInstallationId);
  const files = await fetchPullRequestFiles(
    accessToken,
    repository.owner,
    repository.name,
    pullRequest.number,
  );

  const input = buildRiskInput(pullRequest, files);
  const signals = calculateRiskSignals(input);
  const { score, level } = calculateRiskScore(signals);

  return createRiskAssessment(pullRequestId, score, level, signals, RISK_ENGINE_VERSION);
}

/** Serves the PR's most recent assessment when it's still current — same
 * engine version and taken after the PR last changed — and only re-scores
 * (a GitHub round-trip) when it isn't. */
export async function getOrCreateLatestRiskAssessment(pullRequestId: string) {
  const pullRequest = await prisma.pullRequest.findUnique({ where: { id: pullRequestId } });
  if (!pullRequest) {
    throw new PullRequestNotFoundError(`Pull request ${pullRequestId} not found`);
  }

  const latest = await prisma.riskAssessment.findFirst({
    where: { pullRequestId, engineVersion: RISK_ENGINE_VERSION },
    orderBy: { createdAt: "desc" },
  });
  if (latest && latest.createdAt >= pullRequest.updatedAt) {
    return latest;
  }

  return assessPullRequest(pullRequestId);
}
