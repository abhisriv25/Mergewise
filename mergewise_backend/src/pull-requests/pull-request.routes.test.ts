import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = {
  user: { upsert: vi.fn() },
  organization: { create: vi.fn() },
  membership: { create: vi.fn(), findFirst: vi.fn() },
  pullRequest: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    count: vi.fn(),
    groupBy: vi.fn(),
    aggregate: vi.fn(),
  },
  riskAssessment: { findFirst: vi.fn() },
  pRAnalysis: { findFirst: vi.fn() },
};

const assessPullRequestMock = vi.fn();
const resyncAndReassessPullRequestMock = vi.fn();
const getOrCreatePrIntelligenceMock = vi.fn();

vi.mock("../prisma.js", () => ({ prisma: prismaMock }));
vi.mock("./pull-request-resync.service.js", () => ({
  resyncAndReassessPullRequest: resyncAndReassessPullRequestMock,
}));
vi.mock("../rag/pr-intelligence.service.js", () => ({ getOrCreatePrIntelligence: getOrCreatePrIntelligenceMock }));
vi.mock("../risk/risk-assessment.service.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../risk/risk-assessment.service.js")>();
  return {
    ...actual,
    assessPullRequest: assessPullRequestMock,
    // Re-implemented against the mocks so the reuse-vs-rescore decision
    // runs for real while the GitHub round-trip stays mocked.
    getOrCreateLatestRiskAssessment: async (pullRequestId: string) => {
      const pr = await prismaMock.pullRequest.findUnique({ where: { id: pullRequestId } });
      const latest = await prismaMock.riskAssessment.findFirst();
      if (latest && latest.createdAt >= pr.updatedAt) return latest;
      return assessPullRequestMock(pullRequestId);
    },
  };
});

const { app } = await import("../app.js");
const { GithubAppError } = await import("../github/github-app-auth.service.js");
const { LlmNotConfiguredError, LlmTimeoutError } = await import("../rag/llm-client.js");
const { GithubApiError } = await import("../github/pull-request.service.js");

const REPO = { id: "repo-1", owner: "octo", name: "app", fullName: "octo/app", organizationId: "org-1" };
const PR = {
  id: "pr-1",
  repositoryId: "repo-1",
  number: 7,
  title: "Add JWT login",
  body: null,
  state: "open",
  draft: false,
  author: "octocat",
  baseBranch: "main",
  headBranch: "feature",
  baseSha: "aaa",
  headSha: "bbb",
  url: "https://github.com/octo/app/pull/7",
  createdAt: new Date("2026-09-01T00:00:00Z"),
  updatedAt: new Date("2026-09-02T00:00:00Z"),
  closedAt: null,
  mergedAt: null,
  additions: 40,
  deletions: 5,
  changedFilesCount: 4,
  latestRiskScore: 60,
  latestRiskLevel: "HIGH",
  repository: REPO,
};

function assessment(overrides: Record<string, unknown> = {}) {
  return {
    id: "risk-1",
    pullRequestId: "pr-1",
    score: 60,
    level: "HIGH",
    rulesTriggered: [],
    engineVersion: "v1",
    createdAt: new Date("2026-09-03T00:00:00Z"),
    ...overrides,
  };
}

function jsonResponse(body: unknown) {
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) }) as unknown as Promise<Response>;
}

async function loginAgent() {
  prismaMock.user.upsert.mockResolvedValueOnce({
    id: "user-1",
    githubLogin: "octocat",
    displayName: null,
    avatarUrl: null,
    memberships: [{ id: "membership-1", organizationId: "org-1", role: "ADMIN" }],
  });

  const agent = request.agent(app);
  const loginRes = await agent.get("/auth/github/login");
  const state = new URL(loginRes.headers.location).searchParams.get("state");

  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      if (url.includes("/login/oauth/access_token")) return jsonResponse({ access_token: "oauth-token" });
      if (url === "https://api.github.com/user") {
        return jsonResponse({ id: 42, login: "octocat", name: null, avatar_url: null });
      }
      throw new Error(`Unexpected fetch during login: ${url}`);
    }),
  );
  await agent.get(`/auth/github/callback?code=abc&state=${state}`);
  vi.unstubAllGlobals();

  return agent;
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.membership.findFirst.mockResolvedValue({ organizationId: "org-1" });
  prismaMock.pullRequest.findFirst.mockResolvedValue(PR);
  prismaMock.pullRequest.findUnique.mockResolvedValue(PR);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const ORG_SCOPE = { repository: { organizationId: "org-1", disconnectedAt: null } };

