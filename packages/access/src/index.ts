/**
 * Organization-scoped Client/Matter access policy (scaffold).
 * Isolation is by membership organization only — not full docs/07 ACL / Workspace.
 * Wrong org or missing id → null so HTTP can map to identical NOT_FOUND.
 */

export interface ClientRecord {
  id: string;
  organizationId: string;
  name: string;
  status: string;
}

export interface ClientCreateInput {
  name: string;
  status?: string;
}

export interface ClientUpdateInput {
  name?: string;
  status?: string;
}

/**
 * Persistence for Client. Callers must not trust client-supplied organizationId;
 * {@link ClientAccess} stamps and checks the actor org.
 */
export interface ClientStore {
  findById(id: string): Promise<ClientRecord | null>;
  listByOrganization(organizationId: string): Promise<ClientRecord[]>;
  create(organizationId: string, input: ClientCreateInput): Promise<ClientRecord>;
  update(id: string, input: ClientUpdateInput): Promise<ClientRecord | null>;
}

export interface MatterRecord {
  id: string;
  organizationId: string;
  title: string;
  clientId: string | null;
  workspaceId: string | null;
  status: string;
}

export interface MatterCreateInput {
  title: string;
  clientId?: string | null;
  workspaceId?: string | null;
  status?: string;
}

export interface MatterUpdateInput {
  title?: string;
  clientId?: string | null;
  workspaceId?: string | null;
  status?: string;
}

/**
 * Persistence for Matter. Organization isolation stays in {@link MatterAccess}.
 */
export interface MatterStore {
  findById(id: string): Promise<MatterRecord | null>;
  listByOrganization(organizationId: string): Promise<MatterRecord[]>;
  create(organizationId: string, input: MatterCreateInput): Promise<MatterRecord>;
  update(id: string, input: MatterUpdateInput): Promise<MatterRecord | null>;
}

function hasOrganization(actorOrganizationId: string): boolean {
  return actorOrganizationId.trim() !== "";
}

/**
 * Client CRUD gated by server-resolved organizationId (scaffold org-isolation).
 */
export class ClientAccess {
  constructor(private readonly store: ClientStore) {}

  async readForOrganization(
    actorOrganizationId: string,
    clientId: string,
  ): Promise<ClientRecord | null> {
    if (!hasOrganization(actorOrganizationId)) {
      return null;
    }

    const client = await this.store.findById(clientId);
    if (!client || client.organizationId !== actorOrganizationId) {
      return null;
    }

    return client;
  }

  async listForOrganization(actorOrganizationId: string): Promise<ClientRecord[]> {
    if (!hasOrganization(actorOrganizationId)) {
      return [];
    }

    return this.store.listByOrganization(actorOrganizationId);
  }

  async createForOrganization(
    actorOrganizationId: string,
    input: ClientCreateInput,
  ): Promise<ClientRecord | null> {
    if (!hasOrganization(actorOrganizationId)) {
      return null;
    }

    return this.store.create(actorOrganizationId, input);
  }

  async updateForOrganization(
    actorOrganizationId: string,
    clientId: string,
    input: ClientUpdateInput,
  ): Promise<ClientRecord | null> {
    const existing = await this.readForOrganization(actorOrganizationId, clientId);
    if (!existing) {
      return null;
    }

    return this.store.update(clientId, input);
  }
}

/**
 * Matter CRUD gated by server-resolved organizationId (scaffold org-isolation).
 * Does not validate Workspace existence (D-009 optional, no FK yet).
 */
export class MatterAccess {
  constructor(private readonly store: MatterStore) {}

  async readForOrganization(
    actorOrganizationId: string,
    matterId: string,
  ): Promise<MatterRecord | null> {
    if (!hasOrganization(actorOrganizationId)) {
      return null;
    }

    const matter = await this.store.findById(matterId);
    if (!matter || matter.organizationId !== actorOrganizationId) {
      return null;
    }

    return matter;
  }

  async listForOrganization(actorOrganizationId: string): Promise<MatterRecord[]> {
    if (!hasOrganization(actorOrganizationId)) {
      return [];
    }

    return this.store.listByOrganization(actorOrganizationId);
  }

  async createForOrganization(
    actorOrganizationId: string,
    input: MatterCreateInput,
  ): Promise<MatterRecord | null> {
    if (!hasOrganization(actorOrganizationId)) {
      return null;
    }

    return this.store.create(actorOrganizationId, input);
  }

  async updateForOrganization(
    actorOrganizationId: string,
    matterId: string,
    input: MatterUpdateInput,
  ): Promise<MatterRecord | null> {
    const existing = await this.readForOrganization(actorOrganizationId, matterId);
    if (!existing) {
      return null;
    }

    return this.store.update(matterId, input);
  }
}
