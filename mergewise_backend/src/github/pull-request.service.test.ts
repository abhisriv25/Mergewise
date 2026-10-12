import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GithubApiError,
  GithubApiNotFoundError,
  fetchPullRequest,
  fetchPullRequestFiles,
} from "./pull-request.service.js";

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  }) as unknown as Promise<Response>;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchPullRequest", () => {
  it("maps a GitHub PR response onto GithubPullRequest", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        jsonResponse({
          id: 999,
          number: 7,
          title: "Add feature",
          body: "Some description",
          state: "open",
          user: { login: "octocat" },
          base: { ref: "main", sha: "base-sha" },
          head: { ref: "feature", sha: "head-sha" },
          html_url: "https://github.com/o/r/pull/7",
          created_at: "2024-01-01T00:00:00.000Z",
          updated_at: "2024-01-02T00:00:00.000Z",
          closed_at: null,
          merged_at: null,
          additions: 10,
          deletions: 2,
          changed_files: 3,
        }),
      ),
    );

    const pr = await fetchPullRequest("token", "octocat", "hello-world", 7);

    expect(pr).toEqual({
      githubPrId: "999",
      number: 7,
      title: "Add feature",
      body: "Some description",
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
    });
  });

  it("maps a missing user (deleted account) to a null author", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        jsonResponse({
          id: 1,
          number: 1,
          title: "t",
          body: null,
          state: "closed",
          user: null,
          base: { ref: "main", sha: "b" },
          head: { ref: "f", sha: "h" },
          html_url: "https://github.com/o/r/pull/1",
          created_at: "2024-01-01T00:00:00.000Z",
          updated_at: "2024-01-01T00:00:00.000Z",
          closed_at: "2024-01-03T00:00:00.000Z",
          merged_at: "2024-01-03T00:00:00.000Z",
          additions: 0,
          deletions: 0,
          changed_files: 0,
        }),
      ),
    );

    const pr = await fetchPullRequest("token", "o", "r", 1);

    expect(pr.author).toBeNull();
    expect(pr.closedAt).toEqual(new Date("2024-01-03T00:00:00.000Z"));
    expect(pr.mergedAt).toEqual(new Date("2024-01-03T00:00:00.000Z"));
  });

  it("throws GithubApiNotFoundError specifically on a 404", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => jsonResponse({}, 404)),
    );

    await expect(fetchPullRequest("token", "o", "r", 1)).rejects.toBeInstanceOf(GithubApiNotFoundError);
  });

  it("throws a generic error on any other non-2xx status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => jsonResponse({}, 503)),
    );

    await expect(fetchPullRequest("token", "o", "r", 1)).rejects.toBeInstanceOf(GithubApiError);
  });
});

describe("fetchPullRequestFiles", () => {
  it("returns a single page's files", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => jsonResponse([{ filename: "src/a.ts" }, { filename: "src/b.ts" }])),
    );

    const files = await fetchPullRequestFiles("token", "o", "r", 1);

    expect(files).toEqual([{ path: "src/a.ts" }, { path: "src/b.ts" }]);
  });

  it("follows pagination and combines every page", async () => {
    const fullPage = Array.from({ length: 100 }, (_, i) => ({ filename: `file-${i}.ts` }));
    const secondPage = [{ filename: "last-file.ts" }];
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => jsonResponse(fullPage))
      .mockImplementationOnce(() => jsonResponse(secondPage));
    vi.stubGlobal("fetch", fetchMock);

    const files = await fetchPullRequestFiles("token", "o", "r", 1);

    expect(files).toHaveLength(101);
    expect(files.at(-1)).toEqual({ path: "last-file.ts" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws GithubApiNotFoundError specifically on a 404", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => jsonResponse({}, 404)),
    );

    await expect(fetchPullRequestFiles("token", "o", "r", 1)).rejects.toBeInstanceOf(GithubApiNotFoundError);
  });

  it("throws a generic error on any other non-2xx status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => jsonResponse({}, 500)),
    );

    await expect(fetchPullRequestFiles("token", "o", "r", 1)).rejects.toBeInstanceOf(GithubApiError);
  });
});
