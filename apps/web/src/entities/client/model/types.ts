/** Client row from GET/POST/PATCH /clients (scaffold subset). */
export type Client = {
  id: string;
  organizationId: string;
  name: string;
  status: string;
};

export type ClientListResponse = {
  items: Client[];
};

export type CreateClientInput = {
  name: string;
  status?: "active" | "archived";
};

export type UpdateClientInput = {
  name?: string;
  status?: "active" | "archived";
};
