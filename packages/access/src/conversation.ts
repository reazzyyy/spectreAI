/**
 * Conversation ACL (Phase 5A-1 / docs/32 §6.1, W-007/W-008).
 * NestJS authz remains mandatory; IDs alone are not proof of access.
 * Org Admin never gains content via these helpers (grant is a later slice).
 */

import type {
  WorkspaceAccess,
  WorkspaceActor,
  WorkspaceEffectiveRole,
} from "./workspace.js";

export type ConversationVisibility = "PRIVATE" | "WORKSPACE";
export type ConversationStatus = "ACTIVE" | "ARCHIVED";

export interface ConversationRecord {
  id: string;
  organizationId: string;
  workspaceId: string;
  ownerUserId: string;
  createdByUserId: string;
  visibility: ConversationVisibility;
  title: string | null;
  status: ConversationStatus;
  lastMessageAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConversationCreateInput {
  visibility: ConversationVisibility;
  title?: string | null;
}

export interface ConversationListCursor {
  lastMessageAt: Date | null;
  id: string;
}

export interface ConversationListPage {
  items: ConversationRecord[];
  nextCursor: ConversationListCursor | null;
}

/**
 * Persistence for Conversation. Callers must not trust client-supplied org/user ids;
 * {@link ConversationAccess} stamps and checks the actor.
 */
export interface ConversationStore {
  findById(id: string): Promise<ConversationRecord | null>;
  listByWorkspace(
    organizationId: string,
    workspaceId: string,
    options?: { limit?: number; cursor?: ConversationListCursor },
  ): Promise<ConversationListPage>;
  create(
    organizationId: string,
    workspaceId: string,
    ownerUserId: string,
    createdByUserId: string,
    input: ConversationCreateInput,
  ): Promise<ConversationRecord>;
}

function hasOrg(actor: WorkspaceActor): boolean {
  return actor.organizationId.trim() !== "" && actor.userId.trim() !== "";
}

function canReadConversation(
  actor: WorkspaceActor,
  conversation: ConversationRecord,
  workspaceRole: WorkspaceEffectiveRole,
): boolean {
  if (conversation.organizationId !== actor.organizationId) {
    return false;
  }
  if (conversation.visibility === "PRIVATE") {
    return conversation.ownerUserId === actor.userId;
  }
  // WORKSPACE: any content role on the workspace (OWNER/EDITOR/VIEWER).
  return workspaceRole === "OWNER" || workspaceRole === "EDITOR" || workspaceRole === "VIEWER";
}

function canMutateConversation(
  actor: WorkspaceActor,
  conversation: ConversationRecord,
  workspaceRole: WorkspaceEffectiveRole,
): boolean {
  if (!canReadConversation(actor, conversation, workspaceRole)) {
    return false;
  }
  if (workspaceRole !== "OWNER" && workspaceRole !== "EDITOR") {
    return false;
  }
  if (conversation.visibility === "PRIVATE") {
    return conversation.ownerUserId === actor.userId;
  }
  return true;
}

/**
 * Conversation content ACL on top of {@link WorkspaceAccess} content role.
 * Wrong org / no access → null so HTTP can map to identical NOT_FOUND.
 */
export class ConversationAccess {
  constructor(
    private readonly store: ConversationStore,
    private readonly workspaces: WorkspaceAccess,
  ) {}

  async canRead(actor: WorkspaceActor, conversationId: string): Promise<boolean> {
    return (await this.read(actor, conversationId)) !== null;
  }

  async canMutate(actor: WorkspaceActor, conversationId: string): Promise<boolean> {
    if (!hasOrg(actor)) {
      return false;
    }
    const conversation = await this.store.findById(conversationId);
    if (!conversation || conversation.organizationId !== actor.organizationId) {
      return false;
    }
    const role = await this.workspaces.resolveContentRole(actor, conversation.workspaceId);
    if (!role) {
      return false;
    }
    return canMutateConversation(actor, conversation, role);
  }

  /** Content read of one conversation → record or null (uniform NOT_FOUND). */
  async read(
    actor: WorkspaceActor,
    conversationId: string,
  ): Promise<ConversationRecord | null> {
    if (!hasOrg(actor)) {
      return null;
    }
    const conversation = await this.store.findById(conversationId);
    if (!conversation || conversation.organizationId !== actor.organizationId) {
      return null;
    }
    const role = await this.workspaces.resolveContentRole(actor, conversation.workspaceId);
    if (!role) {
      return null;
    }
    if (!canReadConversation(actor, conversation, role)) {
      return null;
    }
    return conversation;
  }

  /**
   * Lists conversations in a workspace visible to the actor.
   * Filters PRIVATE (owner only) and WORKSPACE (content members) in process;
   * store returns org+workspace scoped rows.
   */
  async listForWorkspace(
    actor: WorkspaceActor,
    workspaceId: string,
    options?: { limit?: number; cursor?: ConversationListCursor },
  ): Promise<ConversationListPage> {
    if (!hasOrg(actor)) {
      return { items: [], nextCursor: null };
    }
    const role = await this.workspaces.resolveContentRole(actor, workspaceId);
    if (!role) {
      return { items: [], nextCursor: null };
    }

    const page = await this.store.listByWorkspace(
      actor.organizationId,
      workspaceId,
      options,
    );
    const items = page.items.filter((row) =>
      canReadConversation(actor, row, role),
    );
    return { items, nextCursor: page.nextCursor };
  }

  /**
   * Create Conversation. Stamps organizationId, ownerUserId, createdByUserId from actor.
   * Requires workspace content mutate (OWNER/EDITOR). PERSONAL workspace still allows
   * PRIVATE or WORKSPACE visibility values; effective access remains owner-only for PERSONAL.
   */
  async create(
    actor: WorkspaceActor,
    workspaceId: string,
    input: ConversationCreateInput,
  ): Promise<ConversationRecord | null> {
    if (!hasOrg(actor)) {
      return null;
    }
    if (input.visibility !== "PRIVATE" && input.visibility !== "WORKSPACE") {
      return null;
    }
    if (!(await this.workspaces.canMutateContent(actor, workspaceId))) {
      return null;
    }

    return this.store.create(
      actor.organizationId,
      workspaceId,
      actor.userId,
      actor.userId,
      {
        visibility: input.visibility,
        title: input.title ?? null,
      },
    );
  }
}
