import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = { pullRequest: { findUnique: vi.fn() } };
vi.mock("../prisma.js", () => ({ prisma: prismaMock }));

const fetchInstallationAccessTokenMock = vi.fn();
vi.mock("../github/github-app-auth.service.js", () => ({
  fetchInstallationAccessToken: fetchInstallationAccessTokenMock,
}));

const fetchPullRequestMock = vi.fn();
vi.mock("../github/pull-request.service.js", () => ({ fetchPullRequest: fetchPullRequestMock }));

const upsertPullRequestMock = vi.fn();
vi.mock("./pull-request.repository.js", () => ({ upsertPullRequest: upsertPullRequestMock }));

class PullRequestNotFoundError extends Error {}
const assessPullRequestMock = vi.fn();
vi.mock("../risk/risk-assessment.service.js", () => ({
  assessPullRequest: assessPullRequestMock,
  PullRequestNotFoundError,
}));

const { resyncAndReassessPullRequest } = await import("./pull-request-resync.service.js");

const REPO = { id: "repo-1", owner: "octo", name: "app", githubInstallationId: "777" };
const FRESH = { githubPrId: "999", number: 7, draft: false };

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.pullRequest.findUnique.mockResolvedValue({ id: "pr-1", number: 7, repository: REPO });
  fetchInstallationAccessTokenMock.mockResolvedValue("installation-token");
  fetchPullRequestMock.mockResolvedValue(FRESH);
  upsertPullRequestMock.mockResolvedValue({ id: "pr-1" });
  assessPullRequestMock.mockResolvedValue({ id: "risk-2" });
});

describe("resyncAndReassessPullRequest", () => {
  it("refetches the PR with the installation's token, saves it, then always scores it again", async () => {
    const result = await resyncAndReassessPullRequest("pr-1");

    expect(fetchInstallationAccessTokenMock).toHaveBeenCalledWith("777");
    expect(fetchPullRequestMock).toHaveBeenCalledWith("installation-token", "octo", "app", 7);
    expect(upsertPullRequestMock).toHaveBeenCalledWith("repo-1", FRESH);
    expect(assessPullRequestMock).toHaveBeenCalledWith("pr-1");
    expect(result).toEqual({ id: "risk-2" });
  });

  it("doesn't score when GitHub can't return the PR", async () => {
    fetchPullRequestMock.mockRejectedValueOnce(new Error("GitHub 502"));

    await expect(resyncAndReassessPullRequest("pr-1")).rejects.toThrow("GitHub 502");
    expect(assessPullRequestMock).not.toHaveBeenCalled();
  });

  it("throws PullRequestNotFoundError for an unknown PR", async () => {
    prismaMock.pullRequest.findUnique.mockResolvedValueOnce(null);

    await expect(resyncAndReassessPullRequest("missing")).rejects.toBeInstanceOf(PullRequestNotFoundError);
  });
});
