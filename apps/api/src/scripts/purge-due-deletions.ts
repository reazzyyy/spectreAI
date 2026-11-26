/**
 * Ops entry for the 24h document purge (D-038). Does not log storage keys.
 */
import { createPrismaClient } from "@spectre/db";
import { createLocalObjectStorageFromEnv } from "../documents/local-object-storage.js";
import { purgeDueDocumentDeletions } from "../documents/purge-deletions.js";

async function main(): Promise<void> {
  const prisma = createPrismaClient({ purpose: "migrator" });
  const storage = createLocalObjectStorageFromEnv();
  const purged = await purgeDueDocumentDeletions(prisma, storage, new Date());
  console.log(`purged ${purged} documents`);
  await prisma.$disconnect();
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.name : "PURGE_FAILED");
  process.exit(1);
});
