/** Chat message DTO from Nest Phase 5A. */
export type MessageRole = "user" | "assistant";

export interface Message {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  createdByUserId: string | null;
  generationId: string | null;
  clientMessageId: string | null;
  createdAt: string;
}

export interface MessageListResponse {
  items: Message[];
  nextCursor: string | null;
}

export interface SendMessageInput {
  content: string;
  clientMessageId?: string;
}

export interface SendMessageResponse {
  message: Message;
  generationId: string;
  jobId: string;
  reused: boolean;
  synthetic: boolean;
}
