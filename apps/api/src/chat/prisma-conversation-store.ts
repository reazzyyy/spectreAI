import type {
  ConversationCreateInput,
  ConversationListCursor,
  ConversationListPage,
  ConversationRecord,
  ConversationStore,
} from "@spectre/access";
import type { PrismaClient, PrismaTxClient } from "@spectre/db";
import { randomUUID } from "node:crypto";

type Db = PrismaClient | PrismaTxClient;

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

function toConversation(row: {
  id: string;
  organizationId: string;
  workspaceId: string;
  ownerUserId: string;
  createdByUserId: string;
  visibility: string;
  title: string | null;
  status: string;
  lastMessageAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): ConversationRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    workspaceId: row.workspaceId,
    ownerUserId: row.ownerUserId,
    createdByUserId: row.createdByUserId,
    visibility: row.visibility as ConversationRecord["visibility"],
    title: row.title,
    status: row.status as ConversationRecord["status"],
    lastMessageAt: row.lastMessageAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * ConversationStore on Prisma. Use inside withActor / actor-scoped wrapper for RLS GUC.
 */
export function createPrismaConversationStore(prisma: Db): ConversationStore {
  return {
    async findById(id) {
      const row = await prisma.conversation.findUnique({ where: { id } });
      return row ? toConversation(row) : null;
    },

    async listByWorkspace(organizationId, workspaceId, options) {
      const limit = Math.min(options?.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
      const cursor = options?.cursor;
      const rows = await prisma.conversation.findMany({
        where: {
          organizationId,
          workspaceId,
          ...(cursor
            ? {
                OR: [
                  { lastMessageAt: { lt: cursor.lastMessageAt ?? undefined } },
                  {
                    lastMessageAt: cursor.lastMessageAt,
                    id: { lt: cursor.id },
                  },
                  ...(cursor.lastMessageAt === null
                    ? [{ lastMessageAt: null, id: { lt: cursor.id } }]
                    : []),
                ],
              }
            : {}),
        },
        orderBy: [{ lastMessageAt: "desc" }, { id: "desc" }],
        take: limit + 1,
      });
      const page = rows.slice(0, limit).map(toConversation);
      const next: ConversationListCursor | null =
        rows.length > limit
          ? {
              lastMessageAt: page[page.length - 1]!.lastMessageAt,
              id: page[page.length - 1]!.id,
            }
          : null;
      return { items: page, nextCursor: next } satisfies ConversationListPage;
    },

    async create(organizationId, workspaceId, ownerUserId, createdByUserId, input) {
      const row = await prisma.conversation.create({
        data: {
          id: randomUUID(),
          organizationId,
          workspaceId,
          ownerUserId,
          createdByUserId,
          visibility: input.visibility,
          title: input.title ?? null,
          status: "ACTIVE",
        },
      });
      return toConversation(row);
    },
  };
}
