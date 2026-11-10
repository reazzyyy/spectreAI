import { describe, expect, it } from "vitest";
import {
  WorkspaceAccess,
  type WorkspaceActor,
  type WorkspaceMemberRecord,
  type WorkspaceRecord,
  type WorkspaceStore,
} from "./workspace.js";

const ORG_A = "00000000-0000-4000-8000-00000000000a";
const ORG_B = "00000000-0000-4000-8000-00000000000b";
const USER_OWNER = "00000000-0000-4000-8000-0000000000u1";
const USER_EDITOR = "00000000-0000-4000-8000-0000000000u2";
const USER_VIEWER = "00000000-0000-4000-8000-0000000000u3";
const USER_ORG_ADMIN = "00000000-0000-4000-8000-0000000000u4";
const USER_STRANGER = "00000000-0000-4000-8000-0000000000u5";

const NOW = new Date("2026-01-01T00:00:00.000Z");

const personalA: WorkspaceRecord = {
  id: "00000000-0000-4000-8000-0000000000w1",
  organizationId: ORG_A,
  ownerUserId: USER_OWNER,
  name: "personal-a",
  description: null,
  visibility: "PERSONAL",
  status: "ACTIVE",
  clientId: null,
  createdAt: NOW,
  updatedAt: NOW,
};

const teamA: WorkspaceRecord = {
  id: "00000000-0000-4000-8000-0000000000w2",
  organizationId: ORG_A,
  ownerUserId: USER_OWNER,
  name: "team-a",
  description: null,
  visibility: "TEAM",
  status: "ACTIVE",
  clientId: null,
  createdAt: NOW,
  updatedAt: NOW,
};

const teamB: WorkspaceRecord = {
  id: "00000000-0000-4000-8000-0000000000w3",
  organizationId: ORG_B,
  ownerUserId: USER_STRANGER,
  name: "team-b",
  description: null,
  visibility: "TEAM",
  status: "ACTIVE",
  clientId: null,
  createdAt: NOW,
  updatedAt: NOW,
};

function actor(
  userId: string,
  organizationId: string,
  orgRole: WorkspaceActor["orgRole"],
): WorkspaceActor {
  return { userId, organizationId, orgRole };
}

function memoryWorkspaceStore(
  workspaces: WorkspaceRecord[],
  members: WorkspaceMemberRecord[] = [],
): WorkspaceStore {
  const ws = new Map(workspaces.map((row) => [row.id, { ...row }]));
  const mem = new Map(members.map((row) => [`${row.workspaceId}:${row.userId}`, { ...row }]));

  return {
    async findById(id) {
      return ws.get(id) ?? null;
    },
    async listByOrganization(organizationId) {
      return [...ws.values()].filter((row) => row.organizationId === organizationId);
    },
    async listContentVisible(organizationId, userId, options) {
      const all = [...ws.values()].filter((row) => {
        if (row.organizationId !== organizationId) return false;
        if (row.ownerUserId === userId) return true;
        if (row.visibility === "PERSONAL") return false;
        const member = mem.get(`${row.id}:${userId}`);
        return member?.status === "ACTIVE";
      });
      const limit = options?.limit ?? 50;
      const items = all.slice(0, limit);
      return { items, nextCursor: null };
    },
    async create(organizationId, ownerUserId, input) {
      const created: WorkspaceRecord = {
        id: `ws-${ws.size + 1}`,
        organizationId,
        ownerUserId,
        name: input.name,
        description: input.description ?? null,
        visibility: input.visibility ?? "PERSONAL",
        status: "ACTIVE",
        clientId: input.clientId ?? null,
        createdAt: NOW,
        updatedAt: NOW,
      };
      ws.set(created.id, created);
      return created;
    },
    async update(id, input) {
      const existing = ws.get(id);
      if (!existing) return null;
      const updated: WorkspaceRecord = {
        ...existing,
        name: input.name ?? existing.name,
        description: input.description === undefined ? existing.description : input.description,
        clientId: input.clientId === undefined ? existing.clientId : input.clientId,
        status: input.status ?? existing.status,
      };
      ws.set(id, updated);
      return updated;
    },
    async findActiveMember(workspaceId, userId) {
      const row = mem.get(`${workspaceId}:${userId}`);
      if (!row || row.status !== "ACTIVE") return null;
      return row;
    },
    async listActiveMembers(workspaceId) {
      return [...mem.values()].filter(
        (row) => row.workspaceId === workspaceId && row.status === "ACTIVE",
      );
    },
    async upsertMember(organizationId, workspaceId, input, _addedBy) {
      const key = `${workspaceId}:${input.userId}`;
      const existing = mem.get(key);
      const row: WorkspaceMemberRecord = {
        id: existing?.id ?? `m-${mem.size + 1}`,
        organizationId,
        workspaceId,
        userId: input.userId,
        role: input.role,
        status: "ACTIVE",
      };
      mem.set(key, row);
      return row;
    },
    async revokeMember(workspaceId, userId) {
      const key = `${workspaceId}:${userId}`;
      const existing = mem.get(key);
      if (!existing) return null;
      const revoked = { ...existing, status: "REVOKED" as const };
      mem.set(key, revoked);
      return revoked;
    },
    async listMatterLinks(workspaceId) {
      return [];
    },
    async linkMatter(organizationId, workspaceId, matterId, _createdBy) {
      return { organizationId, workspaceId, matterId };
    },
    async unlinkMatter() {
      return true;
    },
  };
}

