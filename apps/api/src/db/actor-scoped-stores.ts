import type {
  ClientStore,
  ConversationStore,
  DocumentStore,
  MatterStore,
  WorkspaceStore,
} from "@spectre/access";
import type { ActorDbContext } from "@spectre/db";
import { createPrismaConversationStore } from "../chat/prisma-conversation-store.js";
import { createPrismaClientStore } from "../clients/prisma-client-store.js";
import { createPrismaDocumentStore } from "../documents/prisma-document-store.js";
import { createPrismaMatterStore } from "../matters/prisma-matter-store.js";
import { createPrismaWorkspaceStore } from "../workspaces/prisma-workspace-store.js";
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

/** WorkspaceStore with RLS GUC on every call (ready for S3 HTTP). */
export function createActorScopedWorkspaceStore(
  prisma: PrismaService,
  actor: ActorDbContext | null,
): WorkspaceStore {
  return {
    async findById(id) {
      if (!actor) return null;
      return prisma.withActor(actor, (tx) => createPrismaWorkspaceStore(tx).findById(id));
    },
    async listByOrganization(organizationId) {
      if (!actor) return [];
      return prisma.withActor(actor, (tx) =>
        createPrismaWorkspaceStore(tx).listByOrganization(organizationId),
      );
    },
    async listContentVisible(organizationId, userId, options) {
      if (!actor) return { items: [], nextCursor: null };
      return prisma.withActor(actor, (tx) =>
        createPrismaWorkspaceStore(tx).listContentVisible(organizationId, userId, options),
      );
    },
    async create(organizationId, ownerUserId, input) {
      if (!actor) {
        throw new Error("Authenticated actor required to create Workspace");
      }
      return prisma.withActor(actor, (tx) =>
        createPrismaWorkspaceStore(tx).create(organizationId, ownerUserId, input),
      );
    },
    async update(id, input) {
      if (!actor) return null;
      return prisma.withActor(actor, (tx) => createPrismaWorkspaceStore(tx).update(id, input));
    },
    async findActiveMember(workspaceId, userId) {
      if (!actor) return null;
      return prisma.withActor(actor, (tx) =>
        createPrismaWorkspaceStore(tx).findActiveMember(workspaceId, userId),
      );
    },
    async listActiveMembers(workspaceId) {
      if (!actor) return [];
      return prisma.withActor(actor, (tx) =>
        createPrismaWorkspaceStore(tx).listActiveMembers(workspaceId),
      );
    },
    async upsertMember(organizationId, workspaceId, input, addedByUserId) {
      if (!actor) return null;
      return prisma.withActor(actor, (tx) =>
        createPrismaWorkspaceStore(tx).upsertMember(
          organizationId,
          workspaceId,
          input,
          addedByUserId,
        ),
      );
    },
    async revokeMember(workspaceId, userId) {
      if (!actor) return null;
      return prisma.withActor(actor, (tx) =>
        createPrismaWorkspaceStore(tx).revokeMember(workspaceId, userId),
      );
    },
    async listMatterLinks(workspaceId) {
      if (!actor) return [];
      return prisma.withActor(actor, (tx) =>
        createPrismaWorkspaceStore(tx).listMatterLinks(workspaceId),
      );
    },
    async linkMatter(organizationId, workspaceId, matterId, createdByUserId) {
      if (!actor) return null;
      return prisma.withActor(actor, (tx) =>
        createPrismaWorkspaceStore(tx).linkMatter(
          organizationId,
          workspaceId,
          matterId,
          createdByUserId,
        ),
      );
    },
    async unlinkMatter(workspaceId, matterId) {
      if (!actor) return false;
      return prisma.withActor(actor, (tx) =>
        createPrismaWorkspaceStore(tx).unlinkMatter(workspaceId, matterId),
      );
    },
  };
}

/** DocumentStore with RLS GUC on every call. */
export function createActorScopedDocumentStore(
  prisma: PrismaService,
  actor: ActorDbContext | null,
): DocumentStore {
  return {
    async findById(id) {
      if (!actor) return null;
      return prisma.withActor(actor, (tx) => createPrismaDocumentStore(tx).findById(id));
    },
    async listByWorkspace(organizationId, workspaceId, options) {
      if (!actor) return { items: [], nextCursor: null };
      return prisma.withActor(actor, (tx) =>
        createPrismaDocumentStore(tx).listByWorkspace(organizationId, workspaceId, options),
      );
    },
    async create(organizationId, workspaceId, input) {
      if (!actor) {
        throw new Error("Authenticated actor required to create Document");
      }
      return prisma.withActor(actor, (tx) =>
        createPrismaDocumentStore(tx).create(organizationId, workspaceId, input),
      );
    },
    async updateStatus(id, status) {
      if (!actor) return null;
      return prisma.withActor(actor, (tx) =>
        createPrismaDocumentStore(tx).updateStatus(id, status),
      );
    },
    async deleteById(id) {
      if (!actor) return false;
      return prisma.withActor(actor, (tx) => createPrismaDocumentStore(tx).deleteById(id));
    },
  };
}

/** ConversationStore with RLS GUC on every call (Phase 5A-2). */
export function createActorScopedConversationStore(
  prisma: PrismaService,
  actor: ActorDbContext | null,
): ConversationStore {
  return {
    async findById(id) {
      if (!actor) return null;
      return prisma.withActor(actor, (tx) =>
        createPrismaConversationStore(tx).findById(id),
      );
    },
    async listByWorkspace(organizationId, workspaceId, options) {
      if (!actor) return { items: [], nextCursor: null };
      return prisma.withActor(actor, (tx) =>
        createPrismaConversationStore(tx).listByWorkspace(
          organizationId,
          workspaceId,
          options,
        ),
      );
    },
    async create(organizationId, workspaceId, ownerUserId, createdByUserId, input) {
      if (!actor) {
        throw new Error("Authenticated actor required to create Conversation");
      }
      return prisma.withActor(actor, (tx) =>
        createPrismaConversationStore(tx).create(
          organizationId,
          workspaceId,
          ownerUserId,
          createdByUserId,
          input,
        ),
      );
    },
  };
}
