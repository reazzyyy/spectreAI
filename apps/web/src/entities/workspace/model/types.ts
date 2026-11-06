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
};

/** POST /workspaces — only PERSONAL accepted by API (S3). */
export type CreateWorkspaceInput = {
  name: string;
  description?: string | null;
  visibility?: "PERSONAL";
};

/** PATCH /workspaces/:id — at least one field required by API. */
export type UpdateWorkspaceInput = {
  name?: string;
  description?: string | null;
};

/** Matter link from GET/POST /workspaces/:id/matters. */
export type WorkspaceMatterLink = {
  matterId: string;
};

export type WorkspaceMatterListResponse = {
  items: WorkspaceMatterLink[];
};
