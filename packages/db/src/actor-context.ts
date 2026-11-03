import type { PrismaClient } from "./generated/client.js";

/**
 * Interactive-transaction client: model delegates without connection lifecycle APIs.
 * Matches Prisma 7 `$transaction(async (tx) => …)` callback argument.
 */
export type PrismaTxClient = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

/**
 * Server-resolved actor ids for PostgreSQL RLS GUC (W-020 / S0).
 * Never accept these values from the browser as proof of authority.
 */
export interface ActorDbContext {
  userId: string;
  organizationId: string;
}

/**
 * Runs `fn` inside one interactive transaction after setting transaction-local
 * `app.current_user_id` and `app.current_organization_id` via `set_config(..., true)`.
 *
 * Must use the interactive `$transaction` callback so set_config and queries share
 * one connection (pool-safe). See Prisma transaction docs + ADR-0003.
 */
export async function withActorContext<T>(
  prisma: PrismaClient,
  actor: ActorDbContext,
  fn: (tx: PrismaTxClient) => Promise<T>,
): Promise<T> {
  if (actor.userId.trim() === "" || actor.organizationId.trim() === "") {
    throw new Error("Actor context requires non-empty userId and organizationId");
  }

  return prisma.$transaction(async (tx: PrismaTxClient) => {
    await tx.$executeRaw`SELECT set_config('app.current_user_id', ${actor.userId}, true)`;
    await tx.$executeRaw`
      SELECT set_config('app.current_organization_id', ${actor.organizationId}, true)
    `;
    return fn(tx);
  });
}
