import { queryOptions } from "@tanstack/react-query";
import { listWorkspaceDocuments } from "./document-api";

/** Query key + options for GET /workspaces/:id/documents. */
export function workspaceDocumentsQueryOptions(workspaceId: string) {
  return queryOptions({
    queryKey: ["documents", "workspace", workspaceId] as const,
    queryFn: () => listWorkspaceDocuments(workspaceId),
    enabled: workspaceId.length > 0,
  });
}
