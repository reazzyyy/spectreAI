import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "./index.js";
import { requireRlsFixture } from "./rls-guard.js";

const repairSql = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    "../prisma/migrations/20261120230000_repair_document_version_backfill/migration.sql",
  ),
  "utf8",
);

function sqlStatements(sql: string): string[] {
  return sql
    .split(/;\s*(?:\r?\n|$)/)
    .map((part) => part.replace(/--[^\n]*/g, "").trim())
    .filter((part) => part.length > 0);
}

/**
 * Documents that already exist must receive version 1 when the repair runs.
 * Runtime without a GUC sees none of them, which is why the migration turns
 * row_security off instead of trusting a plain SELECT.
 */
describe("document version backfill under FORCE RLS", () => {
  const migrator = createPrismaClient({ purpose: "migrator" });
  const runtime = createPrismaClient({ purpose: "runtime" });

  const orgId = randomUUID();
  const userId = randomUUID();
  const workspaceId = randomUUID();
  const documentId = randomUUID();

  let ready = false;

  beforeAll(async () => {
    try {
      await runtime.$queryRaw`SELECT 1`;
      await migrator.organization.create({
        data: { id: orgId, name: "rls-docver-org" },
      });
      await migrator.user.create({
        data: {
          id: userId,
          email: `rls-docver-${userId}@example.com`,
          passwordHash: "x",
        },
      });
      await migrator.workspace.create({
        data: {
          id: workspaceId,
          organizationId: orgId,
          ownerUserId: userId,
          name: "rls-docver",
          visibility: "PERSONAL",
          status: "ACTIVE",
        },
      });
      await migrator.document.create({
        data: {
          id: documentId,
          organizationId: orgId,
          workspaceId,
          title: "already-there",
          originalFileName: "already-there.txt",
          mimeType: "text/plain",
          byteSize: 4,
          checksumSha256: "abc",
          storageKey: `org/${orgId}/doc/${documentId}`,
          uploadedByUserId: userId,
          currentVersionId: null,
        },
      });
      ready = true;
    } catch (error) {
      console.warn(
        "[rls.document-version-backfill.test] skip — Postgres unavailable:",
        error instanceof Error ? error.message : error,
      );
      ready = false;
    }
  }, 60_000);

  afterAll(async () => {
    if (ready) {
      await migrator.document.deleteMany({ where: { id: documentId } });
      await migrator.workspace.deleteMany({ where: { id: workspaceId } });
      await migrator.user.deleteMany({ where: { id: userId } });
      await migrator.organization.deleteMany({ where: { id: orgId } });
    }
    await Promise.all([runtime.$disconnect(), migrator.$disconnect()]);
  });

  it("gives an existing document version 1 and does not add a second one", async ({
    skip,
  }) => {
    requireRlsFixture(ready, skip);

    const hidden = await runtime.document.findMany({
      where: { id: documentId },
      select: { id: true },
    });
    expect(hidden).toEqual([]);

    const statements = sqlStatements(repairSql);
    await migrator.$transaction(async (tx) => {
      for (const statement of statements) {
        await tx.$executeRawUnsafe(statement);
      }
    });

    const document = await migrator.document.findUniqueOrThrow({
      where: { id: documentId },
      select: { currentVersionId: true },
    });
    const versions = await migrator.documentVersion.findMany({
      where: { documentId },
      select: { id: true, versionNumber: true, searchEligible: true },
    });
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({
      id: document.currentVersionId,
      versionNumber: 1,
      searchEligible: false,
    });

    await migrator.$transaction(async (tx) => {
      for (const statement of statements) {
        await tx.$executeRawUnsafe(statement);
      }
    });
    const again = await migrator.documentVersion.count({ where: { documentId } });
    expect(again).toBe(1);
  });
});
