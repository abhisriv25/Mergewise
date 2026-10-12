import { prisma } from "../prisma.js";
import type { GithubPullRequest } from "../github/pull-request.service.js";

// GitHub omits `user` entirely for a PR authored by an account that's
// since been deleted — a placeholder keeps the upsert from crashing on a
// field the DB requires.
const DELETED_USER_PLACEHOLDER = "ghost";

/** Upserts on (repositoryId, githubPrId), never a plain create — processing
 * the same PR multiple times (opened, then synchronize, then closed; or a
 * duplicate poll pass) always targets the same row and always reflects the
 * *latest* fetch, never a stale merge of old and new. */
export async function upsertPullRequest(repositoryId: string, pr: GithubPullRequest) {
  const author = pr.author ?? DELETED_USER_PLACEHOLDER;

  const fields = {
    number: pr.number,
    title: pr.title,
    body: pr.body,
    state: pr.state,
    author,
    baseBranch: pr.baseBranch,
    headBranch: pr.headBranch,
    headSha: pr.headSha,
    baseSha: pr.baseSha,
    url: pr.url,
    createdAt: pr.createdAt,
    updatedAt: pr.updatedAt,
    closedAt: pr.closedAt,
    mergedAt: pr.mergedAt,
    additions: pr.additions,
    deletions: pr.deletions,
    changedFilesCount: pr.changedFilesCount,
  };

  return prisma.pullRequest.upsert({
    where: {
      repositoryId_githubPrId: { repositoryId, githubPrId: pr.githubPrId },
    },
    update: fields,
    create: {
      repositoryId,
      githubPrId: pr.githubPrId,
      ...fields,
    },
  });
}
