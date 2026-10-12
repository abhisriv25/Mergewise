import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GithubPullRequest } from "../github/pull-request.service.js";

const prismaMock = {
  pullRequest: { upsert: vi.fn() },
};

vi.mock("../prisma.js", () => ({ prisma: prismaMock }));

const { upsertPullRequest } = await import("./pull-request.repository.js");

const BASE_PR: GithubPullRequest = {
  githubPrId: "999",
  number: 7,
  title: "Add feature",
  body: "desc",
  state: "open",
  author: "octocat",
  baseBranch: "main",
  headBranch: "feature",
  headSha: "head-sha",
  baseSha: "base-sha",
  url: "https://github.com/o/r/pull/7",
  createdAt: new Date("2024-01-01T00:00:00.000Z"),
  updatedAt: new Date("2024-01-02T00:00:00.000Z"),
  closedAt: null,
  mergedAt: null,
  additions: 10,
  deletions: 2,
  changedFilesCount: 3,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("upsertPullRequest", () => {
  it("upserts on (repositoryId, githubPrId), not a plain create", async () => {
    await upsertPullRequest("repo-1", BASE_PR);

    expect(prismaMock.pullRequest.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { repositoryId_githubPrId: { repositoryId: "repo-1", githubPrId: "999" } },
      }),
    );
  });

  it("maps GitHub's PR fields onto the DB row correctly", async () => {
    await upsertPullRequest("repo-1", BASE_PR);

    expect(prismaMock.pullRequest.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          author: "octocat",
          baseBranch: "main",
          headBranch: "feature",
          baseSha: "base-sha",
          headSha: "head-sha",
          url: "https://github.com/o/r/pull/7",
        }),
        create: expect.objectContaining({
          repositoryId: "repo-1",
          githubPrId: "999",
          author: "octocat",
          baseBranch: "main",
          headBranch: "feature",
        }),
      }),
    );
  });

  it("falls back to a placeholder author instead of crashing when GitHub omits the user", async () => {
    await upsertPullRequest("repo-1", { ...BASE_PR, author: null });

    expect(prismaMock.pullRequest.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ author: "ghost" }),
      }),
    );
  });

  it("reflects the latest fetch on repeated processing, not a merge of old and new", async () => {
    await upsertPullRequest("repo-1", { ...BASE_PR, title: "Old title", additions: 1 });
    await upsertPullRequest("repo-1", { ...BASE_PR, title: "New title", additions: 99 });

    const lastCall = prismaMock.pullRequest.upsert.mock.calls.at(-1)?.[0];
    expect(lastCall.update.title).toBe("New title");
    expect(lastCall.update.additions).toBe(99);
  });

  it("sets closedAt/mergedAt from GitHub's timestamps when closed and merged", async () => {
    const closedAt = new Date("2024-02-01T00:00:00.000Z");
    await upsertPullRequest("repo-1", { ...BASE_PR, state: "closed", closedAt, mergedAt: closedAt });

    expect(prismaMock.pullRequest.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ closedAt, mergedAt: closedAt }),
      }),
    );
  });

  it("leaves closedAt/mergedAt null for an open PR", async () => {
    await upsertPullRequest("repo-1", BASE_PR);

    expect(prismaMock.pullRequest.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ closedAt: null, mergedAt: null }),
      }),
    );
  });
});