describe("GET /pull-requests", () => {
  beforeEach(() => {
    prismaMock.pullRequest.findMany.mockResolvedValue([]);
    prismaMock.pullRequest.count.mockResolvedValue(0);
  });

  it("requires auth", async () => {
    const res = await request(app).get("/pull-requests");
    expect(res.status).toBe(401);
  });

  it("lists one page of the caller's organization's PRs, with status and latest risk", async () => {
    prismaMock.pullRequest.findMany.mockResolvedValueOnce([
      PR,
      { ...PR, id: "pr-2", number: 8, draft: true, latestRiskScore: null, latestRiskLevel: null },
    ]);
    prismaMock.pullRequest.count
      .mockResolvedValueOnce(3) // open
      .mockResolvedValueOnce(1) // draft
      .mockResolvedValueOnce(4) // merged
      .mockResolvedValueOnce(2); // closed
    const agent = await loginAgent();

    const res = await agent.get("/pull-requests?repositoryId=repo-1");

    expect(res.status).toBe(200);
    expect(prismaMock.pullRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { AND: [ORG_SCOPE, { repositoryId: "repo-1" }] }, skip: 0, take: 25 }),
    );
    expect(res.body).toMatchObject({
      page: 1,
      pageSize: 25,
      total: 10,
      statusCounts: { open: 3, draft: 1, merged: 4, closed: 2, all: 10 },
    });
    expect(res.body.pullRequests[0]).toMatchObject({
      id: "pr-1",
      status: "open",
      repository: { fullName: "octo/app" },
      latestRisk: { score: 60, level: "HIGH" },
    });
    expect(res.body.pullRequests[1]).toMatchObject({ status: "draft", latestRisk: null });
  });

  it("filters by status and risk, searches, sorts by risk and pages in SQL", async () => {
    prismaMock.pullRequest.count.mockResolvedValue(7);
    const agent = await loginAgent();

    const res = await agent.get("/pull-requests?status=merged&risk=attention&q=%2342&sort=risk&page=3&pageSize=10");

    expect(res.body).toMatchObject({ page: 3, pageSize: 10, total: 7 });
    const query = prismaMock.pullRequest.findMany.mock.calls[0][0];
    expect(query.skip).toBe(20);
    expect(query.take).toBe(10);
    expect(query.orderBy[0]).toEqual({ latestRiskScore: { sort: "desc", nulls: "last" } });
    expect(query.where.AND).toEqual([
      ORG_SCOPE,
      { latestRiskLevel: { in: ["HIGH", "CRITICAL"] } },
      { OR: expect.arrayContaining([{ number: 42 }, { title: { contains: "#42", mode: "insensitive" } }]) },
      { mergedAt: { not: null } },
    ]);
  });

  it("rejects an out-of-range page size", async () => {
    const agent = await loginAgent();

    expect((await agent.get("/pull-requests?pageSize=1000")).status).toBe(400);
  });

  it("returns an empty page when the user has no organization", async () => {
    const agent = await loginAgent();
    prismaMock.membership.findFirst.mockResolvedValueOnce(null);

    const res = await agent.get("/pull-requests");

    expect(res.body).toMatchObject({ pullRequests: [], total: 0 });
    expect(prismaMock.pullRequest.findMany).not.toHaveBeenCalled();
  });
});

describe("GET /pull-requests/summary", () => {
  it("rolls up open, ready-for-review PRs per repository in SQL", async () => {
    prismaMock.pullRequest.count.mockResolvedValueOnce(2); // drafts
    prismaMock.pullRequest.groupBy
      .mockResolvedValueOnce([
        { repositoryId: "repo-1", _count: { _all: 9 } },
        { repositoryId: "repo-2", _count: { _all: 1 } },
      ])
      .mockResolvedValueOnce([
        { repositoryId: "repo-1", latestRiskLevel: "CRITICAL", _count: { _all: 1 }, _max: { latestRiskScore: 80 } },
        { repositoryId: "repo-1", latestRiskLevel: "LOW", _count: { _all: 3 }, _max: { latestRiskScore: 10 } },
        { repositoryId: "repo-1", latestRiskLevel: null, _count: { _all: 1 }, _max: { latestRiskScore: null } },
      ]);
    prismaMock.pullRequest.aggregate.mockResolvedValueOnce({ _avg: { latestRiskScore: 27.5 } });
    const agent = await loginAgent();

    const res = await agent.get("/pull-requests/summary");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      tracked: 10,
      open: 5,
      draft: 2,
      needsAttention: 1,
      averageOpenScore: 28,
      openRiskCounts: { LOW: 3, MEDIUM: 0, HIGH: 0, CRITICAL: 1 },
      repositories: [
        { repositoryId: "repo-1", tracked: 9, open: 5, needsAttention: 1, worst: { score: 80, level: "CRITICAL" } },
        { repositoryId: "repo-2", tracked: 1, open: 0, needsAttention: 0, worst: null },
      ],
    });
  });
});