const seedMembers: WorkspaceMemberRecord[] = [
  {
    id: "m-editor",
    organizationId: ORG_A,
    workspaceId: teamA.id,
    userId: USER_EDITOR,
    role: "EDITOR",
    status: "ACTIVE",
  },
  {
    id: "m-viewer",
    organizationId: ORG_A,
    workspaceId: teamA.id,
    userId: USER_VIEWER,
    role: "VIEWER",
    status: "ACTIVE",
  },
];

describe("WorkspaceAccess content", () => {
  const access = new WorkspaceAccess(
    memoryWorkspaceStore([personalA, teamA, teamB], seedMembers),
  );

  it("PERSONAL: only owner reads content", async () => {
    await expect(
      access.readForContent(actor(USER_OWNER, ORG_A, "member"), personalA.id),
    ).resolves.toEqual(personalA);

    await expect(
      access.readForContent(actor(USER_EDITOR, ORG_A, "member"), personalA.id),
    ).resolves.toBeNull();

    await expect(
      access.readForContent(actor(USER_ORG_ADMIN, ORG_A, "admin"), personalA.id),
    ).resolves.toBeNull();
  });

  it("TEAM: owner and active members read; org member without membership does not", async () => {
    await expect(
      access.resolveContentRole(actor(USER_OWNER, ORG_A, "member"), teamA.id),
    ).resolves.toBe("OWNER");
    await expect(
      access.resolveContentRole(actor(USER_EDITOR, ORG_A, "member"), teamA.id),
    ).resolves.toBe("EDITOR");
    await expect(
      access.resolveContentRole(actor(USER_VIEWER, ORG_A, "member"), teamA.id),
    ).resolves.toBe("VIEWER");
    await expect(
      access.readForContent(actor(USER_STRANGER, ORG_A, "member"), teamA.id),
    ).resolves.toBeNull();
  });

  it("cross-org workspace id yields null (no leak)", async () => {
    await expect(
      access.readForContent(actor(USER_OWNER, ORG_A, "member"), teamB.id),
    ).resolves.toBeNull();
  });

  it("Org Admin does not get content read", async () => {
    await expect(
      access.canReadContent(actor(USER_ORG_ADMIN, ORG_A, "admin"), teamA.id),
    ).resolves.toBe(false);
  });

  it("VIEWER cannot mutate content; EDITOR and OWNER can", async () => {
    await expect(
      access.canMutateContent(actor(USER_VIEWER, ORG_A, "member"), teamA.id),
    ).resolves.toBe(false);
    await expect(
      access.canMutateContent(actor(USER_EDITOR, ORG_A, "member"), teamA.id),
    ).resolves.toBe(true);
    await expect(
      access.canMutateContent(actor(USER_OWNER, ORG_A, "member"), teamA.id),
    ).resolves.toBe(true);
  });

  it("listForContent returns only accessible workspaces", async () => {
    const listed = await access.listForContent(actor(USER_EDITOR, ORG_A, "member"));
    expect(listed.items.map((w) => w.id)).toEqual([teamA.id]);
  });
});

