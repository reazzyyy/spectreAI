import { describe, expect, it } from "vitest";
import {
  assertAuthDatabaseRole,
  AuthDatabaseRoleError,
  resolveAuthDatabaseUrl,
} from "./auth-role.js";

const migratorUrl = "postgresql://spectre:spectre@localhost:5432/spectre";
const runtimeUrl = "postgresql://spectre_app:spectre_app@localhost:5432/spectre";
const authUrl = "postgresql://spectre_auth:spectre_auth@localhost:5432/spectre";

describe("auth database role", () => {
  it("fails production startup when DATABASE_URL_AUTH is missing", () => {
    expect(() =>
      resolveAuthDatabaseUrl({
        APP_ENV: "production",
        DATABASE_URL: migratorUrl,
      }),
    ).toThrow(AuthDatabaseRoleError);
    expect(() =>
      resolveAuthDatabaseUrl({
        NODE_ENV: "production",
        DATABASE_URL: migratorUrl,
      }),
    ).toThrow("AUTH_URL_REQUIRED");
  });

  it("does not reuse the migrator URL for a local auth client", () => {
    const resolved = resolveAuthDatabaseUrl({
      NODE_ENV: "development",
      DATABASE_URL: migratorUrl,
      DATABASE_URL_RUNTIME: runtimeUrl,
    });
    expect(new URL(resolved).username).toBe("spectre_auth");
  });

  it("fails when the auth URL uses the migrator identity", async () => {
    await expect(
      assertAuthDatabaseRole({
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://spectre:hidden@db.internal:5432/spectre",
        DATABASE_URL_AUTH: "postgresql://spectre:other@db.internal:5432/spectre",
        DATABASE_URL_RUNTIME: runtimeUrl,
      }),
    ).rejects.toThrow("AUTH_ROLE_MATCHES_MIGRATOR");
  });

  it("fails when the auth URL uses the runtime identity", async () => {
    await expect(
      assertAuthDatabaseRole({
        NODE_ENV: "production",
        DATABASE_URL: migratorUrl,
        DATABASE_URL_RUNTIME: "postgresql://spectre_app:hidden@db.internal:5432/spectre",
        DATABASE_URL_AUTH: "postgresql://spectre_app:other@db.internal:5432/spectre",
      }),
    ).rejects.toThrow("AUTH_ROLE_MATCHES_RUNTIME");
  });

  it("fails when the connected role bypasses RLS", async () => {
    await expect(
      assertAuthDatabaseRole({
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://not_the_auth_role:hidden@localhost:5432/spectre",
        DATABASE_URL_RUNTIME: runtimeUrl,
        DATABASE_URL_AUTH: migratorUrl,
      }),
    ).rejects.toThrow("AUTH_ROLE_PRIVILEGED");
  });

  it("accepts the local spectre_auth role", async () => {
    await expect(
      assertAuthDatabaseRole({
        NODE_ENV: "production",
        DATABASE_URL: migratorUrl,
        DATABASE_URL_RUNTIME: runtimeUrl,
        DATABASE_URL_AUTH: authUrl,
      }),
    ).resolves.toBeUndefined();
  });
});