describe("POST /pull-requests/:id/risk/reassess", () => {
  it("refetches and re-scores the PR", async () => {
    resyncAndReassessPullRequestMock.mockResolvedValueOnce(assessment({ id: "risk-9", score: 30, level: "MEDIUM" }));
    const agent = await loginAgent();

    const res = await agent.post("/pull-requests/pr-1/risk/reassess");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: "risk-9", score: 30, level: "MEDIUM" });
    expect(resyncAndReassessPullRequestMock).toHaveBeenCalledWith("pr-1");
  });

  it("404s for a PR outside the caller's organization", async () => {
    prismaMock.pullRequest.findFirst.mockResolvedValueOnce(null);
    const agent = await loginAgent();

    expect((await agent.post("/pull-requests/other/risk/reassess")).status).toBe(404);
    expect(resyncAndReassessPullRequestMock).not.toHaveBeenCalled();
  });

  it("returns 502 when GitHub can't be reached", async () => {
    resyncAndReassessPullRequestMock.mockRejectedValueOnce(new GithubApiError("status 502"));
    const agent = await loginAgent();

    expect((await agent.post("/pull-requests/pr-1/risk/reassess")).status).toBe(502);
  });
});

describe("GET /pull-requests/:id", () => {
  it("returns the PR detail", async () => {
    const agent = await loginAgent();

    const res = await agent.get("/pull-requests/pr-1");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: "pr-1", number: 7, headSha: "bbb", repository: { id: "repo-1" } });
    expect(prismaMock.pullRequest.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "pr-1", repository: { organizationId: "org-1", disconnectedAt: null } },
      }),
    );
  });

  it("404s for a PR outside the caller's organization", async () => {
    const agent = await loginAgent();
    prismaMock.pullRequest.findFirst.mockResolvedValueOnce(null);

    const res = await agent.get("/pull-requests/other-org-pr");

    expect(res.status).toBe(404);
  });
});

describe("GET /pull-requests/:id/risk", () => {
  it("reuses a current assessment without calling GitHub", async () => {
    prismaMock.riskAssessment.findFirst.mockResolvedValueOnce(assessment());
    const agent = await loginAgent();

    const res = await agent.get("/pull-requests/pr-1/risk");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: "risk-1", score: 60, level: "HIGH" });
    expect(assessPullRequestMock).not.toHaveBeenCalled();
  });

  it("re-scores when the PR changed after the last assessment", async () => {
    prismaMock.riskAssessment.findFirst.mockResolvedValueOnce(
      assessment({ createdAt: new Date("2026-09-01T12:00:00Z") }),
    );
    assessPullRequestMock.mockResolvedValueOnce(assessment({ id: "risk-2", score: 75 }));
    const agent = await loginAgent();

    const res = await agent.get("/pull-requests/pr-1/risk");

    expect(assessPullRequestMock).toHaveBeenCalledWith("pr-1");
    expect(res.body).toMatchObject({ id: "risk-2", score: 75 });
  });

  it("returns 502 when GitHub can't be reached", async () => {
    prismaMock.riskAssessment.findFirst.mockResolvedValueOnce(null);
    assessPullRequestMock.mockRejectedValueOnce(new GithubAppError("status 500"));
    const agent = await loginAgent();

    const res = await agent.get("/pull-requests/pr-1/risk");

    expect(res.status).toBe(502);
  });
});

describe("GET /pull-requests/:id/intelligence", () => {
  it("passes a LOW-risk skip through", async () => {
    getOrCreatePrIntelligenceMock.mockResolvedValueOnce({ status: "skipped_low_risk", score: 5, level: "LOW" });
    const agent = await loginAgent();

    const res = await agent.get("/pull-requests/pr-1/intelligence");

    expect(res.body).toEqual({ status: "skipped_low_risk", score: 5, level: "LOW" });
  });

  it("returns the analysis", async () => {
    getOrCreatePrIntelligenceMock.mockResolvedValueOnce({
      status: "analyzed",
      analysis: { id: "analysis-1", summary: "Touches auth", createdAt: new Date("2026-09-03T01:00:00Z") },
    });
    const agent = await loginAgent();

    const res = await agent.get("/pull-requests/pr-1/intelligence");

    expect(res.body).toMatchObject({ status: "analyzed", intelligence: { id: "analysis-1", summary: "Touches auth" } });
    expect(getOrCreatePrIntelligenceMock).toHaveBeenCalledWith("pr-1");
  });

  it("returns 503 when the LLM isn't configured", async () => {
    getOrCreatePrIntelligenceMock.mockRejectedValueOnce(new LlmNotConfiguredError("no key"));
    const agent = await loginAgent();

    expect((await agent.get("/pull-requests/pr-1/intelligence")).status).toBe(503);
  });

  it("returns 504 when the model times out", async () => {
    getOrCreatePrIntelligenceMock.mockRejectedValueOnce(new LlmTimeoutError("timed out"));
    const agent = await loginAgent();

    expect((await agent.get("/pull-requests/pr-1/intelligence")).status).toBe(504);
  });

  it("returns 502 on a generation failure", async () => {
    getOrCreatePrIntelligenceMock.mockRejectedValueOnce(new Error("boom"));
    const agent = await loginAgent();

    expect((await agent.get("/pull-requests/pr-1/intelligence")).status).toBe(502);
  });
});
