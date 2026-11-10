/** Workspace row from GET/POST /workspaces (scaffold subset). */
export type WorkspaceVisibility = "PERSONAL" | "TEAM";
export type WorkspaceStatus = "ACTIVE" | "ARCHIVED" | "PENDING_DELETION";

export type Workspace = {
  id: string;
  organizationId: string;
  ownerUserId: string;
  name: string;
  description: string | null;
  visibility: WorkspaceVisibility;
  status: WorkspaceStatus;
  clientId: string | null;
};

export type WorkspaceListResponse = {
  items: Workspace[];
  /** Opaque cursor (D-026); null when no further page. */
  nextCursor?: string | null;
};

/** POST /workspaces — PERSONAL (default) or TEAM (W-002). */
export type CreateWorkspaceInput = {
  name: string;
  description?: string | null;
  visibility?: WorkspaceVisibility;
  clientId?: string | null;
};

export type WorkspaceMemberRole = "EDITOR" | "VIEWER";
export type WorkspaceMemberStatus = "ACTIVE" | "REVOKED";

export type WorkspaceMember = {
  id: string;
  organizationId: string;
  workspaceId: string;
  userId: string;
  role: WorkspaceMemberRole;
  status: WorkspaceMemberStatus;
};

export type WorkspaceMemberListResponse = {
  items: WorkspaceMember[];
};

export type UpsertWorkspaceMemberInput = {
  userId: string;
  role: WorkspaceMemberRole;
};

/** PATCH /workspaces/:id — at least one field required by API. */
export type UpdateWorkspaceInput = {
  name?: string;
  description?: string | null;
  clientId?: string | null;
};

/** Matter link from GET/POST /workspaces/:id/matters. */
export type WorkspaceMatterLink = {
  matterId: string;
};

export type WorkspaceMatterListResponse = {
  items: WorkspaceMatterLink[];
};
