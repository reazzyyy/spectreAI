import { queryOptions } from "@tanstack/react-query";
import { listMatters } from "./matter-api";

/** Query key + options for GET /matters. */
export const mattersListQueryOptions = queryOptions({
  queryKey: ["matters", "list"] as const,
  queryFn: listMatters,
});
