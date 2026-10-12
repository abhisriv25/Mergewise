import { useQuery } from "@tanstack/react-query";
import { ApiError, fetchPullRequest, fetchPullRequestIntelligence, fetchPullRequestRisk, fetchPullRequests } from "./api";

/** 4xx and 503 are definitive answers (not found, not signed in, feature
 * unavailable) — retrying them only delays the UI. */
function retryTransient(failureCount: number, error: unknown) {
  if (error instanceof ApiError && (error.status < 500 || error.status === 503)) return false;
  return failureCount < 2;
}

export function usePullRequests(filters: { repositoryId?: string } = {}) {
  return useQuery({
    queryKey: ["pullRequests", filters.repositoryId ?? null],
    queryFn: () => fetchPullRequests(filters),
    retry: retryTransient,
  });
}

export function usePullRequest(id: string | undefined) {
  return useQuery({
    queryKey: ["pullRequest", id],
    queryFn: () => fetchPullRequest(id!),
    enabled: Boolean(id),
    retry: retryTransient,
  });
}

export function usePullRequestRisk(id: string | undefined) {
  return useQuery({
    queryKey: ["pullRequestRisk", id],
    queryFn: () => fetchPullRequestRisk(id!),
    enabled: Boolean(id),
    retry: retryTransient,
    // An on-demand assessment can involve a real GitHub API call server-side
    // (see fetchPullRequestRisk's doc comment) — don't hammer it on refocus.
    refetchOnWindowFocus: false,
  });
}

export function usePullRequestIntelligence(id: string | undefined) {
  return useQuery({
    queryKey: ["pullRequestIntelligence", id],
    queryFn: () => fetchPullRequestIntelligence(id!),
    enabled: Boolean(id),
    retry: retryTransient,
    // Same reasoning as usePullRequestRisk — an uncached analysis is a real
    // LLM call server-side, not an instant read.
    refetchOnWindowFocus: false,
  });
}
