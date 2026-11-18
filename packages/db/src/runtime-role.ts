import { Client } from "pg";

const DEFAULT_DATABASE_URL = "postgresql://spectre:spectre@localhost:5432/spectre";
const DEFAULT_RUNTIME_URL =
  "postgresql://spectre_app:spectre_app@localhost:5432/spectre";

/**
 * Startup refusal for a runtime connection that would skip RLS.
 * The message is a stable code. It never includes a connection string.
 */
export class RuntimeDatabaseRoleError extends Error {
  constructor(code: string) {
    super(code);
    this.name = code;
  }
}

/**
 * Runtime URL for RLS. Production must set DATABASE_URL_RUNTIME.
 * Local development falls back to the spectre_app scaffold, never to DATABASE_URL.
 */
export function resolveRuntimeDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.DATABASE_URL_RUNTIME?.trim() ?? "";
  if (configured !== "") {
    return configured;
  }
  if (env.NODE_ENV === "production") {
    throw new RuntimeDatabaseRoleError("RUNTIME_URL_REQUIRED");
  }
  return DEFAULT_RUNTIME_URL;
}

function connectionIdentity(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new RuntimeDatabaseRoleError("RUNTIME_URL_INVALID");
  }
  const port = parsed.port === "" ? "5432" : parsed.port;
  const database = parsed.pathname.replace(/^\//, "");
  return `${decodeURIComponent(parsed.username)}\n${parsed.hostname}\n${port}\n${database}`;
}

/**
 * Connects as the runtime role and refuses superuser, BYPASSRLS, or ownership.
 * Call this before HTTP listen and before the worker consumes jobs.
 */
export async function assertRuntimeDatabaseRole(
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const runtimeUrl = resolveRuntimeDatabaseUrl(env);
  const migratorUrl = env.DATABASE_URL?.trim() || DEFAULT_DATABASE_URL;
  if (connectionIdentity(runtimeUrl) === connectionIdentity(migratorUrl)) {
    throw new RuntimeDatabaseRoleError("RUNTIME_ROLE_MATCHES_MIGRATOR");
  }

  const client = new Client({ connectionString: runtimeUrl });
  try {
    await client.connect();
    const result = await client.query<{
      rolsuper: boolean;
      rolbypassrls: boolean;
      database_owner: boolean;
      owns_public_table: boolean;
    }>(`
      SELECT
        r.rolsuper,
        r.rolbypassrls,
        d.datdba = r.oid AS database_owner,
        EXISTS (
          SELECT 1
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public'
            AND c.relkind = 'r'
            AND c.relowner = r.oid
        ) AS owns_public_table
      FROM pg_roles r
      JOIN pg_database d ON d.datname = current_database()
      WHERE r.rolname = current_user
    `);
    const row = result.rows[0];
    if (
      !row ||
      row.rolsuper ||
      row.rolbypassrls ||
      row.database_owner ||
      row.owns_public_table
    ) {
      throw new RuntimeDatabaseRoleError("RUNTIME_ROLE_PRIVILEGED");
    }
  } catch (error) {
    if (error instanceof RuntimeDatabaseRoleError) {
      throw error;
    }
    throw new RuntimeDatabaseRoleError("RUNTIME_ROLE_CHECK_FAILED");
  } finally {
    await client.end().catch(() => undefined);
  }
}
