import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ApiError,
  fetchPullRequest,
  fetchPullRequestIntelligence,
  fetchPullRequestRisk,
  fetchPullRequestSummary,
  fetchPullRequests,
  reassessPullRequest,
  type PullRequestFilters,
} from "./api";

/** 4xx and 503 are definitive answers (not found, not signed in, feature
 * unavailable) — retrying them only delays the UI. */
function retryTransient(failureCount: number, error: unknown) {
  if (error instanceof ApiError && (error.status < 500 || error.status === 503)) return false;
  return failureCount < 2;
}

export function usePullRequests(filters: PullRequestFilters = {}) {
  return useQuery({
    queryKey: ["pullRequests", filters],
    queryFn: () => fetchPullRequests(filters),
    retry: retryTransient,
    // Keep the current page on screen while the next one loads, instead of
    // flashing a skeleton on every filter change or page turn.
    placeholderData: keepPreviousData,
  });
}

export function usePullRequestSummary() {
  return useQuery({
    queryKey: ["pullRequestSummary"],
    queryFn: fetchPullRequestSummary,
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

/** The "Re-assess" button. The new score replaces the shown one straight
 * away; the PR itself, its AI review (tied to the assessment it explains)
 * and every list and count that shows its score are refetched. */
export function useReassessPullRequest(id: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => reassessPullRequest(id!),
    onSuccess: (assessment) => {
      queryClient.setQueryData(["pullRequestRisk", id], assessment);
      void queryClient.invalidateQueries({ queryKey: ["pullRequest", id] });
      void queryClient.invalidateQueries({ queryKey: ["pullRequestIntelligence", id] });
      void queryClient.invalidateQueries({ queryKey: ["pullRequests"] });
      void queryClient.invalidateQueries({ queryKey: ["pullRequestSummary"] });
    },
  });
}
