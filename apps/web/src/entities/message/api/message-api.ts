import { apiRequest } from "@/shared/api";
import type {
  MessageListResponse,
  SendMessageInput,
  SendMessageResponse,
} from "../model/types";

/** GET /conversations/:id/messages — newest first from API. */
export function listMessages(conversationId: string): Promise<MessageListResponse> {
  return apiRequest<MessageListResponse>(
    `/conversations/${encodeURIComponent(conversationId)}/messages`,
    { method: "GET" },
  );
}

/** POST /conversations/:id/messages with Idempotency-Key (D-027). */
export function sendMessage(
  conversationId: string,
  input: SendMessageInput,
  options: { idempotencyKey: string },
): Promise<SendMessageResponse> {
  return apiRequest<SendMessageResponse>(
    `/conversations/${encodeURIComponent(conversationId)}/messages`,
    {
      method: "POST",
      headers: { "Idempotency-Key": options.idempotencyKey },
      body: JSON.stringify(input),
    },
  );
}
