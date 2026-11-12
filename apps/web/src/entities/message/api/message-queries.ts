import { queryOptions } from "@tanstack/react-query";
import { listMessages } from "./message-api";

/** Query key + options for GET /conversations/:id/messages. */
export function messageHistoryQueryOptions(conversationId: string) {
  return queryOptions({
    queryKey: ["messages", "history", conversationId] as const,
    queryFn: () => listMessages(conversationId),
    enabled: conversationId.length > 0,
  });
}
