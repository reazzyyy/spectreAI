import { describe, expect, it } from "vitest";
import {
  ClientAccess,
  MatterAccess,
  type ClientRecord,
  type ClientStore,
  type MatterRecord,
  type MatterStore,
} from "./index.js";

const ORG_A = "00000000-0000-4000-8000-00000000000a";
const ORG_B = "00000000-0000-4000-8000-00000000000b";

const clientA: ClientRecord = {
  id: "00000000-0000-4000-8000-0000000000c1",
  organizationId: ORG_A,
  name: "synthetic-client-a",
  status: "active",
};

const clientB: ClientRecord = {
  id: "00000000-0000-4000-8000-0000000000c2",
  organizationId: ORG_B,
  name: "synthetic-client-b",
  status: "active",
};

const matterA: MatterRecord = {
  id: "00000000-0000-4000-8000-0000000000a1",
  organizationId: ORG_A,
  title: "synthetic-matter-a",
  clientId: null,
  workspaceId: null,
  status: "active",
};

const matterB: MatterRecord = {
  id: "00000000-0000-4000-8000-0000000000b1",
  organizationId: ORG_B,
  title: "synthetic-matter-b",
  clientId: null,
  workspaceId: null,
  status: "active",
};

function memoryClientStore(...seed: ClientRecord[]): ClientStore {
  const rows = new Map(seed.map((row) => [row.id, { ...row }]));
  return {
    async findById(id) {
      return rows.get(id) ?? null;
    },
    async listByOrganization(organizationId) {
      return [...rows.values()].filter((row) => row.organizationId === organizationId);
    },
    async create(organizationId, input) {
      const created: ClientRecord = {
        id: `created-${rows.size + 1}`,
        organizationId,
        name: input.name,
        status: input.status ?? "active",
      };
      rows.set(created.id, created);
      return created;
    },
    async update(id, input) {
      const existing = rows.get(id);
      if (!existing) {
        return null;
      }
      const updated: ClientRecord = {
        ...existing,
        name: input.name ?? existing.name,
        status: input.status ?? existing.status,
      };
      rows.set(id, updated);
      return updated;
    },
  };
}

function memoryMatterStore(...seed: MatterRecord[]): MatterStore {
  const rows = new Map(seed.map((row) => [row.id, { ...row }]));
  return {
    async findById(id) {
      return rows.get(id) ?? null;
    },
    async listByOrganization(organizationId) {
      return [...rows.values()].filter((row) => row.organizationId === organizationId);
    },
    async create(organizationId, input) {
      const created: MatterRecord = {
        id: `created-${rows.size + 1}`,
        organizationId,
        title: input.title,
        clientId: input.clientId ?? null,
        workspaceId: input.workspaceId ?? null,
        status: input.status ?? "active",
      };
      rows.set(created.id, created);
      return created;
    },
    async update(id, input) {
      const existing = rows.get(id);
      if (!existing) {
        return null;
      }
      const updated: MatterRecord = {
        ...existing,
        title: input.title ?? existing.title,
        clientId: input.clientId === undefined ? existing.clientId : input.clientId,
        workspaceId:
          input.workspaceId === undefined ? existing.workspaceId : input.workspaceId,
        status: input.status ?? existing.status,
      };
      rows.set(id, updated);
      return updated;
    },
  };
}

describe("ClientAccess", () => {
  it("reads and lists only the actor organization", async () => {
    const access = new ClientAccess(memoryClientStore(clientA, clientB));

    await expect(access.readForOrganization(ORG_A, clientA.id)).resolves.toEqual(clientA);
    await expect(access.readForOrganization(ORG_A, clientB.id)).resolves.toBeNull();
    await expect(access.listForOrganization(ORG_A)).resolves.toEqual([clientA]);
    await expect(access.listForOrganization("  ")).resolves.toEqual([]);
  });

  it("creates under the actor organization and refuses empty actor org", async () => {
    const access = new ClientAccess(memoryClientStore());

    await expect(access.createForOrganization("  ", { name: "x" })).resolves.toBeNull();

    const created = await access.createForOrganization(ORG_A, { name: "Acme" });
    expect(created).toMatchObject({
      organizationId: ORG_A,
      name: "Acme",
      status: "active",
    });
  });

  it("updates only clients in the actor organization", async () => {
    const access = new ClientAccess(memoryClientStore(clientA, clientB));

    await expect(
      access.updateForOrganization(ORG_A, clientB.id, { name: "leak" }),
    ).resolves.toBeNull();

    await expect(
      access.updateForOrganization(ORG_A, clientA.id, { name: "Renamed", status: "archived" }),
    ).resolves.toEqual({
      ...clientA,
      name: "Renamed",
      status: "archived",
    });
  });
});

describe("MatterAccess", () => {
  it("returns a matter that belongs to the actor organization", async () => {
    const access = new MatterAccess(memoryMatterStore(matterA, matterB));
    await expect(access.readForOrganization(ORG_A, matterA.id)).resolves.toEqual(matterA);
  });

  it("hides a matter that belongs to another organization", async () => {
    const access = new MatterAccess(memoryMatterStore(matterA, matterB));
    await expect(access.readForOrganization(ORG_A, matterB.id)).resolves.toBeNull();
  });

  it("hides an unknown matter", async () => {
    const access = new MatterAccess(memoryMatterStore(matterA, matterB));
    await expect(
      access.readForOrganization(ORG_A, "00000000-0000-4000-8000-000000000099"),
    ).resolves.toBeNull();
  });

  it("refuses a read when the server did not resolve an organization", async () => {
    const access = new MatterAccess(memoryMatterStore(matterA, matterB));
    await expect(access.readForOrganization("  ", matterA.id)).resolves.toBeNull();
  });

  it("lists only matters for the actor organization", async () => {
    const access = new MatterAccess(memoryMatterStore(matterA, matterB));
    await expect(access.listForOrganization(ORG_A)).resolves.toEqual([matterA]);
  });

  it("creates under the actor organization", async () => {
    const access = new MatterAccess(memoryMatterStore());
    const created = await access.createForOrganization(ORG_A, {
      title: "New matter",
      clientId: clientA.id,
    });
    expect(created).toMatchObject({
      organizationId: ORG_A,
      title: "New matter",
      clientId: clientA.id,
      status: "active",
    });
  });

  it("updates only matters in the actor organization", async () => {
    const access = new MatterAccess(memoryMatterStore(matterA, matterB));

    await expect(
      access.updateForOrganization(ORG_A, matterB.id, { title: "leak" }),
    ).resolves.toBeNull();

    await expect(
      access.updateForOrganization(ORG_A, matterA.id, {
        title: "Renamed matter",
        status: "archived",
      }),
    ).resolves.toEqual({
      ...matterA,
      title: "Renamed matter",
      status: "archived",
    });
  });
});
