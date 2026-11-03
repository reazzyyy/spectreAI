import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { createPrismaClient, type PrismaClient } from "@spectre/db";

/**
 * Nest-managed Prisma client for the API process.
 * Disconnects on module destroy so e2e and process shutdown do not leak pools.
 */
@Injectable()
export class PrismaService implements OnModuleDestroy {
  readonly client: PrismaClient = createPrismaClient();

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}
