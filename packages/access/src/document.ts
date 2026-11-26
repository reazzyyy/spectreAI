/**
 * Document metadata access (Phase 3 thin).
 * Organization isolation on the store; Workspace content ACL is enforced by callers
 * via {@link WorkspaceAccess} before create/list/read (W-005).
 */

export type DocumentStatus =
  | "uploading"
  | "uploaded"
  | "processing"
  | "ready"
  | "processing_failed"
  | "archived"
  | "deletion_pending"
  | "deleted";

export interface DocumentListCursor {
  createdAt: Date;
  id: string;
}

export interface DocumentListPage {
  items: DocumentRecord[];
  nextCursor: DocumentListCursor | null;
}

export interface DocumentRecord {
  id: string;
  organizationId: string;
  workspaceId: string;
  title: string;
  status: DocumentStatus;
  originalFileName: string;
  mimeType: string;
  byteSize: number;
  checksumSha256: string;
  storageKey: string;
  uploadedByUserId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface DocumentCreateInput {
  /** Optional pre-allocated UUID so storageKey can include documentId before insert. */
  id?: string;
  title: string;
  originalFileName: string;
  mimeType: string;
  byteSize: number;
  checksumSha256: string;
  storageKey: string;
  uploadedByUserId: string;
  status?: DocumentStatus;
}

/** Second person named on a confirmed deletion. Role checks stay in Phase 10. */
export interface DeletionConfirmation {
  actorUserId: string;
  confirmerUserId: string;
  requestedAt: Date;
  purgeAfter: Date;
}

export type DeletionOutcome =
  | { outcome: "hard_deleted" }
  | { outcome: "pending" }
  | { outcome: "already_pending" };

/**
 * True only when a different non-empty user is named.
 * Does not decide which roles may confirm (D-039, Phase 10).
 */
export function independentConfirmer(
  actorUserId: string,
  confirmerUserId: string | null | undefined,
): boolean {
  const actor = actorUserId.trim();
  const confirmer = confirmerUserId?.trim() ?? "";
  return actor.length > 0 && confirmer.length > 0 && confirmer !== actor;
}

/** Missing or same-person confirmer. The deletion is not performed. */
export class DeletionConfirmationRequiredError extends Error {
  constructor() {
    super("DELETION_CONFIRMATION_REQUIRED");
    this.name = "DELETION_CONFIRMATION_REQUIRED";
  }
}

const HIDDEN_FROM_READERS = new Set<DocumentStatus>(["deletion_pending", "deleted"]);

/** 24h physical-purge deadline from the moment the document becomes unreadable (D-019). */
export const DELETION_PURGE_DELAY_MS = 24 * 60 * 60 * 1000;

export function deletionPurgeAfter(requestedAt: Date): Date {
  return new Date(requestedAt.getTime() + DELETION_PURGE_DELAY_MS);
}

export interface DocumentStore {
  findById(id: string): Promise<DocumentRecord | null>;
  listByWorkspace(
    organizationId: string,
    workspaceId: string,
    options?: { limit?: number; cursor?: DocumentListCursor },
  ): Promise<DocumentListPage>;
  create(
    organizationId: string,
    workspaceId: string,
    input: DocumentCreateInput,
  ): Promise<DocumentRecord>;
  updateStatus(
    id: string,
    status: DocumentStatus,
  ): Promise<DocumentRecord | null>;
  /**
   * Physical remove. Implementations must delete only `uploading` rows,
   * and only inside the caller's transaction (D-038).
   */
  deleteById(id: string): Promise<boolean>;
  /**
   * Mark a persisted document `deletion_pending` and record the journal row.
   * Must not clear the stored object key; readers strip it.
   */
  markDeletionPending(
    id: string,
    confirmation: DeletionConfirmation,
  ): Promise<DocumentRecord | null>;
}

function hasOrganization(actorOrganizationId: string): boolean {
  return actorOrganizationId.trim() !== "";
}

/**
 * Document CRUD gated by server-resolved organizationId.
 * Does not encode Workspace membership — callers must check content ACL first.
 */
export class DocumentAccess {
  constructor(private readonly store: DocumentStore) {}

  async readForOrganization(
    actorOrganizationId: string,
    documentId: string,
  ): Promise<DocumentRecord | null> {
    if (!hasOrganization(actorOrganizationId)) {
      return null;
    }

    const document = await this.store.findById(documentId);
    if (!document || document.organizationId !== actorOrganizationId) {
      return null;
    }
    if (HIDDEN_FROM_READERS.has(document.status)) {
      return null;
    }

    return document;
  }

  async listForWorkspace(
    actorOrganizationId: string,
    workspaceId: string,
    options?: { limit?: number; cursor?: DocumentListCursor },
  ): Promise<DocumentListPage> {
    if (!hasOrganization(actorOrganizationId)) {
      return { items: [], nextCursor: null };
    }

    const page = await this.store.listByWorkspace(
      actorOrganizationId,
      workspaceId,
      options,
    );
    return {
      ...page,
      items: page.items.filter((row) => !HIDDEN_FROM_READERS.has(row.status)),
    };
  }

  async createForWorkspace(
    actorOrganizationId: string,
    workspaceId: string,
    input: DocumentCreateInput,
  ): Promise<DocumentRecord | null> {
    if (!hasOrganization(actorOrganizationId)) {
      return null;
    }

    return this.store.create(actorOrganizationId, workspaceId, input);
  }

  async updateStatusForOrganization(
    actorOrganizationId: string,
    documentId: string,
    status: DocumentStatus,
  ): Promise<DocumentRecord | null> {
    const existing = await this.readForOrganization(actorOrganizationId, documentId);
    if (!existing) {
      return null;
    }
    return this.store.updateStatus(documentId, status);
  }

  /**
   * Rollback of an in-flight upload. Ready and processing documents are not
   * removed here (D-038).
   */
  async deleteForOrganization(
    actorOrganizationId: string,
    documentId: string,
  ): Promise<boolean> {
    const existing = await this.store.findById(documentId);
    if (
      !existing ||
      existing.organizationId !== actorOrganizationId ||
      existing.status !== "uploading"
    ) {
      return false;
    }
    return this.store.deleteById(documentId);
  }

  /**
   * Hide a persisted document immediately. Without a different confirmer the
   * row stays readable (D-039). `uploading` is a hard delete and does not
   * need a confirmer. A second call is a no-op.
   */
  async requestDeletion(
    actorOrganizationId: string,
    documentId: string,
    actorUserId: string,
    confirmerUserId: string | null,
    requestedAt: Date = new Date(),
  ): Promise<DeletionOutcome | null> {
    const existing = await this.store.findById(documentId);
    if (!existing || existing.organizationId !== actorOrganizationId) {
      return null;
    }
    if (existing.status === "deletion_pending" || existing.status === "deleted") {
      return { outcome: "already_pending" };
    }
    if (existing.status === "uploading") {
      const removed = await this.store.deleteById(documentId);
      return removed ? { outcome: "hard_deleted" } : null;
    }
    if (!independentConfirmer(actorUserId, confirmerUserId)) {
      throw new DeletionConfirmationRequiredError();
    }
    const pending = await this.store.markDeletionPending(documentId, {
      actorUserId,
      confirmerUserId: confirmerUserId!.trim(),
      requestedAt,
      purgeAfter: deletionPurgeAfter(requestedAt),
    });
    if (!pending) {
      return null;
    }
    return { outcome: "pending" };
  }
}
