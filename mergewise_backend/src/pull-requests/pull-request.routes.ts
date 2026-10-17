import { Router, type Request, type Response } from "express";
import type { Prisma, PullRequest, Repository, RiskAssessment, RiskLevel } from "@prisma/client";
import { z } from "zod";
import { resolvePrimaryOrganizationId } from "../auth/auth.service.js";
import { requireAuth } from "../auth/auth.routes.js";
import { GithubAppError } from "../github/github-app-auth.service.js";
import { GithubApiError, GithubApiNotFoundError } from "../github/pull-request.service.js";
import { logger } from "../logger.js";
import { reassessRateLimiter } from "../middleware/rate-limit.js";
import { prisma } from "../prisma.js";
import { LlmNotConfiguredError, LlmTimeoutError } from "../rag/llm-client.js";
import { getOrCreatePrIntelligence } from "../rag/pr-intelligence.service.js";
import { getOrCreateLatestRiskAssessment } from "../risk/risk-assessment.service.js";
import { resyncAndReassessPullRequest } from "./pull-request-resync.service.js";
import { PULL_REQUEST_STATUSES, pullRequestStatus, pullRequestStatusWhere } from "./pull-request-status.js";

export const pullRequestRouter = Router();

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const RISK_LEVELS: RiskLevel[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const ATTENTION_LEVELS: RiskLevel[] = ["HIGH", "CRITICAL"];
const MAX_INT = 2_147_483_647;

const listQuerySchema = z.object({
  repositoryId: z.string().min(1).optional(),
  status: z.enum([...PULL_REQUEST_STATUSES, "all"]).default("all"),
  // Comma-separated levels, or "attention" for HIGH + CRITICAL.
  risk: z.string().optional(),
  q: z.string().trim().max(200).optional(),
  sort: z.enum(["risk", "updated"]).default("updated"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

function repositorySummary(repo: Repository) {
  return { id: repo.id, owner: repo.owner, name: repo.name, fullName: repo.fullName };
}

function latestRiskSummary(pr: PullRequest) {
  return pr.latestRiskScore !== null && pr.latestRiskLevel !== null
    ? { score: pr.latestRiskScore, level: pr.latestRiskLevel }
    : null;
}

function pullRequestListItem(pr: PullRequest & { repository: Repository }) {
  return {
    id: pr.id,
    number: pr.number,
    title: pr.title,
    author: pr.author,
    state: pr.state,
    draft: pr.draft,
    status: pullRequestStatus(pr),
    url: pr.url,
    updatedAt: pr.updatedAt.toISOString(),
    closedAt: pr.closedAt?.toISOString() ?? null,
    mergedAt: pr.mergedAt?.toISOString() ?? null,
    additions: pr.additions,
    deletions: pr.deletions,
    changedFilesCount: pr.changedFilesCount,
    repository: repositorySummary(pr.repository),
    latestRisk: latestRiskSummary(pr),
  };
}

function pullRequestDetail(pr: PullRequest & { repository: Repository }) {
  return {
    id: pr.id,
    number: pr.number,
    title: pr.title,
    body: pr.body,
    state: pr.state,
    draft: pr.draft,
    status: pullRequestStatus(pr),
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

/** PRs visible to an organization: its own repositories, minus any it has
 * disconnected. */
function organizationPullRequests(organizationId: string): Prisma.PullRequestWhereInput {
  return { repository: { organizationId, disconnectedAt: null } };
}

function parseRiskFilter(risk: string | undefined): RiskLevel[] {
  if (!risk) return [];
  if (risk === "attention") return ATTENTION_LEVELS;
  return risk.split(",").filter((level): level is RiskLevel => (RISK_LEVELS as string[]).includes(level));
}

function searchWhere(q: string): Prisma.PullRequestWhereInput {
  const or: Prisma.PullRequestWhereInput[] = [
    { title: { contains: q, mode: "insensitive" } },
    { author: { contains: q, mode: "insensitive" } },
    { repository: { fullName: { contains: q, mode: "insensitive" } } },
  ];
  const number = /^#?(\d+)$/.exec(q);
  if (number && Number(number[1]) <= MAX_INT) or.push({ number: Number(number[1]) });
  return { OR: or };
}

/** Loads a PR only if it belongs to one of the caller's organization's
 * connected repositories — a PR id from another org is indistinguishable
 * from a missing one (404), never a 403 that would confirm it exists. */
async function findOwnedPullRequest(req: Request, res: Response) {
  const organizationId = await resolvePrimaryOrganizationId(req.session.userId as string);
  const pullRequest = organizationId
    ? await prisma.pullRequest.findFirst({
        where: { id: req.params.id, ...organizationPullRequests(organizationId) },
        include: { repository: true },
      })
    : null;

  if (!pullRequest) {
    res.status(404).json({ error: { message: "Pull request not found" } });
    return null;
  }
  return pullRequest;
}

function isGithubFailure(err: unknown) {
  return err instanceof GithubAppError || err instanceof GithubApiError || err instanceof GithubApiNotFoundError;
}

/** Scores the PR (or reuses a current score), translating a GitHub
 * failure into a 502 rather than a generic 500. */
async function loadRiskAssessment(pullRequestId: string, res: Response) {
  try {
    return await getOrCreateLatestRiskAssessment(pullRequestId);
  } catch (err) {
    if (isGithubFailure(err)) {
      res.status(502).json({ error: { message: "Couldn't fetch this pull request from GitHub" } });
      return null;
    }
    throw err;
  }
}

const EMPTY_STATUS_COUNTS = { open: 0, draft: 0, merged: 0, closed: 0, all: 0 };

/** One page of PRs, filtered and sorted in SQL. `statusCounts` counts every
 * status under the other filters, so the UI's status tabs stay accurate
 * whichever tab (and page) is showing. */
pullRequestRouter.get("/pull-requests", requireAuth, async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: { message: "Invalid pull request filters" } });
    return;
  }
  const { repositoryId, status, risk, q, sort, page, pageSize } = parsed.data;

  const organizationId = await resolvePrimaryOrganizationId(req.session.userId as string);
  if (!organizationId) {
    res.json({ pullRequests: [], page, pageSize, total: 0, statusCounts: EMPTY_STATUS_COUNTS });
    return;
  }

  const filters: Prisma.PullRequestWhereInput[] = [organizationPullRequests(organizationId)];
  if (repositoryId) filters.push({ repositoryId });
  const levels = parseRiskFilter(risk);
  if (levels.length > 0) filters.push({ latestRiskLevel: { in: levels } });
  if (q) filters.push(searchWhere(q));

  const withStatus = (s: (typeof PULL_REQUEST_STATUSES)[number]) => ({ AND: [...filters, pullRequestStatusWhere(s)] });
  const where: Prisma.PullRequestWhereInput = status === "all" ? { AND: filters } : withStatus(status);

  const orderBy: Prisma.PullRequestOrderByWithRelationInput[] =
    sort === "risk"
      ? [{ latestRiskScore: { sort: "desc", nulls: "last" } }, { updatedAt: "desc" }, { id: "desc" }]
      : [{ updatedAt: "desc" }, { id: "desc" }];

  const [pullRequests, open, draft, merged, closed] = await Promise.all([
    prisma.pullRequest.findMany({
      where,
      include: { repository: true },
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    ...PULL_REQUEST_STATUSES.map((s) => prisma.pullRequest.count({ where: withStatus(s) })),
  ]);
  const statusCounts = { open, draft, merged, closed, all: open + draft + merged + closed };

  res.json({
    pullRequests: pullRequests.map(pullRequestListItem),
    page,
    pageSize,
    total: status === "all" ? statusCounts.all : statusCounts[status],
    statusCounts,
  });
});

interface RepositoryRollup {
  repositoryId: string;
  tracked: number;
  open: number;
  needsAttention: number;
  worst: { score: number; level: RiskLevel } | null;
}

/** The numbers the dashboard and repository cards show, aggregated in SQL
 * so they stay right however many PRs an organization has. "Open" means
 * open and ready for review; drafts are counted separately. */
pullRequestRouter.get("/pull-requests/summary", requireAuth, async (req, res) => {
  const organizationId = await resolvePrimaryOrganizationId(req.session.userId as string);
  const openRiskCounts: Record<RiskLevel, number> = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
  if (!organizationId) {
    res.json({ tracked: 0, open: 0, draft: 0, needsAttention: 0, averageOpenScore: null, openRiskCounts, repositories: [] });
    return;
  }

  const base = organizationPullRequests(organizationId);
  const openWhere = { AND: [base, pullRequestStatusWhere("open")] };

  const [draft, trackedByRepo, openByRepoAndLevel, openAverage] = await Promise.all([
    prisma.pullRequest.count({ where: { AND: [base, pullRequestStatusWhere("draft")] } }),
    prisma.pullRequest.groupBy({ by: ["repositoryId"], where: base, _count: { _all: true } }),
    prisma.pullRequest.groupBy({
      by: ["repositoryId", "latestRiskLevel"],
      where: openWhere,
      _count: { _all: true },
      _max: { latestRiskScore: true },
    }),
    prisma.pullRequest.aggregate({ where: openWhere, _avg: { latestRiskScore: true } }),
  ]);

  const rollups = new Map<string, RepositoryRollup>();
  const rollup = (repositoryId: string) => {
    let entry = rollups.get(repositoryId);
    if (!entry) {
      entry = { repositoryId, tracked: 0, open: 0, needsAttention: 0, worst: null };
      rollups.set(repositoryId, entry);
    }
    return entry;
  };

  for (const group of trackedByRepo) rollup(group.repositoryId).tracked = group._count._all;

  let open = 0;
  for (const group of openByRepoAndLevel) {
    const entry = rollup(group.repositoryId);
    const count = group._count._all;
    entry.open += count;
    open += count;

    const level = group.latestRiskLevel;
    const score = group._max.latestRiskScore;
    if (!level || score === null) continue;
    openRiskCounts[level] += count;
    if (ATTENTION_LEVELS.includes(level)) entry.needsAttention += count;
    // The level is derived from the score, so the highest score is also
    // the worst level.
    if (!entry.worst || score > entry.worst.score) entry.worst = { score, level };
  }

  const average = openAverage._avg.latestRiskScore;
  res.json({
    tracked: trackedByRepo.reduce((sum, group) => sum + group._count._all, 0),
    open,
    draft,
    needsAttention: openRiskCounts.HIGH + openRiskCounts.CRITICAL,
    averageOpenScore: average === null ? null : Math.round(average),
    openRiskCounts,
    repositories: [...rollups.values()],
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

/** The "Re-assess" button: refetches the PR from GitHub and scores it
 * again, even if the stored score still looks current. */
pullRequestRouter.post("/pull-requests/:id/risk/reassess", reassessRateLimiter, requireAuth, async (req, res) => {
  const pullRequest = await findOwnedPullRequest(req, res);
  if (!pullRequest) return;

  try {
    const assessment = await resyncAndReassessPullRequest(pullRequest.id);
    res.json(riskAssessmentResponse(assessment));
  } catch (err) {
    if (isGithubFailure(err)) {
      logger.warn({ err, pullRequestId: pullRequest.id }, "Re-assessment couldn't reach GitHub");
      res.status(502).json({ error: { message: "Couldn't fetch this pull request from GitHub" } });
      return;
    }
    throw err;
  }
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
    if (isGithubFailure(err)) {
      res.status(502).json({ error: { message: "Couldn't fetch this pull request from GitHub" } });
      return;
    }
    logger.error({ err, pullRequestId: pullRequest.id }, "PR intelligence generation failed");
    res.status(502).json({ error: { message: "AI analysis failed" } });
  }
});
