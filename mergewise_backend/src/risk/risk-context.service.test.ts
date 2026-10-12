import { describe, expect, it } from "vitest";
import type { PullRequest } from "@prisma/client";
import { buildRiskInput } from "./risk-context.service.js";

function makePullRequest(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    id: "pr-1",
    repositoryId: "repo-1",
    githubPrId: "1",
    number: 1,
    title: "t",
    body: null,
    state: "open",
    author: "octocat",
    baseBranch: "main",
    headBranch: "feature",
    headSha: "h",
    baseSha: "b",
    url: "https://github.com/o/r/pull/1",
    createdAt: new Date(),
    updatedAt: new Date(),
    closedAt: null,
    mergedAt: null,
    additions: 123,
    deletions: 45,
    changedFilesCount: 7,
    syncedAt: new Date(),
    ...overrides,
  } as PullRequest;
}

describe("buildRiskInput", () => {
  it("uses the PR's own stored diff totals rather than re-deriving them from the files list", () => {
    const pr = makePullRequest({ additions: 123, deletions: 45, changedFilesCount: 7 });
    const input = buildRiskInput(pr, [{ path: "a.ts" }, { path: "b.ts" }]);

    expect(input.additions).toBe(123);
    expect(input.deletions).toBe(45);
    expect(input.changedFilesCount).toBe(7);
  });

  it("correctly maps the fetched files onto RiskInput.changedFiles", () => {
    const pr = makePullRequest();
    const input = buildRiskInput(pr, [{ path: "src/a.ts" }, { path: "src/b.ts" }]);

    expect(input.changedFiles).toEqual(["src/a.ts", "src/b.ts"]);
  });
});
