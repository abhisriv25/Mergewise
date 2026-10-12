import { useQuery } from "@tanstack/react-query";
import { ApiError, fetchCurrentUser } from "./api";

export function useCurrentUser() {
  return useQuery({
    queryKey: ["currentUser"],
    queryFn: fetchCurrentUser,
    retry: (failureCount, error) => {
      // A 401 means "not logged in" — that's an expected state, not a
      // transient failure worth retrying.
      if (error instanceof ApiError && error.status === 401) return false;
      return failureCount < 2;
    },
  });
}
