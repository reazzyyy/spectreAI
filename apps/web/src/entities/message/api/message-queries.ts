import { listInfiniteOptions } from "@/shared/api";
import { listMessages } from "./message-api";

/** Query key + options for GET /conversations/:id/messages. */
export function messageHistoryQueryOptions(conversationId: string) {
  return listInfiniteOptions(
    ["messages", "history", conversationId] as const,
    (cursor) => listMessages(conversationId, { cursor }),
    conversationId.length > 0,
  );
}
