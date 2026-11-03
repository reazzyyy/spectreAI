/**
 * Workspace access policy (W-001–W-008).
 * Content read ≠ member management. Org Admin never gets content via these helpers (grant is later).
 * Wrong org / no access → null so HTTP can map to identical NOT_FOUND.
 */

export type WorkspaceVisibility = "PERSONAL" | "TEAM";
export type WorkspaceStatus = "ACTIVE" | "ARCHIVED" | "PENDING_DELETION" | "DELETING" | "DELETED";
export type WorkspaceMemberRole = "EDITOR" | "VIEWER";
export type WorkspaceMemberStatus = "ACTIVE" | "REVOKED";
export type WorkspaceEffectiveRole = "OWNER" | "EDITOR" | "VIEWER";
export type OrganizationActorRole = "owner" | "admin" | "member";

/** Server-resolved actor for Workspace checks (session + live org membership). */
export interface WorkspaceActor {
  userId: string;
  organizationId: string;
  /** OrganizationMembership.role — not a Workspace role */
  orgRole: OrganizationActorRole;
}

export interface WorkspaceRecord {
  id: string;
  organizationId: string;
  ownerUserId: string;
  name: string;
  description: string | null;
  visibility: WorkspaceVisibility;
  status: WorkspaceStatus;
  clientId: string | null;
}

export interface WorkspaceMemberRecord {
  id: string;
  organizationId: string;
  workspaceId: string;
  userId: string;
  role: WorkspaceMemberRole;
  status: WorkspaceMemberStatus;
}

export interface WorkspaceCreatePersonalInput {
  name: string;
  description?: string | null;
  clientId?: string | null;
}

export interface WorkspaceUpdateInput {
  name?: string;
  description?: string | null;
  clientId?: string | null;
  status?: WorkspaceStatus;
}

export interface WorkspaceMemberUpsertInput {
  userId: string;
  role: WorkspaceMemberRole;
}

/**
 * Persistence for Workspace + members. Callers must not trust client-supplied org/user ids;
 * {@link WorkspaceAccess} stamps and checks the actor.
 */
export interface WorkspaceMatterLink {
  organizationId: string;
  workspaceId: string;
  matterId: string;
}

export interface WorkspaceStore {
  findById(id: string): Promise<WorkspaceRecord | null>;
  listByOrganization(organizationId: string): Promise<WorkspaceRecord[]>;
  create(organizationId: string, ownerUserId: string, input: WorkspaceCreatePersonalInput): Promise<WorkspaceRecord>;
  update(id: string, input: WorkspaceUpdateInput): Promise<WorkspaceRecord | null>;
  findActiveMember(workspaceId: string, userId: string): Promise<WorkspaceMemberRecord | null>;
  listActiveMembers(workspaceId: string): Promise<WorkspaceMemberRecord[]>;
  upsertMember(
    organizationId: string,
    workspaceId: string,
    input: WorkspaceMemberUpsertInput,
    addedByUserId: string,
  ): Promise<WorkspaceMemberRecord | null>;
  revokeMember(workspaceId: string, userId: string): Promise<WorkspaceMemberRecord | null>;
  listMatterLinks(workspaceId: string): Promise<WorkspaceMatterLink[]>;
  linkMatter(
    organizationId: string,
    workspaceId: string,
    matterId: string,
    createdByUserId: string,
  ): Promise<WorkspaceMatterLink | null>;
  unlinkMatter(workspaceId: string, matterId: string): Promise<boolean>;
}

function hasOrg(actor: WorkspaceActor): boolean {
  return actor.organizationId.trim() !== "" && actor.userId.trim() !== "";
}

function isOrgPrivileged(actor: WorkspaceActor): boolean {
  return actor.orgRole === "owner" || actor.orgRole === "admin";
}

/**
 * Workspace ACL: content vs membership management separated (W-005, W-008).
 * TEAM create is out of scope until product decides who may create TEAM (Phase 2 assumption).
 */
export class WorkspaceAccess {
  constructor(private readonly store: WorkspaceStore) {}

  /**
   * Effective Workspace role for content, or null if no content access.
   * Org Admin without membership/ownership → null (grant not modeled here).
   */
  async resolveContentRole(
    actor: WorkspaceActor,
    workspaceId: string,
  ): Promise<WorkspaceEffectiveRole | null> {
    if (!hasOrg(actor)) {
      return null;
    }

    const workspace = await this.store.findById(workspaceId);
    if (!workspace || workspace.organizationId !== actor.organizationId) {
      return null;
    }

    if (workspace.ownerUserId === actor.userId) {
      return "OWNER";
    }

    if (workspace.visibility === "PERSONAL") {
      return null;
    }

    const member = await this.store.findActiveMember(workspaceId, actor.userId);
    if (!member || member.status !== "ACTIVE") {
      return null;
    }

    return member.role;
  }

  async canReadContent(actor: WorkspaceActor, workspaceId: string): Promise<boolean> {
    return (await this.resolveContentRole(actor, workspaceId)) !== null;
  }

  async canMutateContent(actor: WorkspaceActor, workspaceId: string): Promise<boolean> {
    const role = await this.resolveContentRole(actor, workspaceId);
    return role === "OWNER" || role === "EDITOR";
  }

  /**
   * Member management: Workspace Owner **or** Org Owner/Admin in the same org.
   * Does **not** imply content read for Org Admin (W-008).
   */
  async canManageMembers(actor: WorkspaceActor, workspaceId: string): Promise<boolean> {
    if (!hasOrg(actor)) {
      return false;
    }

    const workspace = await this.store.findById(workspaceId);
    if (!workspace || workspace.organizationId !== actor.organizationId) {
      return false;
    }

    if (workspace.ownerUserId === actor.userId) {
      return true;
    }

    return isOrgPrivileged(actor);
  }

