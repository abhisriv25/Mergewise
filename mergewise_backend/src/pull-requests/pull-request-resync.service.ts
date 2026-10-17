import { fetchInstallationAccessToken } from "../github/github-app-auth.service.js";
import { fetchPullRequest } from "../github/pull-request.service.js";
import { prisma } from "../prisma.js";
import { PullRequestNotFoundError, assessPullRequest } from "../risk/risk-assessment.service.js";
import { upsertPullRequest } from "./pull-request.repository.js";

/** What the "Re-assess" button does: refetches the PR from GitHub (in case
 * a webhook was missed and the stored row is stale), then always scores it
 * again — even when the latest assessment still looks current. */
export async function resyncAndReassessPullRequest(pullRequestId: string) {
  const pullRequest = await prisma.pullRequest.findUnique({
    where: { id: pullRequestId },
    include: { repository: true },
  });
  if (!pullRequest) {
    throw new PullRequestNotFoundError(`Pull request ${pullRequestId} not found`);
  }

  const { repository } = pullRequest;
  const accessToken = await fetchInstallationAccessToken(repository.githubInstallationId);
  const fresh = await fetchPullRequest(accessToken, repository.owner, repository.name, pullRequest.number);
  await upsertPullRequest(repository.id, fresh);

  return assessPullRequest(pullRequestId);
}
