import { queryOptions } from "@tanstack/react-query";
import { fetchMatter, listMatters } from "./matter-api";

/** Query key + options for GET /matters. */
export const mattersListQueryOptions = queryOptions({
  queryKey: ["matters", "list"] as const,
  queryFn: listMatters,
});

/** Query key + options for GET /matters/:id. */
export function matterDetailQueryOptions(matterId: string) {
  return queryOptions({
    queryKey: ["matters", "detail", matterId] as const,
    queryFn: () => fetchMatter(matterId),
    enabled: matterId.length > 0,
  });
}
