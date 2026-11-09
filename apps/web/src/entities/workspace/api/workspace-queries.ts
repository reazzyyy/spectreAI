import { queryOptions } from "@tanstack/react-query";
import {
  fetchWorkspace,
  listWorkspaceMatters,
  listWorkspaceMembers,
  listWorkspaces,
} from "./workspace-api";

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

/** Query key + options for GET /workspaces/:id/matters. */
export function workspaceMattersQueryOptions(workspaceId: string) {
  return queryOptions({
    queryKey: ["workspaces", "matters", workspaceId] as const,
    queryFn: () => listWorkspaceMatters(workspaceId),
    enabled: workspaceId.length > 0,
  });
}

/** Query key + options for GET /workspaces/:id/members. */
export function workspaceMembersQueryOptions(workspaceId: string) {
  return queryOptions({
    queryKey: ["workspaces", "members", workspaceId] as const,
    queryFn: () => listWorkspaceMembers(workspaceId),
    enabled: workspaceId.length > 0,
  });
}
