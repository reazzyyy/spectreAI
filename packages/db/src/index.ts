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
} from "./generated/client.js";


const DEFAULT_DATABASE_URL = "postgresql://spectre:spectre@localhost:5432/spectre";

/**
 * Builds a Prisma 7 client with the PostgreSQL driver adapter.
 * Callers must `$disconnect()` (Nest does this via `PrismaService.onModuleDestroy`).
 */
export function createPrismaClient(
  databaseUrl: string = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
): PrismaClient {
  if (databaseUrl.trim() === "") {
    throw new Error("DATABASE_URL is required to create a Prisma client");
  }

  const adapter = new PrismaPg({ connectionString: databaseUrl });
  return new PrismaClient({ adapter });
}
