import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "./index.js";
import { requireRlsFixture } from "./rls-guard.js";

/**
 * spectre_auth may call the login functions and must not read auth tables.
 * spectre_app must not execute those functions (they return password hashes).
 */
describe("auth request role (D-036)", () => {
  const migrator = createPrismaClient({ purpose: "migrator" });
  const auth = createPrismaClient({ purpose: "auth" });
  const runtime = createPrismaClient({ purpose: "runtime" });

  const orgA = randomUUID();
  const orgB = randomUUID();
  const userA = randomUUID();
  const userB = randomUUID();
  const tokenHash = `authrole${randomUUID().replace(/-/g, "")}`;

  let ready = false;

  beforeAll(async () => {
    try {
      await auth.$queryRaw`SELECT 1`;
      await migrator.organization.createMany({
        data: [
          { id: orgA, name: "auth-role-org-a" },
          { id: orgB, name: "auth-role-org-b" },
        ],
      });
      await migrator.user.createMany({
        data: [
          { id: userA, email: `auth-role-a-${userA}@example.com`, passwordHash: "hash-a" },
          { id: userB, email: `auth-role-b-${userB}@example.com`, passwordHash: "hash-b" },
        ],
      });
      await migrator.organizationMembership.createMany({
        data: [
          { organizationId: orgA, userId: userA, role: "member" },
          { organizationId: orgB, userId: userB, role: "owner" },
        ],
      });
      ready = true;
    } catch (error) {
      console.warn(
        "[rls.auth-role.test] skip — Postgres/auth role unavailable:",
        error instanceof Error ? error.message : error,
      );
      ready = false;
    }
  }, 60_000);

  afterAll(async () => {
    if (ready) {
      await migrator.session.deleteMany({ where: { userId: { in: [userA, userB] } } });
      await migrator.organizationMembership.deleteMany({
        where: { organizationId: { in: [orgA, orgB] } },
      });
      await migrator.user.deleteMany({ where: { id: { in: [userA, userB] } } });
      await migrator.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
    }
    await Promise.all([auth.$disconnect(), runtime.$disconnect(), migrator.$disconnect()]);
  });

  it("connects as an unprivileged role that cannot read users", async ({ skip }) => {
    requireRlsFixture(ready, skip);
    const who = await auth.$queryRaw<Array<{ current_user: string }>>`
      SELECT current_user
    `;
    expect(who[0]?.current_user).toBe("spectre_auth");
    await expect(auth.$queryRaw`SELECT password_hash FROM users LIMIT 1`).rejects.toThrow();
    const privileges = await runtime.$queryRaw<Array<{ lookup: boolean }>>`
      SELECT has_function_privilege(
        'spectre_app',
        'auth_lookup_login(text, text)',
        'EXECUTE'
      ) AS lookup
    `;
    expect(privileges[0]?.lookup).toBe(false);
  });

  it("returns only the requested user's login row", async ({ skip }) => {
    requireRlsFixture(ready, skip);
    const email = `auth-role-a-${userA}@example.com`;
    const rows = await auth.$queryRaw<
      Array<{ user_id: string; password_hash: string; membership_role: string | null }>
    >`
      SELECT user_id, password_hash, membership_role
      FROM auth_lookup_login(${email}, ${orgA})
    `;
    expect(rows).toEqual([
      { user_id: userA, password_hash: "hash-a", membership_role: "member" },
    ]);

    const wrongOrg = await auth.$queryRaw<
      Array<{ password_hash: string; membership_role: string | null }>
    >`
      SELECT password_hash, membership_role
      FROM auth_lookup_login(${email}, ${orgB})
    `;
    expect(wrongOrg).toEqual([{ password_hash: "hash-a", membership_role: null }]);
  });

  it("creates, resolves, and revokes only the matching session", async ({ skip }) => {
    requireRlsFixture(ready, skip);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    const created = await auth.$queryRaw<Array<{ created: boolean }>>`
      SELECT auth_create_session(${userA}, ${orgA}, ${tokenHash}, ${expiresAt}) AS created
    `;
    expect(created[0]?.created).toBe(true);

    const resolved = await auth.$queryRaw<
      Array<{ user_id: string; organization_id: string; membership_role: string }>
    >`
      SELECT user_id, organization_id, membership_role
      FROM auth_resolve_session(${tokenHash})
    `;
    expect(resolved).toEqual([
      { user_id: userA, organization_id: orgA, membership_role: "member" },
    ]);

    const other = await auth.$queryRaw<Array<{ user_id: string }>>`
      SELECT user_id FROM auth_resolve_session(${`${tokenHash}no`})
    `;
    expect(other).toEqual([]);

    const revokedCall = await auth.$queryRaw<Array<{ revoked: boolean }>>`
      SELECT auth_revoke_session(${tokenHash}) AS revoked
    `;
    expect(revokedCall[0]?.revoked).toBe(true);
    const revoked = await auth.$queryRaw<Array<{ revoked_at: Date | null }>>`
      SELECT revoked_at FROM auth_resolve_session(${tokenHash})
    `;
    expect(revoked[0]?.revoked_at).not.toBeNull();
  });

  it("refuses a session for an inactive membership", async ({ skip }) => {
    requireRlsFixture(ready, skip);
    const created = await auth.$queryRaw<Array<{ created: boolean }>>`
      SELECT auth_create_session(
        ${userB},
        ${orgA},
        ${`${tokenHash}x`},
        ${new Date(Date.now() + 60_000)}
      ) AS created
    `;
    expect(created[0]?.created).toBe(false);
  });
});
