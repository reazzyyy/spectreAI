import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import {
  assertAuthDatabaseRole,
  assertRuntimeDatabaseRole,
  createPrismaClient,
  type PrismaClient,
  type PrismaTxClient,
  withActorContext,
  type ActorDbContext,
} from "@spectre/db";

/**
 * Dual Prisma clients for W-020:
 * - `auth`: DATABASE_URL_AUTH — login and session resolve (D-036). Not the owner.
 * - `migrator`: DATABASE_URL — bootstrap, outbox, audit, invites, and workers.
 *   Authenticated tenant reads do not use it. Invites and job enqueue still do.
 * - `runtime`: DATABASE_URL_RUNTIME — tenant queries under RLS.
 * Startup refuses a superuser, BYPASSRLS, or table-owner URL for auth and runtime.
 */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  /** @deprecated Prefer `runtime` for tenant data; kept as alias during S1. */
  readonly client: PrismaClient;
  readonly runtime: PrismaClient;
  readonly auth: PrismaClient;
  readonly migrator: PrismaClient;

  constructor() {
    this.migrator = createPrismaClient({ purpose: "migrator" });
    this.runtime = createPrismaClient({ purpose: "runtime" });
    this.auth = createPrismaClient({ purpose: "auth" });
    this.client = this.runtime;
  }

  /**
   * Tenant queries under transaction-local actor GUC (runtime role).
   */
  withActor<T>(
    actor: ActorDbContext,
    fn: (tx: PrismaTxClient) => Promise<T>,
  ): Promise<T> {
    return withActorContext(this.runtime, actor, fn);
  }

  async onModuleInit(): Promise<void> {
    await assertRuntimeDatabaseRole();
    await assertAuthDatabaseRole();
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([
      this.runtime.$disconnect(),
      this.auth.$disconnect(),
      this.migrator.$disconnect(),
    ]);
  }
}
