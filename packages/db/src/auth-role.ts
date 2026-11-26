import { Client } from "pg";

const DEFAULT_DATABASE_URL = "postgresql://spectre:spectre@localhost:5432/spectre";
const DEFAULT_AUTH_URL = "postgresql://spectre_auth:spectre_auth@localhost:5432/spectre";

/**
 * Startup refusal for the auth connection. The message is a stable code.
 * It never includes a connection string.
 */
export class AuthDatabaseRoleError extends Error {
  constructor(code: string) {
    super(code);
    this.name = code;
  }
}

/**
 * Auth URL for login and session resolve (D-036).
 * Production must set DATABASE_URL_AUTH. Local development falls back to the
 * spectre_auth scaffold, never to DATABASE_URL or DATABASE_URL_RUNTIME.
 */
export function resolveAuthDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.DATABASE_URL_AUTH?.trim() ?? "";
  if (configured !== "") {
    return configured;
  }
  const production =
    env.NODE_ENV === "production" || env.APP_ENV?.trim().toLowerCase() === "production";
  if (production) {
    throw new AuthDatabaseRoleError("AUTH_URL_REQUIRED");
  }
  return DEFAULT_AUTH_URL;
}

function connectionIdentity(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new AuthDatabaseRoleError("AUTH_URL_INVALID");
  }
  const port = parsed.port === "" ? "5432" : parsed.port;
  const database = parsed.pathname.replace(/^\//, "");
  return `${decodeURIComponent(parsed.username)}\n${parsed.hostname}\n${port}\n${database}`;
}

/**
 * Connects as the auth role and refuses the migrator, the runtime role,
 * a superuser, BYPASSRLS, or a table owner.
 */
export async function assertAuthDatabaseRole(
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const authUrl = resolveAuthDatabaseUrl(env);
  const migratorUrl = env.DATABASE_URL?.trim() || DEFAULT_DATABASE_URL;
  if (connectionIdentity(authUrl) === connectionIdentity(migratorUrl)) {
    throw new AuthDatabaseRoleError("AUTH_ROLE_MATCHES_MIGRATOR");
  }
  const runtimeUrl = env.DATABASE_URL_RUNTIME?.trim() ?? "";
  if (runtimeUrl !== "" && connectionIdentity(authUrl) === connectionIdentity(runtimeUrl)) {
    throw new AuthDatabaseRoleError("AUTH_ROLE_MATCHES_RUNTIME");
  }

  const client = new Client({ connectionString: authUrl });
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
      throw new AuthDatabaseRoleError("AUTH_ROLE_PRIVILEGED");
    }
  } catch (error) {
    if (error instanceof AuthDatabaseRoleError) {
      throw error;
    }
    throw new AuthDatabaseRoleError("AUTH_ROLE_CHECK_FAILED");
  } finally {
    await client.end().catch(() => undefined);
  }
}
