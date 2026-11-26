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
    const existing = this.rows.get(id);
    if (!existing || existing.status !== "uploading") {
      return false;
    }
    return this.rows.delete(id);
  }

  async markDeletionPending(
    id: string,
    _confirmation: Parameters<DocumentStore["markDeletionPending"]>[1],
  ): Promise<DocumentRecord | null> {
    const existing = this.rows.get(id);
    if (!existing || existing.status === "uploading") {
      return null;
    }
    const updated = {
      ...existing,
      status: "deletion_pending" as const,
      storageKey: "",
      updatedAt: new Date(),
    };
    this.rows.set(id, updated);
    return updated;
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

  it("hard-deletes only an uploading document", async () => {
    const store = new MemoryStore();
    const access = new DocumentAccess(store);
    const uploading = await access.createForWorkspace("org-a", "ws-1", {
      title: "partial",
      originalFileName: "a.txt",
      mimeType: "text/plain",
      byteSize: 1,
      checksumSha256: "x",
      storageKey: "blob-uploading",
      uploadedByUserId: "u",
      status: "uploading",
    });
    const ready = await access.createForWorkspace("org-a", "ws-1", {
      title: "done",
      originalFileName: "b.txt",
      mimeType: "text/plain",
      byteSize: 1,
      checksumSha256: "y",
      storageKey: "blob-ready",
      uploadedByUserId: "u",
      status: "ready",
    });
    expect(await access.deleteForOrganization("org-a", uploading!.id)).toBe(true);
    expect(await access.deleteForOrganization("org-a", ready!.id)).toBe(false);
    expect(store.rows.has(uploading!.id)).toBe(false);
    expect(await access.readForOrganization("org-a", ready!.id)).toMatchObject({
      status: "ready",
      storageKey: "blob-ready",
    });
  });

  it("refuses a ready deletion without an independent confirmer", async () => {
    const store = new MemoryStore();
    const access = new DocumentAccess(store);
    const ready = await access.createForWorkspace("org-a", "ws-1", {
      title: "done",
      originalFileName: "b.txt",
      mimeType: "text/plain",
      byteSize: 1,
      checksumSha256: "y",
      storageKey: "blob-ready",
      uploadedByUserId: "owner",
      status: "ready",
    });
    await expect(
      access.requestDeletion("org-a", ready!.id, "owner", null),
    ).rejects.toThrow(/DELETION_CONFIRMATION_REQUIRED/);
    await expect(
      access.requestDeletion("org-a", ready!.id, "owner", "owner"),
    ).rejects.toThrow(/DELETION_CONFIRMATION_REQUIRED/);
    expect(await access.readForOrganization("org-a", ready!.id)).toMatchObject({
      storageKey: "blob-ready",
    });
  });

  it("hides a confirmed document immediately and is idempotent", async () => {
    const store = new MemoryStore();
    const access = new DocumentAccess(store);
    const ready = await access.createForWorkspace("org-a", "ws-1", {
      title: "done",
      originalFileName: "b.txt",
      mimeType: "text/plain",
      byteSize: 1,
      checksumSha256: "y",
      storageKey: "blob-ready",
      uploadedByUserId: "owner",
      status: "processing",
    });
    const requestedAt = new Date("2026-11-26T12:00:00.000Z");
    expect(
      await access.requestDeletion("org-a", ready!.id, "owner", "confirmer", requestedAt),
    ).toEqual({ outcome: "pending" });
    expect(await access.readForOrganization("org-a", ready!.id)).toBeNull();
    expect((await access.listForWorkspace("org-a", "ws-1")).items).toEqual([]);
    expect(store.rows.get(ready!.id)?.storageKey).toBe("");
    expect(
      await access.requestDeletion("org-a", ready!.id, "owner", null, requestedAt),
    ).toEqual({ outcome: "already_pending" });
  });
});
