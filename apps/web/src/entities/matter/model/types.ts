/** Matter row from GET /matters (scaffold subset). */
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
