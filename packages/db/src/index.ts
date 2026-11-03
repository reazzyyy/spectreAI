import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/client.js";

export { PrismaClient, Prisma } from "./generated/client.js";
export type {
  Organization,
  Client,
  Matter,
  User,
  OrganizationMembership,
  Session,
  Workspace,
  WorkspaceMember,
  WorkspaceMatter,
} from "./generated/client.js";
export {
  WorkspaceVisibility,
  WorkspaceStatus,
  WorkspaceMemberRole,
  WorkspaceMemberStatus,
} from "./generated/enums.js";
export {
  withActorContext,
  type ActorDbContext,
  type PrismaTxClient,
} from "./actor-context.js";

const DEFAULT_DATABASE_URL = "postgresql://spectre:spectre@localhost:5432/spectre";
const DEFAULT_RUNTIME_URL =
  "postgresql://spectre_app:spectre_app@localhost:5432/spectre";

export type PrismaClientPurpose = "migrator" | "runtime";

export interface CreatePrismaClientOptions {
  /** migrator = DDL/seed/auth bootstrap URL; runtime = RLS-enforced app role */
  purpose?: PrismaClientPurpose;
  url?: string;
}

function resolveDatabaseUrl(
  urlOrOptions?: string | CreatePrismaClientOptions,
): string {
  if (typeof urlOrOptions === "string") {
    return urlOrOptions.trim() !== ""
      ? urlOrOptions
      : (process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL);
  }

  if (urlOrOptions?.url && urlOrOptions.url.trim() !== "") {
    return urlOrOptions.url;
  }

  if (urlOrOptions?.purpose === "runtime") {
    return (
      process.env.DATABASE_URL_RUNTIME ??
      process.env.DATABASE_URL ??
      DEFAULT_RUNTIME_URL
    );
  }

  return process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
}

/**
 * Builds a Prisma 7 client with the PostgreSQL driver adapter.
 * - `purpose: "migrator"` (default): owner/migrate URL — seed, auth bootstrap, migrate deploy.
 * - `purpose: "runtime"`: `DATABASE_URL_RUNTIME` — Nest tenant queries under RLS.
 * Callers must `$disconnect()` (Nest does this via `PrismaService.onModuleDestroy`).
 */
export function createPrismaClient(
  urlOrOptions?: string | CreatePrismaClientOptions,
): PrismaClient {
  const databaseUrl = resolveDatabaseUrl(urlOrOptions);
  if (databaseUrl.trim() === "") {
    throw new Error("DATABASE_URL is required to create a Prisma client");
  }

  const adapter = new PrismaPg({ connectionString: databaseUrl });
  return new PrismaClient({ adapter });
}
