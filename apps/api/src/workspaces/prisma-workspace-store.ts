import type {
  WorkspaceCreatePersonalInput,
  WorkspaceListCursor,
  WorkspaceMatterLink,
  WorkspaceMemberRecord,
  WorkspaceMemberUpsertInput,
  WorkspaceRecord,
  WorkspaceStore,
  WorkspaceUpdateInput,
} from "@spectre/access";
import type { PrismaClient, PrismaTxClient } from "@spectre/db";
import { Prisma } from "@spectre/db";
import { randomUUID } from "node:crypto";

type Db = PrismaClient | PrismaTxClient;

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

function toWorkspace(row: {
  id: string;
  organizationId: string;
  ownerUserId: string;
  name: string;
  description: string | null;
  visibility: string;
  status: string;
  clientId: string | null;
  createdAt: Date;
  updatedAt: Date;
}): WorkspaceRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    ownerUserId: row.ownerUserId,
    name: row.name,
    description: row.description,
    visibility: row.visibility as WorkspaceRecord["visibility"],
    status: row.status as WorkspaceRecord["status"],
    clientId: row.clientId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toMember(row: {
  id: string;
  organizationId: string;
  workspaceId: string;
  userId: string;
  role: string;
  status: string;
}): WorkspaceMemberRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    workspaceId: row.workspaceId,
    userId: row.userId,
    role: row.role as WorkspaceMemberRecord["role"],
    status: row.status as WorkspaceMemberRecord["status"],
  };
}

/**
 * WorkspaceStore on Prisma. Use inside {@link withActorContext} / actor-scoped wrapper for RLS GUC.
 */
