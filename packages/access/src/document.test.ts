import { describe, expect, it } from "vitest";
import {
  DocumentAccess,
  type DocumentListPage,
  type DocumentRecord,
  type DocumentStore,
} from "./document.js";

function doc(partial: Partial<DocumentRecord> & Pick<DocumentRecord, "id" | "organizationId">): DocumentRecord {
  return {
    workspaceId: "ws-1",
    title: "t",
    status: "uploaded",
    originalFileName: "a.txt",
    mimeType: "text/plain",
    byteSize: 1,
    checksumSha256: "abc",
    storageKey: "k",
    uploadedByUserId: "u1",
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...partial,
  };
}

class MemoryStore implements DocumentStore {
  readonly rows = new Map<string, DocumentRecord>();

  async findById(id: string): Promise<DocumentRecord | null> {
    return this.rows.get(id) ?? null;
  }

  async listByWorkspace(
    organizationId: string,
    workspaceId: string,
  ): Promise<DocumentListPage> {
    const items = [...this.rows.values()].filter(
      (row) =>
        row.organizationId === organizationId && row.workspaceId === workspaceId,
    );
    return { items, nextCursor: null };
  }

  async create(
    organizationId: string,
    workspaceId: string,
    input: Parameters<DocumentStore["create"]>[2],
  ): Promise<DocumentRecord> {
    const record = doc({
      id: `doc-${this.rows.size + 1}`,
      organizationId,
      workspaceId,
      ...input,
      status: input.status ?? "uploaded",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    this.rows.set(record.id, record);
    return record;
  }

  async updateStatus(
    id: string,
    status: DocumentRecord["status"],
  ): Promise<DocumentRecord | null> {
    const existing = this.rows.get(id);
    if (!existing) return null;
    const updated = { ...existing, status, updatedAt: new Date() };
    this.rows.set(id, updated);
    return updated;
  }

  async deleteById(id: string): Promise<boolean> {
    return this.rows.delete(id);
  }
}

describe("DocumentAccess", () => {
  it("hides foreign-org documents as null", async () => {
    const store = new MemoryStore();
    await store.create("org-a", "ws-1", {
      title: "a",
      originalFileName: "a.txt",
      mimeType: "text/plain",
      byteSize: 1,
      checksumSha256: "x",
      storageKey: "k",
      uploadedByUserId: "u",
    });
    const access = new DocumentAccess(store);
    const created = [...store.rows.values()][0]!;
    expect(await access.readForOrganization("org-b", created.id)).toBeNull();
    expect(await access.readForOrganization("org-a", created.id)).toEqual(created);
  });

  it("lists only the requested workspace in the actor org", async () => {
    const store = new MemoryStore();
    const access = new DocumentAccess(store);
    await access.createForWorkspace("org-a", "ws-1", {
      title: "one",
      originalFileName: "a.txt",
      mimeType: "text/plain",
      byteSize: 1,
      checksumSha256: "x",
      storageKey: "k1",
      uploadedByUserId: "u",
    });
    await access.createForWorkspace("org-a", "ws-2", {
      title: "two",
      originalFileName: "b.txt",
      mimeType: "text/plain",
      byteSize: 1,
      checksumSha256: "y",
      storageKey: "k2",
      uploadedByUserId: "u",
    });
    const listed = await access.listForWorkspace("org-a", "ws-1");
    expect(listed.items.map((row) => row.title)).toEqual(["one"]);
  });
});
