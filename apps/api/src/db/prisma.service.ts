import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import {
  assertRuntimeDatabaseRole,
  createPrismaClient,
  type PrismaClient,
  type PrismaTxClient,
  withActorContext,
  type ActorDbContext,
} from "@spectre/db";

/**
 * Dual Prisma clients for W-020:
 * - `migrator`: DATABASE_URL — auth bootstrap, outbox publish, sweeper, and
 *   workers that still read job rows outside RLS. Not removed in this slice.
 * - `runtime`: DATABASE_URL_RUNTIME — tenant queries under RLS.
 * Startup calls `assertRuntimeDatabaseRole` so a superuser or BYPASSRLS URL
 * cannot serve traffic. That check does not by itself move workers off migrator.
 */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  /** @deprecated Prefer `runtime` for tenant data; kept as alias during S1. */
  readonly client: PrismaClient;
  readonly runtime: PrismaClient;
  readonly migrator: PrismaClient;

  constructor() {
    this.migrator = createPrismaClient({ purpose: "migrator" });
    this.runtime = createPrismaClient({ purpose: "runtime" });
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
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([this.runtime.$disconnect(), this.migrator.$disconnect()]);
  }
}
