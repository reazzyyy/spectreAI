import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient, withActorContext } from "./index.js";

/**
 * Runtime audit is append-only and org-scoped.
 * System rows (no organization) are not readable by any tenant.
 * Skips only when Postgres is down.
 */
describe("audit_events RLS (runtime role)", () => {
  const migrator = createPrismaClient({ purpose: "migrator" });
  const runtime = createPrismaClient({ purpose: "runtime" });

  const orgA = randomUUID();
  const orgB = randomUUID();
  const userA = randomUUID();
  const eventA = randomUUID();
  const eventB = randomUUID();
  const eventSystem = randomUUID();

  let ready = false;

  beforeAll(async () => {
    try {
      await runtime.$queryRaw`SELECT 1`;
      await migrator.organization.createMany({
        data: [
          { id: orgA, name: "rls-audit-org-a" },
          { id: orgB, name: "rls-audit-org-b" },
        ],
      });
      await migrator.user.create({
        data: {
          id: userA,
          email: `rls-audit-a-${userA}@example.com`,
          passwordHash: "hash-a",
        },
      });
      await migrator.auditEvent.createMany({
        data: [
          { id: eventA, organizationId: orgA, actorUserId: userA, action: "document.upload" },
          { id: eventB, organizationId: orgB, action: "document.upload" },
          { id: eventSystem, organizationId: null, systemEvent: true, action: "auth.anonymous" },
        ],
      });
      ready = true;
    } catch (error) {
      console.warn(
        "[rls.audit.test] skip — Postgres/runtime role unavailable:",
        error instanceof Error ? error.message : error,
      );
      ready = false;
    }
  }, 60_000);

  afterAll(async () => {
    if (ready) {
      await migrator.auditEvent.deleteMany({
        where: { id: { in: [eventA, eventB, eventSystem] } },
      });
      await migrator.user.deleteMany({ where: { id: userA } });
      await migrator.organization.deleteMany({
        where: { id: { in: [orgA, orgB] } },
      });
    }
    await Promise.all([runtime.$disconnect(), migrator.$disconnect()]);
  });

  it("org A sees only its own tenant events", async ({ skip }) => {
    if (!ready) skip();
    const rows = await withActorContext(
      runtime,
      { userId: userA, organizationId: orgA },
      (tx) =>
        tx.auditEvent.findMany({
          where: { id: { in: [eventA, eventB, eventSystem] } },
          select: { id: true },
        }),
    );
    expect(rows.map((row) => row.id)).toEqual([eventA]);
  });

  it("without GUC, runtime sees no audit rows", async ({ skip }) => {
    if (!ready) skip();
    const rows = await runtime.auditEvent.findMany({
      where: { id: { in: [eventA, eventB, eventSystem] } },
      select: { id: true },
    });
    expect(rows).toEqual([]);
  });

  it("runtime cannot update or delete audit events, or insert another org", async ({ skip }) => {
    if (!ready) skip();
    const privileges = await runtime.$queryRaw<
      Array<{ audit_update: boolean; audit_delete: boolean; default_write: boolean }>
    >`
      SELECT
        has_table_privilege(current_user, 'audit_events', 'UPDATE') AS audit_update,
        has_table_privilege(current_user, 'audit_events', 'DELETE') AS audit_delete,
        EXISTS (
          SELECT 1
          FROM pg_default_acl d
          JOIN pg_namespace n ON n.oid = d.defaclnamespace
          CROSS JOIN LATERAL aclexplode(d.defaclacl) AS x
          JOIN pg_roles r ON r.oid = x.grantee
          WHERE n.nspname = 'public'
            AND d.defaclobjtype = 'r'
            AND r.rolname = current_user
            AND x.privilege_type IN ('UPDATE', 'DELETE')
        ) AS default_write
    `;
    expect(privileges[0]).toEqual({
      audit_update: false,
      audit_delete: false,
      default_write: false,
    });

    await expect(
      withActorContext(runtime, { userId: userA, organizationId: orgA }, (tx) =>
        tx.auditEvent.update({
          where: { id: eventA },
          data: { action: "tamper" },
          select: { id: true },
        }),
      ),
    ).rejects.toBeTruthy();

    await expect(
      withActorContext(runtime, { userId: userA, organizationId: orgA }, (tx) =>
        tx.auditEvent.create({
          data: {
            id: randomUUID(),
            organizationId: orgB,
            action: "document.upload",
          },
          select: { id: true },
        }),
      ),
    ).rejects.toBeTruthy();

    const inserted = await withActorContext(
      runtime,
      { userId: userA, organizationId: orgA },
      (tx) =>
        tx.auditEvent.create({
          data: {
            organizationId: orgA,
            actorUserId: userA,
            action: "document.download",
          },
          select: { id: true },
        }),
    );
    await migrator.auditEvent.delete({ where: { id: inserted.id } });
  });
});
