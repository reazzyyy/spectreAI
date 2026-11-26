import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient, withActorContext } from "./index.js";
import { requireRlsFixture } from "./rls-guard.js";

/**
 * Phase 6A-0: stored Russian tsvector on document_extractions.
 * The column is generated in SQL and is not a Prisma field.
 * RLS stays on the extraction row: no GUC, another org, or a same-org user
 * who cannot see the parent document must not read search_tsv (D-032 / W-020).
 */
describe("document extraction FTS column", () => {
  const migrator = createPrismaClient({ purpose: "migrator" });
  const runtime = createPrismaClient({ purpose: "runtime" });

  const orgA = randomUUID();
  const orgB = randomUUID();
  const ownerId = randomUUID();
  const strangerId = randomUUID();
  const otherOrgUserId = randomUUID();
  const workspaceId = randomUUID();
  const documentId = randomUUID();
  const versionId = randomUUID();
  const extractionId = randomUUID();

  let ready = false;

  beforeAll(async () => {
    try {
      await runtime.$queryRaw`SELECT 1`;
      await migrator.organization.createMany({
        data: [
          { id: orgA, name: `fts-a-${orgA.slice(0, 8)}` },
          { id: orgB, name: `fts-b-${orgB.slice(0, 8)}` },
        ],
      });
      await migrator.user.createMany({
        data: [
          { id: ownerId, email: `fts-owner-${ownerId}@example.com`, passwordHash: "x" },
          {
            id: strangerId,
            email: `fts-stranger-${strangerId}@example.com`,
            passwordHash: "x",
          },
          {
            id: otherOrgUserId,
            email: `fts-other-${otherOrgUserId}@example.com`,
            passwordHash: "x",
          },
        ],
      });
      await migrator.workspace.create({
        data: {
          id: workspaceId,
          organizationId: orgA,
          ownerUserId: ownerId,
          name: "fts",
          visibility: "PERSONAL",
          status: "ACTIVE",
        },
      });
      await migrator.document.create({
        data: {
          id: documentId,
          organizationId: orgA,
          workspaceId,
          title: "Договор",
          status: "ready",
          originalFileName: "dogovor.txt",
          mimeType: "text/plain",
          byteSize: 32,
          checksumSha256: "fts",
          storageKey: `org/${orgA}/doc/${documentId}`,
          uploadedByUserId: ownerId,
          currentVersionId: null,
        },
      });
      await migrator.documentVersion.create({
        data: {
          id: versionId,
          organizationId: orgA,
          documentId,
          versionNumber: 1,
          originalFileName: "dogovor.txt",
          mimeType: "text/plain",
          byteSize: 32,
          checksumSha256: "fts",
          storageKey: `org/${orgA}/doc/${documentId}`,
          uploadedByUserId: ownerId,
          searchEligible: false,
        },
      });
      await migrator.document.update({
        where: { id: documentId },
        data: { currentVersionId: versionId },
      });
      await migrator.documentExtraction.create({
        data: {
          id: extractionId,
          organizationId: orgA,
          documentId,
          documentVersionId: versionId,
          charCount: 48,
          extractor: "plain",
          textContent: "Стороны согласовали расторжение ДОГОВОРОМ",
        },
      });
      ready = true;
    } catch (error) {
      console.warn(
        "[rls.fts.test] skip — Postgres unavailable:",
        error instanceof Error ? error.message : error,
      );
      ready = false;
    }
  }, 60_000);

  afterAll(async () => {
    if (ready) {
      await migrator.document.update({
        where: { id: documentId },
        data: { currentVersionId: null },
      });
      await migrator.document.deleteMany({ where: { id: documentId } });
      await migrator.workspace.deleteMany({ where: { id: workspaceId } });
      await migrator.user.deleteMany({
        where: { id: { in: [ownerId, strangerId, otherOrgUserId] } },
      });
      await migrator.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
    }
    await Promise.all([runtime.$disconnect(), migrator.$disconnect()]);
  });

  it("stores a generated russian tsvector and a GIN index", async ({ skip }) => {
    requireRlsFixture(ready, skip);

    const column = await migrator.$queryRaw<Array<{ attgenerated: string }>>`
      SELECT a.attgenerated::text AS attgenerated
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'document_extractions'
        AND a.attname = 'search_tsv'
        AND NOT a.attisdropped
    `;
    expect(column).toEqual([{ attgenerated: "s" }]);

    const index = await migrator.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'document_extractions'
        AND indexname = 'document_extractions_search_tsv_idx'
    `;
    expect(index).toHaveLength(1);

    const filled = await migrator.$queryRaw<Array<{ missing: bigint; hit: boolean }>>`
      SELECT
        COUNT(*) FILTER (WHERE search_tsv IS NULL) AS missing,
        bool_or(search_tsv @@ websearch_to_tsquery('russian', 'договор')) AS hit
      FROM document_extractions
      WHERE id = ${extractionId}::uuid
    `;
    expect(filled[0]?.missing).toBe(0n);
    expect(filled[0]?.hit).toBe(true);
  });

  it("hides search_tsv without a GUC, across orgs, and from a non-member", async ({ skip }) => {
    requireRlsFixture(ready, skip);

    const open = await runtime.$queryRaw<Array<{ id: string }>>`
      SELECT id::text
      FROM document_extractions
      WHERE id = ${extractionId}::uuid
    `;
    expect(open).toEqual([]);

    const otherOrg = await withActorContext(
      runtime,
      { userId: otherOrgUserId, organizationId: orgB },
      (tx) => tx.$queryRaw<Array<{ snippet: string }>>`
        SELECT search_tsv::text AS snippet
        FROM document_extractions
        WHERE id = ${extractionId}::uuid
      `,
    );
    expect(otherOrg).toEqual([]);

    const stranger = await withActorContext(
      runtime,
      { userId: strangerId, organizationId: orgA },
      (tx) => tx.$queryRaw<Array<{ snippet: string }>>`
        SELECT search_tsv::text AS snippet
        FROM document_extractions
        WHERE id = ${extractionId}::uuid
      `,
    );
    expect(stranger).toEqual([]);

    const owner = await withActorContext(
      runtime,
      { userId: ownerId, organizationId: orgA },
      (tx) => tx.$queryRaw<Array<{ hit: boolean }>>`
        SELECT search_tsv @@ websearch_to_tsquery('russian', 'договор') AS hit
        FROM document_extractions
        WHERE id = ${extractionId}::uuid
      `,
    );
    expect(owner).toEqual([{ hit: true }]);
  });
});
