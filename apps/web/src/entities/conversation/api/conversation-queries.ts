import { queryOptions } from "@tanstack/react-query";
import { fetchConversation, listConversations } from "./conversation-api";

/** Query key + options for GET /workspaces/:id/conversations. */
export function conversationListQueryOptions(workspaceId: string) {
  return queryOptions({
    queryKey: ["conversations", "list", workspaceId] as const,
    queryFn: () => listConversations(workspaceId),
    enabled: workspaceId.length > 0,
  });
}

/** Query key + options for GET /conversations/:id. */
export function conversationDetailQueryOptions(conversationId: string) {
  return queryOptions({
    queryKey: ["conversations", "detail", conversationId] as const,
    queryFn: () => fetchConversation(conversationId),
    enabled: conversationId.length > 0,
  });
}