export function createPrismaWorkspaceStore(prisma: Db): WorkspaceStore {
  return {
    async findById(id) {
      const row = await prisma.workspace.findUnique({ where: { id } });
      return row ? toWorkspace(row) : null;
    },

    async listByOrganization(organizationId) {
      const rows = await prisma.workspace.findMany({
        where: { organizationId },
        orderBy: { updatedAt: "desc" },
      });
      return rows.map(toWorkspace);
    },

    async listContentVisible(organizationId, userId, options) {
      const limit = Math.min(Math.max(options?.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
      const cursor = options?.cursor;
      const rows = await prisma.$queryRaw<
        Array<{
          id: string;
          organization_id: string;
          owner_user_id: string;
          name: string;
          description: string | null;
          visibility: string;
          status: string;
          client_id: string | null;
          created_at: Date;
          updated_at: Date;
        }>
      >(Prisma.sql`
        SELECT w.id, w.organization_id, w.owner_user_id, w.name, w.description,
               w.visibility::text, w.status::text, w.client_id, w.created_at, w.updated_at
        FROM workspaces w
        WHERE w.organization_id = ${organizationId}::uuid
          AND (
            w.owner_user_id = ${userId}::uuid
            OR EXISTS (
              SELECT 1 FROM workspace_members m
              WHERE m.workspace_id = w.id
                AND m.organization_id = w.organization_id
                AND m.user_id = ${userId}::uuid
                AND m.status = 'ACTIVE'
            )
          )
          ${
            cursor
              ? Prisma.sql`AND (
                  w.created_at < ${cursor.createdAt}
                  OR (w.created_at = ${cursor.createdAt} AND w.id < ${cursor.id}::uuid)
                )`
              : Prisma.empty
          }
        ORDER BY w.created_at DESC, w.id DESC
        LIMIT ${limit + 1}
      `);

      const mapped = rows.slice(0, limit).map(
        (row: {
          id: string;
          organization_id: string;
          owner_user_id: string;
          name: string;
          description: string | null;
          visibility: string;
          status: string;
          client_id: string | null;
          created_at: Date;
          updated_at: Date;
        }) =>
          toWorkspace({
            id: row.id,
            organizationId: row.organization_id,
            ownerUserId: row.owner_user_id,
            name: row.name,
            description: row.description,
            visibility: row.visibility,
            status: row.status,
            clientId: row.client_id,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
          }),
      );
      const nextCursor: WorkspaceListCursor | null =
        rows.length > limit && mapped.length > 0
          ? {
              createdAt: mapped[mapped.length - 1]!.createdAt,
              id: mapped[mapped.length - 1]!.id,
            }
          : null;
      return { items: mapped, nextCursor };
    },

    async create(organizationId, ownerUserId, input: WorkspaceCreatePersonalInput) {
      const visibility = input.visibility ?? "PERSONAL";
      const row = await prisma.workspace.create({
        data: {
          organizationId,
          ownerUserId,
          name: input.name,
          description: input.description ?? null,
          visibility,
          status: "ACTIVE",
          clientId: input.clientId ?? null,
        },
      });
      return toWorkspace(row);
    },

    async update(id, input: WorkspaceUpdateInput) {
      try {
        const row = await prisma.workspace.update({
          where: { id },
          data: {
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.description !== undefined ? { description: input.description } : {}),
            ...(input.clientId !== undefined ? { clientId: input.clientId } : {}),
            ...(input.status !== undefined ? { status: input.status } : {}),
          },
        });
        return toWorkspace(row);
      } catch {
        return null;
      }
    },

    async findActiveMember(workspaceId, userId) {
      const row = await prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId } },
      });
      if (!row || row.status !== "ACTIVE") {
        return null;
      }
      return toMember(row);
    },

    async listActiveMembers(workspaceId) {
      const rows = await prisma.workspaceMember.findMany({
        where: { workspaceId, status: "ACTIVE" },
        orderBy: { createdAt: "asc" },
      });
      return rows.map(toMember);
    },

    async upsertMember(organizationId, workspaceId, input: WorkspaceMemberUpsertInput, addedByUserId) {
      const existing = await prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: input.userId } },
      });

      if (existing) {
        const row = await prisma.workspaceMember.update({
          where: { id: existing.id },
          data: {
            role: input.role,
            status: "ACTIVE",
            revokedAt: null,
            addedByUserId,
          },
        });
        return toMember(row);
      }

      const row = await prisma.workspaceMember.create({
        data: {
          id: randomUUID(),
          organizationId,
          workspaceId,
          userId: input.userId,
          role: input.role,
          status: "ACTIVE",
          addedByUserId,
        },
      });
      return toMember(row);
    },

    async revokeMember(workspaceId, userId) {
      const existing = await prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId } },
      });
      if (!existing) {
        return null;
      }
      const row = await prisma.workspaceMember.update({
        where: { id: existing.id },
        data: { status: "REVOKED", revokedAt: new Date() },
      });
      return toMember(row);
    },

    async listMatterLinks(workspaceId) {
      const rows = await prisma.workspaceMatter.findMany({
        where: { workspaceId },
        orderBy: { createdAt: "asc" },
      });
      return rows.map(
        (row: {
          organizationId: string;
          workspaceId: string;
          matterId: string;
        }): WorkspaceMatterLink => ({
          organizationId: row.organizationId,
          workspaceId: row.workspaceId,
          matterId: row.matterId,
        }),
      );
    },

    async linkMatter(organizationId, workspaceId, matterId, createdByUserId) {
      try {
        const existing = await prisma.workspaceMatter.findUnique({
          where: { workspaceId_matterId: { workspaceId, matterId } },
        });
        if (existing) {
          return {
            organizationId: existing.organizationId,
            workspaceId: existing.workspaceId,
            matterId: existing.matterId,
          };
        }
        const row = await prisma.workspaceMatter.create({
          data: {
            id: randomUUID(),
            organizationId,
            workspaceId,
            matterId,
            createdByUserId,
          },
        });
        return {
          organizationId: row.organizationId,
          workspaceId: row.workspaceId,
          matterId: row.matterId,
        };
      } catch {
        return null;
      }
    },

    async unlinkMatter(workspaceId, matterId) {
      try {
        await prisma.workspaceMatter.delete({
          where: { workspaceId_matterId: { workspaceId, matterId } },
        });
        return true;
      } catch {
        return false;
      }
    },
  };
}
