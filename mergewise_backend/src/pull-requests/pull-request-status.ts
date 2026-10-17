import type { Prisma } from "@prisma/client";

/** GitHub only says "open" or "closed"; Mergewise splits those into the
 * four states a reviewer actually cares about. A merged PR is also
 * "closed" on GitHub, so merged is checked first. */
export const PULL_REQUEST_STATUSES = ["open", "draft", "merged", "closed"] as const;
export type PullRequestStatus = (typeof PULL_REQUEST_STATUSES)[number];

export function pullRequestStatus(pr: { state: string; draft: boolean; mergedAt: Date | null }): PullRequestStatus {
  if (pr.mergedAt) return "merged";
  if (pr.state === "closed") return "closed";
  return pr.draft ? "draft" : "open";
}

/** The same split as pullRequestStatus, as a Prisma filter. "open" means
 * open and ready for review — drafts are their own status. */
export function pullRequestStatusWhere(status: PullRequestStatus): Prisma.PullRequestWhereInput {
  switch (status) {
    case "open":
      return { state: "open", draft: false };
    case "draft":
      return { state: "open", draft: true };
    case "merged":
      return { mergedAt: { not: null } };
    case "closed":
      return { state: "closed", mergedAt: null };
  }
}
