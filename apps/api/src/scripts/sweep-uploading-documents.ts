/**
 * Orphan sweeper: remove stale `uploading` rows older than TTL and best-effort delete blobs.
 * Run periodically in ops (scaffold). Does not log file names.
 */
import { createPrismaClient } from "@spectre/db";
import { createLocalObjectStorageFromEnv } from "../documents/local-object-storage.js";

const TTL_MS = 60 * 60 * 1000;

async function main(): Promise<void> {
  const prisma = createPrismaClient({ purpose: "migrator" });
  const storage = createLocalObjectStorageFromEnv();
  const cutoff = new Date(Date.now() - TTL_MS);

  const stale = await prisma.document.findMany({
    where: { status: "uploading", createdAt: { lt: cutoff } },
    select: { id: true, storageKey: true },
  });

  for (const row of stale) {
    await storage.delete(row.storageKey).catch(() => undefined);
    await prisma.document.delete({ where: { id: row.id } }).catch(() => undefined);
  }

  console.log(`swept ${stale.length} uploading documents`);
  await prisma.$disconnect();
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
