import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient, withActorContext } from "./index.js";
import { requireRlsFixture } from "./rls-guard.js";

/**
 * deletion_journal is tenant-scoped and append-only for the runtime role (D-020 / D-038).
 */
describe("deletion journal RLS", () => {
  const migrator = createPrismaClient({ purpose: "migrator" });
  const runtime = createPrismaClient({ purpose: "runtime" });
  const orgA = randomUUID();
  const orgB = randomUUID();
  const userA = randomUUID();
  const journalA = randomUUID();
  let ready = false;

  beforeAll(async () => {
    try {
      await runtime.$queryRaw`SELECT 1`;
      await migrator.organization.createMany({
        data: [
          { id: orgA, name: `journal-a-${orgA.slice(0, 8)}` },
          { id: orgB, name: `journal-b-${orgB.slice(0, 8)}` },
        ],
      });
      await migrator.user.create({
        data: {
          id: userA,
          email: `journal-${userA}@example.com`,
          passwordHash: "x",
        },
      });
      await migrator.deletionJournal.create({
        data: {
          id: journalA,
          organizationId: orgA,
          objectType: "document",
          objectId: randomUUID(),
          requestedByUserId: userA,
          confirmerUserId: randomUUID(),
          requestedAt: new Date("2026-11-26T00:00:00.000Z"),
          purgeAfter: new Date("2026-11-27T00:00:00.000Z"),
        },
      });
      ready = true;
    } catch (error) {
      console.warn(
        "[rls.deletion-journal.test] skip — Postgres/runtime role unavailable:",
        error instanceof Error ? error.message : error,
      );
      ready = false;
    }
  }, 60_000);

  afterAll(async () => {
    if (ready) {
      await migrator.deletionJournal.deleteMany({ where: { id: journalA } });
      await migrator.user.deleteMany({ where: { id: userA } });
      await migrator.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
    }
    await Promise.all([runtime.$disconnect(), migrator.$disconnect()]);
  });

  it("hides another organization's journal row from the runtime role", async ({ skip }) => {
    requireRlsFixture(ready, skip);
    const own = await withActorContext(
      runtime,
      { userId: userA, organizationId: orgA },
      (tx) => tx.deletionJournal.findMany({ where: { id: journalA } }),
    );
    const foreign = await withActorContext(
      runtime,
      { userId: userA, organizationId: orgB },
      (tx) => tx.deletionJournal.findMany({ where: { id: journalA } }),
    );
    const anonymous = await runtime.deletionJournal.findMany({ where: { id: journalA } });
    expect(own).toHaveLength(1);
    expect(foreign).toEqual([]);
    expect(anonymous).toEqual([]);
  });

  it("does not let the runtime role erase a journal row", async ({ skip }) => {
    requireRlsFixture(ready, skip);
    await expect(
      withActorContext(runtime, { userId: userA, organizationId: orgA }, (tx) =>
        tx.deletionJournal.deleteMany({ where: { id: journalA } }),
      ),
    ).rejects.toThrow(/permission denied/);
    const stillThere = await migrator.deletionJournal.findUnique({ where: { id: journalA } });
    expect(stillThere?.purgedAt).toBeNull();
  });
});
