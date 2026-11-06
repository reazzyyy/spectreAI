import { queryOptions } from "@tanstack/react-query";
import { listWorkspaces } from "./workspace-api";

/** Query key + options for GET /workspaces. */
export const workspacesListQueryOptions = queryOptions({
  queryKey: ["workspaces", "list"] as const,
  queryFn: listWorkspaces,
});