  /** Content read of one workspace → record or null (uniform NOT_FOUND). */
  async readForContent(actor: WorkspaceActor, workspaceId: string): Promise<WorkspaceRecord | null> {
    if (!(await this.canReadContent(actor, workspaceId))) {
      return null;
    }
    return this.store.findById(workspaceId);
  }

  /**
   * Metadata for member-management flows. Visible to Workspace Owner or Org Admin
   * even when they cannot read content.
   */
  async readForMemberManagement(
    actor: WorkspaceActor,
    workspaceId: string,
  ): Promise<WorkspaceRecord | null> {
    if (!(await this.canManageMembers(actor, workspaceId))) {
      return null;
    }
    return this.store.findById(workspaceId);
  }

  /** Workspaces the actor may read content in (not org-wide admin listing). */
  async listForContent(actor: WorkspaceActor): Promise<WorkspaceRecord[]> {
    if (!hasOrg(actor)) {
      return [];
    }

    const all = await this.store.listByOrganization(actor.organizationId);
    const visible: WorkspaceRecord[] = [];
    for (const workspace of all) {
      if (await this.canReadContent(actor, workspace.id)) {
        visible.push(workspace);
      }
    }
    return visible;
  }

  /**
   * Create PERSONAL workspace only (Phase 2 assumption: TEAM create deferred).
   * Stamps organizationId + ownerUserId from actor.
   */
  async createPersonal(
    actor: WorkspaceActor,
    input: WorkspaceCreatePersonalInput,
  ): Promise<WorkspaceRecord | null> {
    if (!hasOrg(actor)) {
      return null;
    }
    if (input.name.trim() === "") {
      return null;
    }

    return this.store.create(actor.organizationId, actor.userId, {
      name: input.name.trim(),
      description: input.description ?? null,
      clientId: input.clientId ?? null,
    });
  }

  /** Metadata update: Workspace OWNER only (not Org Admin content path). */
  async updateForOwner(
    actor: WorkspaceActor,
    workspaceId: string,
    input: WorkspaceUpdateInput,
  ): Promise<WorkspaceRecord | null> {
    const role = await this.resolveContentRole(actor, workspaceId);
    if (role !== "OWNER") {
      return null;
    }
    return this.store.update(workspaceId, input);
  }

  async listMembersForManager(
    actor: WorkspaceActor,
    workspaceId: string,
  ): Promise<WorkspaceMemberRecord[] | null> {
    if (!(await this.canManageMembers(actor, workspaceId))) {
      return null;
    }
    return this.store.listActiveMembers(workspaceId);
  }

  /**
   * Add or change EDITOR/VIEWER. Cannot target the Workspace owner as a member row.
   * Role escalation to OWNER via membership is denied.
   */
  async upsertMember(
    actor: WorkspaceActor,
    workspaceId: string,
    input: WorkspaceMemberUpsertInput,
  ): Promise<WorkspaceMemberRecord | null> {
    if (!(await this.canManageMembers(actor, workspaceId))) {
      return null;
    }

    if (input.role !== "EDITOR" && input.role !== "VIEWER") {
      return null;
    }

    const workspace = await this.store.findById(workspaceId);
    if (!workspace || workspace.organizationId !== actor.organizationId) {
      return null;
    }

    if (workspace.visibility !== "TEAM") {
      return null;
    }

    if (input.userId === workspace.ownerUserId) {
      return null;
    }

    if (input.userId.trim() === "") {
      return null;
    }

    return this.store.upsertMember(
      actor.organizationId,
      workspaceId,
      { userId: input.userId, role: input.role },
      actor.userId,
    );
  }

  async revokeMember(
    actor: WorkspaceActor,
    workspaceId: string,
    userId: string,
  ): Promise<WorkspaceMemberRecord | null> {
    if (!(await this.canManageMembers(actor, workspaceId))) {
      return null;
    }

    const workspace = await this.store.findById(workspaceId);
    if (!workspace || workspace.organizationId !== actor.organizationId) {
      return null;
    }

    if (userId === workspace.ownerUserId) {
      return null;
    }

    return this.store.revokeMember(workspaceId, userId);
  }

  /** List Matter links for content readers. */
  async listMatterLinks(
    actor: WorkspaceActor,
    workspaceId: string,
  ): Promise<WorkspaceMatterLink[] | null> {
    if (!(await this.canReadContent(actor, workspaceId))) {
      return null;
    }
    return this.store.listMatterLinks(workspaceId);
  }

  /**
   * Link Matter to Workspace. Caller must ensure Matter is same-org (service layer).
   * Requires content mutate (OWNER/EDITOR).
   */
  async linkMatter(
    actor: WorkspaceActor,
    workspaceId: string,
    matterId: string,
  ): Promise<WorkspaceMatterLink | null> {
    if (!(await this.canMutateContent(actor, workspaceId))) {
      return null;
    }
    const workspace = await this.store.findById(workspaceId);
    if (!workspace || workspace.organizationId !== actor.organizationId) {
      return null;
    }
    if (matterId.trim() === "") {
      return null;
    }
    return this.store.linkMatter(
      actor.organizationId,
      workspaceId,
      matterId,
      actor.userId,
    );
  }

  async unlinkMatter(
    actor: WorkspaceActor,
    workspaceId: string,
    matterId: string,
  ): Promise<boolean> {
    if (!(await this.canMutateContent(actor, workspaceId))) {
      return false;
    }
    return this.store.unlinkMatter(workspaceId, matterId);
  }
}
