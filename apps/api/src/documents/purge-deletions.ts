import type { PrismaClient, PrismaTxClient } from "@spectre/db";

export interface BlobDeleter {
  delete(storageKey: string): Promise<void>;
}

/**
 * Deletes document rows, versions, and extractions whose journal deadline has
 * passed (D-019 / D-038). Uses the migrator connection. A later run skips rows
 * that already have `purgedAt`. Storage keys are not logged.
 */
export async function purgeDueDocumentDeletions(
  db: PrismaClient,
  storage: BlobDeleter,
  now: Date,
  organizationId?: string,
): Promise<number> {
  const due = await db.deletionJournal.findMany({
    where: {
      objectType: "document",
      purgedAt: null,
      purgeAfter: { lte: now },
      ...(organizationId ? { organizationId } : {}),
    },
    select: { id: true, organizationId: true, objectId: true },
  });

  let purged = 0;
  for (const entry of due) {
    const document = await db.document.findUnique({
      where: { id: entry.objectId },
      select: { id: true, organizationId: true, storageKey: true },
    });
    const sameOrg = document !== null && document.organizationId === entry.organizationId;
    const versions = sameOrg
      ? await db.documentVersion.findMany({
          where: { documentId: document.id },
          select: { storageKey: true },
        })
      : [];
    const keys = new Set<string>();
    if (sameOrg && document.storageKey.length > 0) {
      keys.add(document.storageKey);
    }
    for (const version of versions) {
      if (version.storageKey.length > 0) {
        keys.add(version.storageKey);
      }
    }
    for (const key of keys) {
      await storage.delete(key).catch(() => undefined);
    }

    await db.$transaction(async (tx: PrismaTxClient) => {
      if (sameOrg) {
        await tx.document.update({
          where: { id: document.id },
          data: { currentVersionId: null },
        });
        await tx.documentExtraction.deleteMany({ where: { documentId: document.id } });
        await tx.documentVersion.deleteMany({ where: { documentId: document.id } });
        await tx.document.delete({ where: { id: document.id } });
      }
      await tx.deletionJournal.update({
        where: { id: entry.id },
        data: { purgedAt: now },
      });
    });
    purged += 1;
  }

  return purged;
}
