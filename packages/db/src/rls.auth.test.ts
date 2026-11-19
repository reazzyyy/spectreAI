import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient, withActorContext } from "./index.js";

/**
 * Runtime role must not read other organizations' users, sessions, or orgs.
 * Auth writes stay on the migrator until S5. Skips only when Postgres is down.
 */
describe("auth-table RLS (runtime role)", () => {
  const migrator = createPrismaClient({ purpose: "migrator" });
  const runtime = createPrismaClient({ purpose: "runtime" });

  const orgA = randomUUID();
  const orgB = randomUUID();
  const userA = randomUUID();
  const userPeer = randomUUID();
  const userB = randomUUID();
  const sessionA = randomUUID();
  const sessionPeer = randomUUID();
  const sessionB = randomUUID();

  let ready = false;

  beforeAll(async () => {
    try {
      await runtime.$queryRaw`SELECT 1`;
      await migrator.organization.createMany({
        data: [
          { id: orgA, name: "rls-auth-org-a" },
          { id: orgB, name: "rls-auth-org-b" },
        ],
      });
      await migrator.user.createMany({
        data: [
          { id: userA, email: `rls-auth-a-${userA}@example.com`, passwordHash: "hash-a" },
          { id: userPeer, email: `rls-auth-peer-${userPeer}@example.com`, passwordHash: "hash-peer" },
          { id: userB, email: `rls-auth-b-${userB}@example.com`, passwordHash: "hash-b" },
        ],
      });
      await migrator.organizationMembership.createMany({
        data: [
          { organizationId: orgA, userId: userA, role: "member" },
          { organizationId: orgA, userId: userPeer, role: "member" },
          { organizationId: orgB, userId: userB, role: "member" },
        ],
      });
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
      await migrator.session.createMany({
        data: [
          { id: sessionA, userId: userA, organizationId: orgA, tokenHash: `tok-${sessionA}`, expiresAt },
          { id: sessionPeer, userId: userPeer, organizationId: orgA, tokenHash: `tok-${sessionPeer}`, expiresAt },
          { id: sessionB, userId: userB, organizationId: orgB, tokenHash: `tok-${sessionB}`, expiresAt },
        ],
      });
      ready = true;
    } catch (error) {
      console.warn(
        "[rls.auth.test] skip — Postgres/runtime role unavailable:",
        error instanceof Error ? error.message : error,
      );
      ready = false;
    }
  }, 60_000);

  afterAll(async () => {
    if (ready) {
      await migrator.session.deleteMany({
        where: { id: { in: [sessionA, sessionPeer, sessionB] } },
      });
      await migrator.organizationMembership.deleteMany({
        where: { organizationId: { in: [orgA, orgB] } },
      });
      await migrator.user.deleteMany({
        where: { id: { in: [userA, userPeer, userB] } },
      });
      await migrator.organization.deleteMany({
        where: { id: { in: [orgA, orgB] } },
      });
    }
    await Promise.all([runtime.$disconnect(), migrator.$disconnect()]);
  });

  it("without GUC, runtime sees no auth rows", async ({ skip }) => {
    if (!ready) skip();
    const users = await runtime.user.findMany({
      where: { id: { in: [userA, userPeer, userB] } },
      select: { id: true },
    });
    const sessions = await runtime.session.findMany({
      where: { id: { in: [sessionA, sessionPeer, sessionB] } },
      select: { id: true },
    });
    const orgs = await runtime.organization.findMany({
      where: { id: { in: [orgA, orgB] } },
      select: { id: true },
    });
    expect(users).toEqual([]);
    expect(sessions).toEqual([]);
    expect(orgs).toEqual([]);
  });

  it("org A sees itself, its members, and only its own session", async ({ skip }) => {
    if (!ready) skip();
    const seen = await withActorContext(
      runtime,
      { userId: userA, organizationId: orgA },
      async (tx) => {
        const users = await tx.user.findMany({
          where: { id: { in: [userA, userPeer, userB] } },
          select: { id: true },
        });
        const sessions = await tx.session.findMany({
          where: { id: { in: [sessionA, sessionPeer, sessionB] } },
          select: { id: true },
        });
        const orgs = await tx.organization.findMany({
          where: { id: { in: [orgA, orgB] } },
          select: { id: true },
        });
        return { users, sessions, orgs };
      },
    );
    expect(seen.users.map((row) => row.id).sort()).toEqual([userA, userPeer].sort());
    expect(seen.sessions.map((row) => row.id)).toEqual([sessionA]);
    expect(seen.orgs.map((row) => row.id)).toEqual([orgA]);
  });

  it("runtime cannot write auth tables or read secret columns", async ({ skip }) => {
    if (!ready) skip();
    const privileges = await runtime.$queryRaw<
      Array<{
        users_update: boolean;
        sessions_delete: boolean;
        orgs_insert: boolean;
        password_hash: boolean;
        token_hash: boolean;
      }>
    >`
      SELECT
        has_table_privilege(current_user, 'users', 'UPDATE') AS users_update,
        has_table_privilege(current_user, 'sessions', 'DELETE') AS sessions_delete,
        has_table_privilege(current_user, 'organizations', 'INSERT') AS orgs_insert,
        has_column_privilege(current_user, 'users', 'password_hash', 'SELECT') AS password_hash,
        has_column_privilege(current_user, 'sessions', 'token_hash', 'SELECT') AS token_hash
    `;
    expect(privileges[0]).toEqual({
      users_update: false,
      sessions_delete: false,
      orgs_insert: false,
      password_hash: false,
      token_hash: false,
    });

    await expect(
      withActorContext(runtime, { userId: userA, organizationId: orgA }, (tx) =>
        tx.user.update({
          where: { id: userA },
          data: { email: `changed-${userA}@example.com` },
          select: { id: true },
        }),
      ),
    ).rejects.toBeTruthy();
  });
});
