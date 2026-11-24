import { queryOptions } from "@tanstack/react-query";
import { listInfiniteOptions } from "@/shared/api";
import { fetchConversation, listConversations } from "./conversation-api";

/** Query key + options for GET /workspaces/:id/conversations. */
export function conversationListQueryOptions(workspaceId: string) {
  return listInfiniteOptions(
    ["conversations", "list", workspaceId] as const,
    (cursor) => listConversations(workspaceId, { cursor }),
    workspaceId.length > 0,
  );
}

/** Query key + options for GET /conversations/:id. */
export function conversationDetailQueryOptions(conversationId: string) {
  return queryOptions({
    queryKey: ["conversations", "detail", conversationId] as const,
    queryFn: () => fetchConversation(conversationId),
    enabled: conversationId.length > 0,
  });
}
