import { queryOptions } from "@tanstack/react-query";
import { fetchWorkspace, listWorkspaces } from "./workspace-api";

/** Query key + options for GET /workspaces. */
export const workspacesListQueryOptions = queryOptions({
  queryKey: ["workspaces", "list"] as const,
  queryFn: listWorkspaces,
});

/** Query key + options for GET /workspaces/:id. */
export function workspaceDetailQueryOptions(workspaceId: string) {
  return queryOptions({
    queryKey: ["workspaces", "detail", workspaceId] as const,
    queryFn: () => fetchWorkspace(workspaceId),
    enabled: workspaceId.length > 0,
  });
}
