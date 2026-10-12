import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = {
  user: { upsert: vi.fn() },
  organization: { create: vi.fn() },
  membership: { create: vi.fn(), findFirst: vi.fn() },
  pullRequest: { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn() },
  riskAssessment: { findFirst: vi.fn() },
  pRAnalysis: { findFirst: vi.fn() },
};

const assessPullRequestMock = vi.fn();
const getOrCreatePrIntelligenceMock = vi.fn();

vi.mock("../prisma.js", () => ({ prisma: prismaMock }));
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

const REPO = { id: "repo-1", owner: "octo", name: "app", fullName: "octo/app", organizationId: "org-1" };
const PR = {
  id: "pr-1",
  repositoryId: "repo-1",
  number: 7,
  title: "Add JWT login",
  body: null,
  state: "open",
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

describe("GET /pull-requests", () => {
  it("requires auth", async () => {
    const res = await request(app).get("/pull-requests");
    expect(res.status).toBe(401);
  });

  it("lists only the caller's organization's PRs, with the latest risk", async () => {
    prismaMock.pullRequest.findMany.mockResolvedValueOnce([
      { ...PR, riskAssessments: [assessment()] },
      { ...PR, id: "pr-2", number: 8, riskAssessments: [] },
    ]);
    const agent = await loginAgent();

    const res = await agent.get("/pull-requests?repositoryId=repo-1");

    expect(res.status).toBe(200);
    expect(prismaMock.pullRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { repository: { organizationId: "org-1" }, repositoryId: "repo-1" } }),
    );
    expect(res.body.pullRequests).toHaveLength(2);
    expect(res.body.pullRequests[0]).toMatchObject({
      id: "pr-1",
      repository: { fullName: "octo/app" },
      latestRisk: { score: 60, level: "HIGH" },
    });
    expect(res.body.pullRequests[1].latestRisk).toBeNull();
  });

  it("returns an empty list when the user has no organization", async () => {
    const agent = await loginAgent();
    prismaMock.membership.findFirst.mockResolvedValueOnce(null);

    const res = await agent.get("/pull-requests");

    expect(res.body).toEqual({ pullRequests: [] });
    expect(prismaMock.pullRequest.findMany).not.toHaveBeenCalled();
  });
});

describe("GET /pull-requests/:id", () => {
  it("returns the PR detail", async () => {
    const agent = await loginAgent();

    const res = await agent.get("/pull-requests/pr-1");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: "pr-1", number: 7, headSha: "bbb", repository: { id: "repo-1" } });
    expect(prismaMock.pullRequest.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "pr-1", repository: { organizationId: "org-1" } } }),
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
