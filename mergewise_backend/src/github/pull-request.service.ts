export class GithubApiNotFoundError extends Error {}
export class GithubApiError extends Error {}

export interface GithubPullRequest {
  githubPrId: string;
  number: number;
  title: string;
  body: string | null;
  state: string;
  author: string | null;
  baseBranch: string;
  headBranch: string;
  headSha: string;
  baseSha: string;
  url: string;
  createdAt: Date;
  updatedAt: Date;
  closedAt: Date | null;
  mergedAt: Date | null;
  additions: number;
  deletions: number;
  changedFilesCount: number;
}

interface GithubApiPullRequest {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: string;
  user: { login: string } | null;
  base: { ref: string; sha: string };
  head: { ref: string; sha: string };
  html_url: string;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  merged_at: string | null;
  additions: number;
  deletions: number;
  changed_files: number;
}

/** The canonical current state of a PR, fetched fresh from GitHub — never
 * derived from a webhook payload's own PR fields, which can be stale by the
 * time a queued event is actually processed. A 404 is distinguished from
 * every other failure: it means the PR genuinely doesn't exist (permanent),
 * versus a network blip or GitHub 5xx (transient, worth retrying). */
export async function fetchPullRequest(
  installationAccessToken: string,
  owner: string,
  repo: string,
  number: number,
): Promise<GithubPullRequest> {
  const res = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${number}`,
    {
      headers: {
        Authorization: `Bearer ${installationAccessToken}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "mergewise",
      },
    },
  );

  if (res.status === 404) {
    throw new GithubApiNotFoundError(`Pull request ${owner}/${repo}#${number} not found`);
  }
  if (!res.ok) {
    throw new GithubApiError(`Failed to fetch pull request (status ${res.status})`);
  }

  const body = (await res.json()) as GithubApiPullRequest;

  return {
    githubPrId: String(body.id),
    number: body.number,
    title: body.title,
    body: body.body ?? null,
    state: body.state,
    author: body.user?.login ?? null,
    baseBranch: body.base.ref,
    headBranch: body.head.ref,
    headSha: body.head.sha,
    baseSha: body.base.sha,
    url: body.html_url,
    createdAt: new Date(body.created_at),
    updatedAt: new Date(body.updated_at),
    closedAt: body.closed_at ? new Date(body.closed_at) : null,
    mergedAt: body.merged_at ? new Date(body.merged_at) : null,
    additions: body.additions ?? 0,
    deletions: body.deletions ?? 0,
    changedFilesCount: body.changed_files ?? 0,
  };
}

export interface GithubPullRequestFile {
  path: string;
}

interface GithubApiPullRequestFile {
  filename: string;
}

/** The list of files a PR touches, for the risk engine's path-based rules.
 * Follows pagination and combines every page — a PR can easily touch more
 * files than fit in one response page. */
export async function fetchPullRequestFiles(
  installationAccessToken: string,
  owner: string,
  repo: string,
  number: number,
): Promise<GithubPullRequestFile[]> {
  const files: GithubPullRequestFile[] = [];
  let page = 1;

  for (;;) {
    const res = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${number}/files?per_page=100&page=${page}`,
      {
        headers: {
          Authorization: `Bearer ${installationAccessToken}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "mergewise",
        },
      },
    );

    if (res.status === 404) {
      throw new GithubApiNotFoundError(`Pull request ${owner}/${repo}#${number} not found`);
    }
    if (!res.ok) {
      throw new GithubApiError(`Failed to fetch pull request files (status ${res.status})`);
    }

    const page_ = (await res.json()) as GithubApiPullRequestFile[];
    files.push(...page_.map((file) => ({ path: file.filename })));

    if (page_.length < 100) break;
    page += 1;
  }

  return files;
}
