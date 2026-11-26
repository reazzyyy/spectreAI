import { randomUUID } from "node:crypto";
import { DocumentAccess, DELETION_PURGE_DELAY_MS } from "@spectre/access";
import { createPrismaClient, withActorContext } from "@spectre/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaDocumentStore } from "../src/documents/prisma-document-store.js";
import { purgeDueDocumentDeletions } from "../src/documents/purge-deletions.js";

describe("document deletion lifecycle", () => {
  const migrator = createPrismaClient({ purpose: "migrator" });
  const runtime = createPrismaClient({ purpose: "runtime" });
  const orgId = randomUUID();
  const userId = randomUUID();
  const confirmerId = randomUUID();
  const workspaceId = randomUUID();
  const documentId = randomUUID();
  const versionId = randomUUID();
  const keptId = randomUUID();
  const storageKey = `org/${orgId}/doc/${documentId}`;
  const requestedAt = new Date("2026-11-26T12:00:00.000Z");

  beforeAll(async () => {
    await migrator.organization.create({
      data: { id: orgId, name: `del-${orgId.slice(0, 8)}` },
    });
    await migrator.user.createMany({
      data: [
        { id: userId, email: `del-${userId}@example.com`, passwordHash: "x" },
        { id: confirmerId, email: `conf-${confirmerId}@example.com`, passwordHash: "x" },
      ],
    });
    await migrator.workspace.create({
      data: {
        id: workspaceId,
        organizationId: orgId,
        ownerUserId: userId,
        name: "deletion",
        visibility: "PERSONAL",
      },
    });
    await migrator.document.create({
      data: {
        id: documentId,
        organizationId: orgId,
        workspaceId,
        title: "brief",
        status: "ready",
        originalFileName: "brief.txt",
        mimeType: "text/plain",
        byteSize: 4,
        checksumSha256: "abc",
        storageKey,
        uploadedByUserId: userId,
      },
    });
    await migrator.documentVersion.create({
      data: {
        id: versionId,
        organizationId: orgId,
        documentId,
        versionNumber: 1,
        originalFileName: "brief.txt",
        mimeType: "text/plain",
        byteSize: 4,
        checksumSha256: "abc",
        storageKey,
        uploadedByUserId: userId,
      },
    });
    await migrator.document.update({
      where: { id: documentId },
      data: { currentVersionId: versionId, status: "ready" },
    });
    await migrator.document.create({
      data: {
        id: keptId,
        organizationId: orgId,
        workspaceId,
        title: "keep",
        status: "ready",
        originalFileName: "keep.txt",
        mimeType: "text/plain",
        byteSize: 1,
        checksumSha256: "def",
        storageKey: "keep-key",
        uploadedByUserId: userId,
      },
    });
  }, 30_000);

  afterAll(async () => {
    await migrator.deletionJournal.deleteMany({ where: { organizationId: orgId } });
    await migrator.document.updateMany({
      where: { organizationId: orgId },
      data: { currentVersionId: null },
    });
    await migrator.documentVersion.deleteMany({ where: { organizationId: orgId } });
    await migrator.document.deleteMany({ where: { organizationId: orgId } });
    await migrator.workspace.deleteMany({ where: { organizationId: orgId } });
    await migrator.user.deleteMany({ where: { id: { in: [userId, confirmerId] } } });
    await migrator.organization.deleteMany({ where: { id: orgId } });
    await Promise.all([migrator.$disconnect(), runtime.$disconnect()]);
  });

  it("hides a confirmed document, keeps the blob key until the deadline, then purges once", async () => {
    await withActorContext(runtime, { userId, organizationId: orgId }, async (tx) => {
      const access = new DocumentAccess(createPrismaDocumentStore(tx));
      await expect(
        access.requestDeletion(orgId, documentId, userId, null, requestedAt),
      ).rejects.toThrow(/DELETION_CONFIRMATION_REQUIRED/);
      expect(await access.readForOrganization(orgId, documentId)).toMatchObject({
        status: "ready",
        storageKey,
      });
    });

    await withActorContext(runtime, { userId, organizationId: orgId }, async (tx) => {
      const access = new DocumentAccess(createPrismaDocumentStore(tx));
      expect(
        await access.requestDeletion(orgId, documentId, userId, confirmerId, requestedAt),
      ).toEqual({ outcome: "pending" });
      expect(await access.readForOrganization(orgId, documentId)).toBeNull();
      const hidden = await tx.document.findUnique({ where: { id: documentId } });
      expect(hidden?.status).toBe("deletion_pending");
      expect(hidden?.storageKey).toBe(storageKey);
      const mapped = await createPrismaDocumentStore(tx).findById(documentId);
      expect(mapped?.storageKey).toBe("");
    });

    const journal = await migrator.deletionJournal.findFirst({
      where: { organizationId: orgId, objectId: documentId },
    });
    expect(journal?.purgeAfter.getTime()).toBe(requestedAt.getTime() + DELETION_PURGE_DELAY_MS);
    expect(journal?.confirmerUserId).toBe(confirmerId);

    const deletedKeys: string[] = [];
    const storage = {
      async delete(key: string) {
        deletedKeys.push(key);
      },
    };
    expect(
      await purgeDueDocumentDeletions(
        migrator,
        storage,
        new Date(requestedAt.getTime() + 1000),
        orgId,
      ),
    ).toBe(0);
    expect(await migrator.document.findUnique({ where: { id: documentId } })).not.toBeNull();

    expect(
      await purgeDueDocumentDeletions(
        migrator,
        storage,
        new Date(requestedAt.getTime() + DELETION_PURGE_DELAY_MS),
        orgId,
      ),
    ).toBe(1);
    expect(deletedKeys).toEqual([storageKey]);
    expect(await migrator.document.findUnique({ where: { id: documentId } })).toBeNull();
    expect(await migrator.documentVersion.findMany({ where: { documentId } })).toEqual([]);
    expect(await migrator.document.findUnique({ where: { id: keptId } })).not.toBeNull();

    expect(
      await purgeDueDocumentDeletions(
        migrator,
        storage,
        new Date(requestedAt.getTime() + DELETION_PURGE_DELAY_MS + 1000),
        orgId,
      ),
    ).toBe(0);
    const after = await migrator.deletionJournal.findFirst({
      where: { organizationId: orgId, objectId: documentId },
    });
    expect(after?.purgedAt).not.toBeNull();
  });
});
