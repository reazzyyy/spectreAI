/** Conversation DTO from Nest Phase 5A (docs/32). */
export type ConversationVisibility = "PRIVATE" | "WORKSPACE";
export type ConversationStatus = "ACTIVE" | "ARCHIVED";

export interface Conversation {
  id: string;
  organizationId: string;
  workspaceId: string;
  ownerUserId: string;
  createdByUserId: string;
  visibility: ConversationVisibility;
  title: string | null;
  status: ConversationStatus;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationListResponse {
  items: Conversation[];
  nextCursor: string | null;
}

export interface CreateConversationInput {
  visibility: ConversationVisibility;
  title?: string | null;
}
