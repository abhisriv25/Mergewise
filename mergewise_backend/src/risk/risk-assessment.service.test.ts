import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = {
  pullRequest: { findUnique: vi.fn() },
  repository: { findUnique: vi.fn() },
  riskAssessment: { create: vi.fn() },
};
vi.mock("../prisma.js", () => ({ prisma: prismaMock }));

const fetchInstallationAccessTokenMock = vi.fn();
vi.mock("../github/github-app-auth.service.js", () => ({
  fetchInstallationAccessToken: fetchInstallationAccessTokenMock,
}));

const fetchPullRequestFilesMock = vi.fn();
vi.mock("../github/pull-request.service.js", () => ({
  fetchPullRequestFiles: fetchPullRequestFilesMock,
}));

const {
  assessPullRequest,
  PullRequestNotFoundError,
  RepositoryNotFoundError,
} = await import("./risk-assessment.service.js");

const PULL_REQUEST = {
  id: "pr-1",
  repositoryId: "repo-1",
  number: 7,
  additions: 600,
  deletions: 0,
  changedFilesCount: 40,
};

const REPOSITORY = {
  id: "repo-1",
  owner: "octocat",
  name: "hello-world",
  githubInstallationId: "777",
};

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.pullRequest.findUnique.mockResolvedValue(PULL_REQUEST);
  prismaMock.repository.findUnique.mockResolvedValue(REPOSITORY);
  fetchInstallationAccessTokenMock.mockResolvedValue("installation-token");
  fetchPullRequestFilesMock.mockResolvedValue([{ path: "src/auth/login.ts" }, { path: "package.json" }]);
  prismaMock.riskAssessment.create.mockImplementation(({ data }: { data: unknown }) => Promise.resolve(data));
});

describe("assessPullRequest", () => {
  it("throws PullRequestNotFoundError before any GitHub call or DB write when the PR doesn't exist", async () => {
    prismaMock.pullRequest.findUnique.mockResolvedValueOnce(null);

    await expect(assessPullRequest("missing")).rejects.toBeInstanceOf(PullRequestNotFoundError);
    expect(fetchInstallationAccessTokenMock).not.toHaveBeenCalled();
    expect(prismaMock.riskAssessment.create).not.toHaveBeenCalled();
  });

  it("throws RepositoryNotFoundError before any GitHub call or DB write when the repository is gone", async () => {
    prismaMock.repository.findUnique.mockResolvedValueOnce(null);

    await expect(assessPullRequest("pr-1")).rejects.toBeInstanceOf(RepositoryNotFoundError);
    expect(fetchInstallationAccessTokenMock).not.toHaveBeenCalled();
    expect(prismaMock.riskAssessment.create).not.toHaveBeenCalled();
  });

  it("calls GitHub with the repository's installation id, not any user's credentials", async () => {
    await assessPullRequest("pr-1");

    expect(fetchInstallationAccessTokenMock).toHaveBeenCalledWith("777");
    expect(fetchPullRequestFilesMock).toHaveBeenCalledWith("installation-token", "octocat", "hello-world", 7);
  });

  it("computes a real score/level via the actual engine and persists it stamped with the current engineVersion", async () => {
    const result = await assessPullRequest("pr-1");

    expect(result.score).toBeGreaterThan(0);
    expect(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).toContain(result.level);
    expect(result.engineVersion).toBe("v1");
    expect(result.pullRequestId).toBe("pr-1");
  });

  it("returns the persisted record", async () => {
    const result = await assessPullRequest("pr-1");

    expect(prismaMock.riskAssessment.create).toHaveBeenCalledTimes(1);
    const persistedData = prismaMock.riskAssessment.create.mock.calls[0][0].data;
    expect(result).toEqual(persistedData);
  });
});
