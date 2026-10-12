import { Router, type Request, type Response } from "express";
import type { Prisma, PullRequest, Repository, RiskAssessment } from "@prisma/client";
import { resolvePrimaryOrganizationId } from "../auth/auth.service.js";
import { requireAuth } from "../auth/auth.routes.js";
import { GithubAppError } from "../github/github-app-auth.service.js";
import { logger } from "../logger.js";
import { prisma } from "../prisma.js";
import { LlmNotConfiguredError, LlmTimeoutError } from "../rag/llm-client.js";
import { getOrCreatePrIntelligence } from "../rag/pr-intelligence.service.js";
import { getOrCreateLatestRiskAssessment } from "../risk/risk-assessment.service.js";

export const pullRequestRouter = Router();

const LIST_LIMIT = 100;

function repositorySummary(repo: Repository) {
  return { id: repo.id, owner: repo.owner, name: repo.name, fullName: repo.fullName };
}

function pullRequestDetail(pr: PullRequest & { repository: Repository }) {
  return {
    id: pr.id,
    number: pr.number,
    title: pr.title,
    body: pr.body,
    state: pr.state,
    author: pr.author,
    baseBranch: pr.baseBranch,
    headBranch: pr.headBranch,
    baseSha: pr.baseSha,
    headSha: pr.headSha,
    url: pr.url,
    createdAt: pr.createdAt.toISOString(),
    updatedAt: pr.updatedAt.toISOString(),
    closedAt: pr.closedAt?.toISOString() ?? null,
    mergedAt: pr.mergedAt?.toISOString() ?? null,
    additions: pr.additions,
    deletions: pr.deletions,
    changedFilesCount: pr.changedFilesCount,
    repository: repositorySummary(pr.repository),
  };
}

function riskAssessmentResponse(assessment: RiskAssessment) {
  return {
    id: assessment.id,
    pullRequestId: assessment.pullRequestId,
    score: assessment.score,
    level: assessment.level,
    rulesTriggered: assessment.rulesTriggered,
    engineVersion: assessment.engineVersion,
    createdAt: assessment.createdAt.toISOString(),
  };
}

/** Loads a PR only if it belongs to one of the caller's organization's
 * repositories — a PR id from another org is indistinguishable from a
 * missing one (404), never a 403 that would confirm it exists. */
async function findOwnedPullRequest(req: Request, res: Response) {
  const organizationId = await resolvePrimaryOrganizationId(req.session.userId as string);
  const pullRequest = organizationId
    ? await prisma.pullRequest.findFirst({
        where: { id: req.params.id, repository: { organizationId } },
        include: { repository: true },
      })
    : null;

  if (!pullRequest) {
    res.status(404).json({ error: { message: "Pull request not found" } });
    return null;
  }
  return pullRequest;
}

/** Scores the PR (or reuses a current score), translating a GitHub App
 * failure into a 502 rather than a generic 500. */
async function loadRiskAssessment(pullRequestId: string, res: Response) {
  try {
    return await getOrCreateLatestRiskAssessment(pullRequestId);
  } catch (err) {
    if (err instanceof GithubAppError) {
      res.status(502).json({ error: { message: "Couldn't fetch this pull request from GitHub" } });
      return null;
    }
    throw err;
  }
}

pullRequestRouter.get("/pull-requests", requireAuth, async (req, res) => {
  const organizationId = await resolvePrimaryOrganizationId(req.session.userId as string);
  if (!organizationId) {
    res.json({ pullRequests: [] });
    return;
  }

  const where: Prisma.PullRequestWhereInput = { repository: { organizationId } };
  if (typeof req.query.repositoryId === "string") {
    where.repositoryId = req.query.repositoryId;
  }

  const pullRequests = await prisma.pullRequest.findMany({
    where,
    include: {
      repository: true,
      riskAssessments: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { updatedAt: "desc" },
    take: LIST_LIMIT,
  });

  res.json({
    pullRequests: pullRequests.map((pr) => {
      const latest = pr.riskAssessments[0];
      return {
        id: pr.id,
        number: pr.number,
        title: pr.title,
        author: pr.author,
        state: pr.state,
        url: pr.url,
        updatedAt: pr.updatedAt.toISOString(),
        closedAt: pr.closedAt?.toISOString() ?? null,
        mergedAt: pr.mergedAt?.toISOString() ?? null,
        additions: pr.additions,
        deletions: pr.deletions,
        changedFilesCount: pr.changedFilesCount,
        repository: repositorySummary(pr.repository),
        latestRisk: latest
          ? { score: latest.score, level: latest.level, createdAt: latest.createdAt.toISOString() }
          : null,
      };
    }),
  });
});

pullRequestRouter.get("/pull-requests/:id", requireAuth, async (req, res) => {
  const pullRequest = await findOwnedPullRequest(req, res);
  if (!pullRequest) return;
  res.json(pullRequestDetail(pullRequest));
});

pullRequestRouter.get("/pull-requests/:id/risk", requireAuth, async (req, res) => {
  const pullRequest = await findOwnedPullRequest(req, res);
  if (!pullRequest) return;

  const assessment = await loadRiskAssessment(pullRequest.id, res);
  if (!assessment) return;
  res.json(riskAssessmentResponse(assessment));
});

/** LOW-risk PRs are skipped by design (no LLM cost). Otherwise returns the
 * stored AI analysis for the current assessment, generating it on first view.
 * 503 when no LLM is configured; 504 when the model times out; 502 on any
 * other upstream/model failure. */
pullRequestRouter.get("/pull-requests/:id/intelligence", requireAuth, async (req, res) => {
  const pullRequest = await findOwnedPullRequest(req, res);
  if (!pullRequest) return;

  try {
    const result = await getOrCreatePrIntelligence(pullRequest.id);
    if (result.status === "skipped_low_risk") {
      res.json(result);
      return;
    }
    res.json({
      status: "analyzed",
      intelligence: { ...result.analysis, createdAt: result.analysis.createdAt.toISOString() },
    });
  } catch (err) {
    if (err instanceof LlmNotConfiguredError) {
      res.status(503).json({ error: { message: "AI analysis isn't configured" } });
      return;
    }
    if (err instanceof LlmTimeoutError) {
      logger.warn({ err, pullRequestId: pullRequest.id }, "PR intelligence generation timed out");
      res.status(504).json({ error: { message: "AI analysis timed out" } });
      return;
    }
    if (err instanceof GithubAppError) {
      res.status(502).json({ error: { message: "Couldn't fetch this pull request from GitHub" } });
      return;
    }
    logger.error({ err, pullRequestId: pullRequest.id }, "PR intelligence generation failed");
    res.status(502).json({ error: { message: "AI analysis failed" } });
  }
});
