import type { PullRequest } from "@prisma/client";
import type { GithubPullRequestFile } from "../github/pull-request.service.js";
import type { RiskInput } from "./risk-engine.js";

/** Uses the PR's own stored diff totals (additions/deletions/changedFilesCount)
 * rather than re-deriving them from the fetched files list — those columns
 * are GitHub's own counters, already captured when the PR was synced. The
 * files list is only needed for the path-based rules. */
export function buildRiskInput(pullRequest: PullRequest, files: GithubPullRequestFile[]): RiskInput {
  return {
    additions: pullRequest.additions,
    deletions: pullRequest.deletions,
    changedFilesCount: pullRequest.changedFilesCount,
    changedFiles: files.map((file) => file.path),
  };
}
