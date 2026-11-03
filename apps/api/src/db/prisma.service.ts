import { Injectable, OnModuleDestroy } from "@nestjs/common";
import {
  createPrismaClient,
  type PrismaClient,
  type PrismaTxClient,
  withActorContext,
  type ActorDbContext,
} from "@spectre/db";

/**
 * Dual Prisma clients for W-020:
 * - `migrator`: DATABASE_URL — auth bootstrap / e2e seed (table owner; temporary until DEFINER).
 * - `runtime`: DATABASE_URL_RUNTIME — tenant data under RLS + GUC.
 */
@Injectable()
export class PrismaService implements OnModuleDestroy {
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

  async onModuleDestroy(): Promise<void> {
    await Promise.all([this.runtime.$disconnect(), this.migrator.$disconnect()]);
  }
}
