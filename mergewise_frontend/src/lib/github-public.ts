/** Reads a public pull request straight from GitHub's REST API, in the
 * visitor's browser. Unauthenticated, so GitHub allows 60 requests an hour
 * per visitor IP. Nothing here goes through the Mergewise backend. */

export interface PrRef {
  owner: string;
  repo: string;
  number: number;
}

export interface PublicPullRequest {
  ref: PrRef;
  title: string;
  author: string;
  url: string;
  state: "open" | "closed" | "merged";
  additions: number;
  deletions: number;
  changedFilesCount: number;
  changedFiles: string[];
  /** GitHub lists at most MAX_FILE_PAGES × 100 files; totals stay exact. */
  filesTruncated: boolean;
  /** Requests left in the visitor's hourly GitHub quota, if GitHub said. */
  rateLimitRemaining: number | null;
}

export class GithubLookupError extends Error {
  constructor(
    message: string,
    readonly kind: "invalid" | "not_found" | "rate_limited" | "network",
  ) {
    super(message);
  }
}

const API = "https://api.github.com";
const MAX_FILE_PAGES = 10;

/** Accepts a PR URL (https://github.com/o/r/pull/1, with or without extra
 * path/query) or the short form o/r#1. */
export function parsePrReference(input: string): PrRef | null {
  const text = input.trim();
  const url = text.match(/github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)/i);
  const short = text.match(/^([\w.-]+)\/([\w.-]+)#(\d+)$/);
  const m = url ?? short;
  if (!m) return null;
  return { owner: m[1], repo: m[2].replace(/\.git$/, ""), number: Number(m[3]) };
}

async function getJson(path: string): Promise<{ body: unknown; remaining: number | null }> {
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, { headers: { Accept: "application/vnd.github+json" } });
  } catch {
    throw new GithubLookupError("Couldn't reach GitHub. Check your connection and try again.", "network");
  }

  const remainingHeader = res.headers.get("x-ratelimit-remaining");
  const remaining = remainingHeader === null ? null : Number(remainingHeader);

  if (res.status === 404) {
    throw new GithubLookupError(
      "That pull request doesn't exist, or it's in a private repository. Only public PRs can be scored here.",
      "not_found",
    );
  }
  if (res.status === 403 || res.status === 429) {
    const reset = Number(res.headers.get("x-ratelimit-reset"));
    const minutes = reset ? Math.max(1, Math.ceil((reset * 1000 - Date.now()) / 60000)) : null;
    throw new GithubLookupError(
      `GitHub's free hourly limit for your network is used up.${minutes ? ` Try again in about ${minutes} min.` : ""}`,
      "rate_limited",
    );
  }
  if (!res.ok) {
    throw new GithubLookupError(`GitHub returned an error (${res.status}). Please try again.`, "network");
  }
  return { body: await res.json(), remaining };
}

interface GithubPull {
  title: string;
  html_url: string;
  state: "open" | "closed";
  merged_at: string | null;
  additions: number;
  deletions: number;
  changed_files: number;
  user: { login: string } | null;
}

export async function fetchPublicPullRequest(ref: PrRef): Promise<PublicPullRequest> {
  const base = `/repos/${ref.owner}/${ref.repo}/pulls/${ref.number}`;
  const { body, remaining: afterPull } = await getJson(base);
  const pull = body as GithubPull;

  const changedFiles: string[] = [];
  let remaining = afterPull;
  const pages = Math.min(MAX_FILE_PAGES, Math.max(1, Math.ceil(pull.changed_files / 100)));
  for (let page = 1; page <= pages; page++) {
    const result = await getJson(`${base}/files?per_page=100&page=${page}`);
    remaining = result.remaining;
    const files = result.body as { filename: string }[];
    changedFiles.push(...files.map((f) => f.filename));
    if (files.length < 100) break;
  }

  return {
    ref,
    title: pull.title,
    author: pull.user?.login ?? "unknown",
    url: pull.html_url,
    state: pull.merged_at ? "merged" : pull.state,
    additions: pull.additions,
    deletions: pull.deletions,
    changedFilesCount: pull.changed_files,
    changedFiles,
    filesTruncated: changedFiles.length < pull.changed_files,
    rateLimitRemaining: remaining,
  };
}
