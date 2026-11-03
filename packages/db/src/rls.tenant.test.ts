import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient, withActorContext } from "./index.js";

/**
 * RLS harness under runtime role (spectre_app). Requires migrate:deploy applied.
 * Skips when DATABASE_URL_RUNTIME is unreachable (local without Docker).
 */
describe("tenant RLS (runtime role)", () => {
  const migrator = createPrismaClient({ purpose: "migrator" });
  const runtime = createPrismaClient({ purpose: "runtime" });

  const orgA = randomUUID();
  const orgB = randomUUID();
  const userA = randomUUID();
  const userB = randomUUID();
  const clientA = randomUUID();
  const clientB = randomUUID();

  let ready = false;

  beforeAll(async () => {
    try {
      await runtime.$queryRaw`SELECT 1`;
      await migrator.organization.createMany({
        data: [
          { id: orgA, name: "rls-org-a" },
          { id: orgB, name: "rls-org-b" },
        ],
      });
      await migrator.user.createMany({
        data: [
          {
            id: userA,
            email: `rls-a-${userA}@example.com`,
            passwordHash: "x",
          },
          {
            id: userB,
            email: `rls-b-${userB}@example.com`,
            passwordHash: "x",
          },
        ],
      });
      await migrator.client.createMany({
        data: [
          { id: clientA, organizationId: orgA, name: "client-a" },
          { id: clientB, organizationId: orgB, name: "client-b" },
        ],
      });
      ready = true;
    } catch (error) {
      console.warn(
        "[rls.tenant.test] skip — Postgres/runtime role unavailable:",
        error instanceof Error ? error.message : error,
      );
      ready = false;
    }
  }, 60_000);

  afterAll(async () => {
    if (ready) {
      await migrator.client.deleteMany({
        where: { id: { in: [clientA, clientB] } },
      });
      await migrator.user.deleteMany({ where: { id: { in: [userA, userB] } } });
      await migrator.organization.deleteMany({
        where: { id: { in: [orgA, orgB] } },
      });
    }
    await Promise.all([runtime.$disconnect(), migrator.$disconnect()]);
  });

  it("without GUC, runtime SELECT on clients returns no rows", async ({ skip }) => {
    if (!ready) skip();
    const rows = await runtime.client.findMany({
      where: { id: { in: [clientA, clientB] } },
    });
    expect(rows).toEqual([]);
  });

  it("with org A GUC, runtime sees only org A client", async ({ skip }) => {
    if (!ready) skip();
    const rows = await withActorContext(
      runtime,
      { userId: userA, organizationId: orgA },
      (tx) =>
        tx.client.findMany({
          where: { id: { in: [clientA, clientB] } },
        }),
    );
    expect(rows.map((r) => r.id)).toEqual([clientA]);
  });

  it("with org A GUC, INSERT for org B is blocked", async ({ skip }) => {
    if (!ready) skip();
    const foreignId = randomUUID();
    await expect(
      withActorContext(runtime, { userId: userA, organizationId: orgA }, (tx) =>
        tx.client.create({
          data: {
            id: foreignId,
            organizationId: orgB,
            name: "should-fail",
          },
        }),
      ),
    ).rejects.toBeTruthy();
  });

  it("sequential tx A then B on pooled runtime does not leak context", async ({ skip }) => {
    if (!ready) skip();
    const a = await withActorContext(
      runtime,
      { userId: userA, organizationId: orgA },
      (tx) => tx.client.findMany({ where: { id: { in: [clientA, clientB] } } }),
    );
    const b = await withActorContext(
      runtime,
      { userId: userB, organizationId: orgB },
      (tx) => tx.client.findMany({ where: { id: { in: [clientA, clientB] } } }),
    );
    expect(a.map((r) => r.id)).toEqual([clientA]);
    expect(b.map((r) => r.id)).toEqual([clientB]);
  });
});
