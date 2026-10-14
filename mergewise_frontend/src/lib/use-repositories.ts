import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { disconnectRepository, fetchRepositories, reconnectRepository, syncRepositories } from "./api";

/** Every repository, disconnected ones included — filter with
 * useConnectedRepositories when only tracked ones matter. */
export function useRepositories() {
  return useQuery({
    queryKey: ["repositories"],
    queryFn: fetchRepositories,
  });
}

export function useConnectedRepositories() {
  const query = useRepositories();
  return { ...query, repositories: (query.data?.repositories ?? []).filter((repo) => !repo.disconnectedAt) };
}

/** Connecting or disconnecting a repo changes which PRs are visible, so
 * PR lists and counts are refetched along with the repo list. */
function useRepositoryMutation<TArgs, TResult>(mutationFn: (args: TArgs) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["repositories"] });
      void queryClient.invalidateQueries({ queryKey: ["pullRequests"] });
      void queryClient.invalidateQueries({ queryKey: ["pullRequestSummary"] });
    },
  });
}

export function useSyncRepositories() {
  return useRepositoryMutation(() => syncRepositories());
}

export function useDisconnectRepository() {
  return useRepositoryMutation((id: string) => disconnectRepository(id));
}

export function useReconnectRepository() {
  return useRepositoryMutation((id: string) => reconnectRepository(id));
}