describe("WorkspaceAccess member management", () => {
  it("Workspace Owner and Org Admin can manage members without content for admin", async () => {
    const access = new WorkspaceAccess(
      memoryWorkspaceStore([personalA, teamA], seedMembers),
    );

    await expect(
      access.canManageMembers(actor(USER_OWNER, ORG_A, "member"), teamA.id),
    ).resolves.toBe(true);
    await expect(
      access.canManageMembers(actor(USER_ORG_ADMIN, ORG_A, "admin"), teamA.id),
    ).resolves.toBe(true);
    await expect(
      access.readForMemberManagement(actor(USER_ORG_ADMIN, ORG_A, "admin"), teamA.id),
    ).resolves.toEqual(teamA);
    await expect(
      access.canReadContent(actor(USER_ORG_ADMIN, ORG_A, "admin"), teamA.id),
    ).resolves.toBe(false);

    await expect(
      access.canManageMembers(actor(USER_EDITOR, ORG_A, "member"), teamA.id),
    ).resolves.toBe(false);
  });

  it("denies upserting owner as member and refuses PERSONAL membership", async () => {
    const access = new WorkspaceAccess(
      memoryWorkspaceStore([personalA, teamA], seedMembers),
    );

    await expect(
      access.upsertMember(actor(USER_OWNER, ORG_A, "member"), teamA.id, {
        userId: USER_OWNER,
        role: "EDITOR",
      }),
    ).resolves.toBeNull();

    await expect(
      access.upsertMember(actor(USER_OWNER, ORG_A, "member"), personalA.id, {
        userId: USER_EDITOR,
        role: "EDITOR",
      }),
    ).resolves.toBeNull();
  });

  it("Org Admin can upsert/revoke members; EDITOR cannot escalate via upsert", async () => {
    const access = new WorkspaceAccess(
      memoryWorkspaceStore([teamA], [...seedMembers]),
    );

    const added = await access.upsertMember(
      actor(USER_ORG_ADMIN, ORG_A, "admin"),
      teamA.id,
      { userId: USER_STRANGER, role: "VIEWER" },
    );
    expect(added).toMatchObject({
      userId: USER_STRANGER,
      role: "VIEWER",
      status: "ACTIVE",
    });

    await expect(
      access.upsertMember(actor(USER_EDITOR, ORG_A, "member"), teamA.id, {
        userId: USER_STRANGER,
        role: "EDITOR",
      }),
    ).resolves.toBeNull();

    const revoked = await access.revokeMember(
      actor(USER_ORG_ADMIN, ORG_A, "admin"),
      teamA.id,
      USER_STRANGER,
    );
    expect(revoked?.status).toBe("REVOKED");
  });
});

describe("WorkspaceAccess createPersonal", () => {
  it("stamps org and owner from actor; refuses empty org", async () => {
    const access = new WorkspaceAccess(memoryWorkspaceStore([]));

    await expect(
      access.createPersonal(actor(USER_OWNER, "  ", "member"), { name: "x" }),
    ).resolves.toBeNull();

    const created = await access.createPersonal(actor(USER_OWNER, ORG_A, "member"), {
      name: " Mine ",
    });
    expect(created).toMatchObject({
      organizationId: ORG_A,
      ownerUserId: USER_OWNER,
      name: "Mine",
      visibility: "PERSONAL",
      status: "ACTIVE",
    });

    const team = await access.createPersonal(actor(USER_OWNER, ORG_A, "member"), {
      name: "Squad",
      visibility: "TEAM",
    });
    expect(team).toMatchObject({
      name: "Squad",
      visibility: "TEAM",
      ownerUserId: USER_OWNER,
    });
  });

  it("updateForOwner refuses non-owners", async () => {
    const access = new WorkspaceAccess(memoryWorkspaceStore([personalA]));
    await expect(
      access.updateForOwner(actor(USER_EDITOR, ORG_A, "member"), personalA.id, {
        name: "hack",
      }),
    ).resolves.toBeNull();

    await expect(
      access.updateForOwner(actor(USER_OWNER, ORG_A, "member"), personalA.id, {
        name: "Renamed",
      }),
    ).resolves.toMatchObject({ name: "Renamed" });
  });
});
