/** Matter row from GET/POST/PATCH /matters (scaffold subset). */
export type Matter = {
  id: string;
  organizationId: string;
  title: string;
  clientId: string | null;
  workspaceId: string | null;
  status: string;
};

export type MatterListResponse = {
  items: Matter[];
};

/** POST /matters — title required; client/workspace optional (omit in F5d UI). */
export type CreateMatterInput = {
  title: string;
  status?: "active" | "archived";
  clientId?: string | null;
  workspaceId?: string | null;
};

/** PATCH /matters/:id — at least one field. */
export type UpdateMatterInput = {
  title?: string;
  status?: "active" | "archived";
  clientId?: string | null;
  workspaceId?: string | null;
};
