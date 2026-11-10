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
  deleteById(id: string): Promise<boolean>;
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

    return this.store.listByWorkspace(actorOrganizationId, workspaceId, options);
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

  async deleteForOrganization(
    actorOrganizationId: string,
    documentId: string,
  ): Promise<boolean> {
    const existing = await this.readForOrganization(actorOrganizationId, documentId);
    if (!existing) {
      return false;
    }
    return this.store.deleteById(documentId);
  }
}
