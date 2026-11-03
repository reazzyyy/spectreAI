import type { ClientStore, MatterStore } from "@spectre/access";
import type { ActorDbContext } from "@spectre/db";
import { createPrismaClientStore } from "../clients/prisma-client-store.js";
import { createPrismaMatterStore } from "../matters/prisma-matter-store.js";
import type { PrismaService } from "./prisma.service.js";

/**
 * ClientStore that sets RLS actor GUC on the runtime connection for every call.
 * When actor is null (unauthenticated), methods return empty/null without hitting tenant tables.
 */
export function createActorScopedClientStore(
  prisma: PrismaService,
  actor: ActorDbContext | null,
): ClientStore {
  return {
    async findById(id) {
      if (!actor) return null;
      return prisma.withActor(actor, (tx) => createPrismaClientStore(tx).findById(id));
    },
    async listByOrganization(organizationId) {
      if (!actor) return [];
      return prisma.withActor(actor, (tx) =>
        createPrismaClientStore(tx).listByOrganization(organizationId),
      );
    },
    async create(organizationId, input) {
      if (!actor) {
        throw new Error("Authenticated actor required to create Client");
      }
      return prisma.withActor(actor, (tx) =>
        createPrismaClientStore(tx).create(organizationId, input),
      );
    },
    async update(id, input) {
      if (!actor) return null;
      return prisma.withActor(actor, (tx) => createPrismaClientStore(tx).update(id, input));
    },
  };
}

/** MatterStore with the same RLS GUC wrapping as {@link createActorScopedClientStore}. */
export function createActorScopedMatterStore(
  prisma: PrismaService,
  actor: ActorDbContext | null,
): MatterStore {
  return {
    async findById(id) {
      if (!actor) return null;
      return prisma.withActor(actor, (tx) => createPrismaMatterStore(tx).findById(id));
    },
    async listByOrganization(organizationId) {
      if (!actor) return [];
      return prisma.withActor(actor, (tx) =>
        createPrismaMatterStore(tx).listByOrganization(organizationId),
      );
    },
    async create(organizationId, input) {
      if (!actor) {
        throw new Error("Authenticated actor required to create Matter");
      }
      return prisma.withActor(actor, (tx) =>
        createPrismaMatterStore(tx).create(organizationId, input),
      );
    },
    async update(id, input) {
      if (!actor) return null;
      return prisma.withActor(actor, (tx) => createPrismaMatterStore(tx).update(id, input));
    },
  };
}
