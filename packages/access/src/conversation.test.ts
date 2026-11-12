import { describe, expect, it } from "vitest";
import {
  ConversationAccess,
  type ConversationCreateInput,
  type ConversationListPage,
  type ConversationRecord,
  type ConversationStore,
} from "./conversation.js";
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
const USER_OUTSIDER = "00000000-0000-4000-8000-0000000000u5";

const NOW = new Date("2026-01-01T00:00:00.000Z");

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
  ownerUserId: USER_OUTSIDER,
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
  const mem = new Map(
    members.map((row) => [`${row.workspaceId}:${row.userId}`, { ...row }]),
  );

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
      return { items: all.slice(0, limit), nextCursor: null };
    },
    async create() {
      throw new Error("unused");
    },
    async update() {
      return null;
    },
    async findActiveMember(workspaceId, userId) {
      return mem.get(`${workspaceId}:${userId}`) ?? null;
    },
    async listActiveMembers(workspaceId) {
      return [...mem.values()].filter(
        (row) => row.workspaceId === workspaceId && row.status === "ACTIVE",
      );
    },
    async upsertMember() {
      return null;
    },
    async revokeMember() {
      return null;
    },
    async listMatterLinks() {
      return [];
    },
    async linkMatter() {
      return null;
    },
    async unlinkMatter() {
      return false;
    },
  };
}

function conversation(
  partial: Partial<ConversationRecord> &
    Pick<ConversationRecord, "id" | "visibility" | "ownerUserId">,
): ConversationRecord {
  return {
    organizationId: ORG_A,
    workspaceId: teamA.id,
    createdByUserId: partial.ownerUserId,
    title: null,
    status: "ACTIVE",
    lastMessageAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...partial,
  };
}

class MemoryConversationStore implements ConversationStore {
  readonly rows = new Map<string, ConversationRecord>();

  async findById(id: string): Promise<ConversationRecord | null> {
    return this.rows.get(id) ?? null;
  }

  async listByWorkspace(
    organizationId: string,
    workspaceId: string,
  ): Promise<ConversationListPage> {
    const items = [...this.rows.values()].filter(
      (row) =>
        row.organizationId === organizationId && row.workspaceId === workspaceId,
    );
    return { items, nextCursor: null };
  }

  async create(
    organizationId: string,
    workspaceId: string,
    ownerUserId: string,
    createdByUserId: string,
    input: ConversationCreateInput,
  ): Promise<ConversationRecord> {
    const record = conversation({
      id: `conv-${this.rows.size + 1}`,
      organizationId,
      workspaceId,
      ownerUserId,
      createdByUserId,
      visibility: input.visibility,
      title: input.title ?? null,
    });
    this.rows.set(record.id, record);
    return record;
  }
}

