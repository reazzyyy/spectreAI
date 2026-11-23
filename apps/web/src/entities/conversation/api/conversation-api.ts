import { apiRequest, withListPage } from "@/shared/api";
import type {
  Conversation,
  ConversationListResponse,
  CreateConversationInput,
} from "../model/types";

/** GET /workspaces/:id/conversations — ACL-filtered list. */
export function listConversations(
  workspaceId: string,
  input?: { cursor?: string | null },
): Promise<ConversationListResponse> {
  return apiRequest<ConversationListResponse>(
    withListPage(
      `/workspaces/${encodeURIComponent(workspaceId)}/conversations`,
      input,
    ),
    { method: "GET" },
  );
}

/** POST /workspaces/:id/conversations */
export function createConversation(
  workspaceId: string,
  input: CreateConversationInput,
): Promise<Conversation> {
  return apiRequest<Conversation>(
    `/workspaces/${encodeURIComponent(workspaceId)}/conversations`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

/** GET /conversations/:id */
export function fetchConversation(conversationId: string): Promise<Conversation> {
  return apiRequest<Conversation>(
    `/conversations/${encodeURIComponent(conversationId)}`,
    { method: "GET" },
  );
}
