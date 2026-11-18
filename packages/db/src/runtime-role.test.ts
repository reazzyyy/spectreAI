import { describe, expect, it } from "vitest";
import {
  assertRuntimeDatabaseRole,
  resolveRuntimeDatabaseUrl,
  RuntimeDatabaseRoleError,
} from "./runtime-role.js";

const migratorUrl = "postgresql://spectre:spectre@localhost:5432/spectre";
const runtimeUrl = "postgresql://spectre_app:spectre_app@localhost:5432/spectre";

describe("runtime database role", () => {
  it("fails production startup when DATABASE_URL_RUNTIME is missing", () => {
    expect(() =>
      resolveRuntimeDatabaseUrl({
        NODE_ENV: "production",
        DATABASE_URL: migratorUrl,
      }),
    ).toThrow(RuntimeDatabaseRoleError);
    expect(() =>
      resolveRuntimeDatabaseUrl({
        NODE_ENV: "production",
        DATABASE_URL: migratorUrl,
      }),
    ).toThrow("RUNTIME_URL_REQUIRED");
  });

  it("does not reuse the migrator URL for a local runtime client", () => {
    const resolved = resolveRuntimeDatabaseUrl({
      NODE_ENV: "development",
      DATABASE_URL: migratorUrl,
    });
    expect(new URL(resolved).username).toBe("spectre_app");
    expect(new URL(resolved).username).not.toBe(new URL(migratorUrl).username);
  });

  it("fails when the runtime URL uses the migrator identity", async () => {
    await expect(
      assertRuntimeDatabaseRole({
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://spectre:hidden@db.internal:5432/spectre",
        DATABASE_URL_RUNTIME: "postgresql://spectre:other-secret@db.internal:5432/spectre",
      }),
    ).rejects.toThrow("RUNTIME_ROLE_MATCHES_MIGRATOR");
  });

  it("fails when the connected role bypasses RLS", async () => {
    await expect(
      assertRuntimeDatabaseRole({
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://not_the_runtime_role:hidden@localhost:5432/spectre",
        DATABASE_URL_RUNTIME: migratorUrl,
      }),
    ).rejects.toThrow("RUNTIME_ROLE_PRIVILEGED");
  });

  it("accepts the local spectre_app role", async () => {
    await expect(
      assertRuntimeDatabaseRole({
        NODE_ENV: "production",
        DATABASE_URL: migratorUrl,
        DATABASE_URL_RUNTIME: runtimeUrl,
      }),
    ).resolves.toBeUndefined();
  });
});