function accessWithTeam(): {
  access: ConversationAccess;
  store: MemoryConversationStore;
} {
  const members: WorkspaceMemberRecord[] = [
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
  const workspaces = new WorkspaceAccess(
    memoryWorkspaceStore([teamA, teamB], members),
  );
  const store = new MemoryConversationStore();
  return { access: new ConversationAccess(store, workspaces), store };
}

describe("ConversationAccess", () => {
  it("PRIVATE is readable only by owner with workspace access", async () => {
    const { access, store } = accessWithTeam();
    const privateChat = conversation({
      id: "c-private",
      visibility: "PRIVATE",
      ownerUserId: USER_OWNER,
    });
    store.rows.set(privateChat.id, privateChat);

    expect(await access.read(actor(USER_OWNER, ORG_A, "member"), privateChat.id)).toEqual(
      privateChat,
    );
    expect(await access.read(actor(USER_EDITOR, ORG_A, "member"), privateChat.id)).toBeNull();
    expect(await access.read(actor(USER_VIEWER, ORG_A, "member"), privateChat.id)).toBeNull();
    expect(
      await access.read(actor(USER_ORG_ADMIN, ORG_A, "admin"), privateChat.id),
    ).toBeNull();
  });

  it("WORKSPACE is readable by active content members; Org Admin without membership is not", async () => {
    const { access, store } = accessWithTeam();
    const shared = conversation({
      id: "c-ws",
      visibility: "WORKSPACE",
      ownerUserId: USER_OWNER,
    });
    store.rows.set(shared.id, shared);

    expect(await access.canRead(actor(USER_OWNER, ORG_A, "member"), shared.id)).toBe(true);
    expect(await access.canRead(actor(USER_EDITOR, ORG_A, "member"), shared.id)).toBe(true);
    expect(await access.canRead(actor(USER_VIEWER, ORG_A, "member"), shared.id)).toBe(true);
    expect(await access.canRead(actor(USER_ORG_ADMIN, ORG_A, "admin"), shared.id)).toBe(
      false,
    );
    expect(await access.canRead(actor(USER_OUTSIDER, ORG_A, "member"), shared.id)).toBe(
      false,
    );
  });

  it("hides foreign-org conversations even when id is known", async () => {
    const { access, store } = accessWithTeam();
    const foreign = conversation({
      id: "c-foreign",
      organizationId: ORG_B,
      workspaceId: teamB.id,
      visibility: "WORKSPACE",
      ownerUserId: USER_OUTSIDER,
    });
    store.rows.set(foreign.id, foreign);

    expect(await access.read(actor(USER_OWNER, ORG_A, "owner"), foreign.id)).toBeNull();
  });

  it("VIEWER can read WORKSPACE but cannot mutate or create", async () => {
    const { access, store } = accessWithTeam();
    const shared = conversation({
      id: "c-ws",
      visibility: "WORKSPACE",
      ownerUserId: USER_OWNER,
    });
    store.rows.set(shared.id, shared);

    expect(await access.canMutate(actor(USER_VIEWER, ORG_A, "member"), shared.id)).toBe(
      false,
    );
    expect(
      await access.create(actor(USER_VIEWER, ORG_A, "member"), teamA.id, {
        visibility: "WORKSPACE",
      }),
    ).toBeNull();
  });

  it("EDITOR can create WORKSPACE and mutate shared chats; cannot read others PRIVATE", async () => {
    const { access, store } = accessWithTeam();
    const created = await access.create(
      actor(USER_EDITOR, ORG_A, "member"),
      teamA.id,
      { visibility: "PRIVATE", title: "mine" },
    );
    expect(created).toMatchObject({
      organizationId: ORG_A,
      workspaceId: teamA.id,
      ownerUserId: USER_EDITOR,
      createdByUserId: USER_EDITOR,
      visibility: "PRIVATE",
      title: "mine",
    });

    const ownersPrivate = conversation({
      id: "c-owner-private",
      visibility: "PRIVATE",
      ownerUserId: USER_OWNER,
    });
    store.rows.set(ownersPrivate.id, ownersPrivate);
    expect(
      await access.read(actor(USER_EDITOR, ORG_A, "member"), ownersPrivate.id),
    ).toBeNull();

    const shared = conversation({
      id: "c-shared",
      visibility: "WORKSPACE",
      ownerUserId: USER_OWNER,
    });
    store.rows.set(shared.id, shared);
    expect(await access.canMutate(actor(USER_EDITOR, ORG_A, "member"), shared.id)).toBe(
      true,
    );
  });

  it("listForWorkspace filters PRIVATE to owner and keeps WORKSPACE for members", async () => {
    const { access, store } = accessWithTeam();
    store.rows.set(
      "c1",
      conversation({ id: "c1", visibility: "PRIVATE", ownerUserId: USER_OWNER }),
    );
    store.rows.set(
      "c2",
      conversation({ id: "c2", visibility: "PRIVATE", ownerUserId: USER_EDITOR }),
    );
    store.rows.set(
      "c3",
      conversation({ id: "c3", visibility: "WORKSPACE", ownerUserId: USER_OWNER }),
    );

    const forOwner = await access.listForWorkspace(
      actor(USER_OWNER, ORG_A, "member"),
      teamA.id,
    );
    expect(forOwner.items.map((row) => row.id).sort()).toEqual(["c1", "c3"]);

    const forEditor = await access.listForWorkspace(
      actor(USER_EDITOR, ORG_A, "member"),
      teamA.id,
    );
    expect(forEditor.items.map((row) => row.id).sort()).toEqual(["c2", "c3"]);

    const forAdmin = await access.listForWorkspace(
      actor(USER_ORG_ADMIN, ORG_A, "admin"),
      teamA.id,
    );
    expect(forAdmin.items).toEqual([]);
  });
});
