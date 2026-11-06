import { queryOptions } from "@tanstack/react-query";
import { fetchMe } from "./session-api";

/** Query key + options for GET /auth/me. */
export const sessionMeQueryOptions = queryOptions({
  queryKey: ["session", "me"] as const,
  queryFn: fetchMe,
});
