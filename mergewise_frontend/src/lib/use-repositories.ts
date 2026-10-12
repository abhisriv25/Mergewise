import { useQuery } from "@tanstack/react-query";
import { fetchRepositories } from "./api";

export function useRepositories() {
  return useQuery({
    queryKey: ["repositories"],
    queryFn: fetchRepositories,
  });
}
