export interface MatterRecord {
  id: string;
  organizationId: string;
  title: string;
  clientId: string | null;
  workspaceId: string | null;
}

export interface MatterStore {
  findById(id: string): Promise<MatterRecord | null>;
}

/**
 * Reads a matter only when it belongs to the server-resolved organization.
 * A mismatched or missing organization yields null so callers can respond
 * as not found without revealing the other organization's record.
 */
export class MatterAccess {
  constructor(private readonly store: MatterStore) {}

  async readForOrganization(
    actorOrganizationId: string,
    matterId: string,
  ): Promise<MatterRecord | null> {
    if (actorOrganizationId.trim() === "") {
      return null;
    }

    const matter = await this.store.findById(matterId);
    if (!matter || matter.organizationId !== actorOrganizationId) {
      return null;
    }

    return matter;
  }
}
