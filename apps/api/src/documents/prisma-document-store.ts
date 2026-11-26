import type {
  DocumentCreateInput,
  DocumentListCursor,
  DocumentRecord,
  DocumentStatus,
  DocumentStore,
} from "@spectre/access";
import type { PrismaTxClient } from "@spectre/db";

function mapRow(row: {
  id: string;
  organizationId: string;
  workspaceId: string;
  title: string;
  status: string;
  originalFileName: string;
  mimeType: string;
  byteSize: number;
  checksumSha256: string;
  storageKey: string;
  uploadedByUserId: string;
  createdAt: Date;
  updatedAt: Date;
}): DocumentRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    workspaceId: row.workspaceId,
    title: row.title,
    status: row.status as DocumentStatus,
    originalFileName: row.originalFileName,
    mimeType: row.mimeType,
    byteSize: row.byteSize,
    checksumSha256: row.checksumSha256,
    storageKey:
      row.status === "deletion_pending" || row.status === "deleted" ? "" : row.storageKey,
    uploadedByUserId: row.uploadedByUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

/** Prisma-backed DocumentStore; expects caller to set RLS actor GUC. */
export function createPrismaDocumentStore(tx: PrismaTxClient): DocumentStore {
  return {
    async findById(id) {
      const row = await tx.document.findUnique({ where: { id } });
      return row ? mapRow(row) : null;
    },
    async listByWorkspace(organizationId, workspaceId, options) {
      const limit = Math.min(Math.max(options?.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
      const cursor = options?.cursor;
      const rows = await tx.document.findMany({
        where: {
          organizationId,
          workspaceId,
          status: { notIn: ["uploading", "deletion_pending", "deleted"] },
          ...(cursor
            ? {
                OR: [
                  { createdAt: { lt: cursor.createdAt } },
                  { createdAt: cursor.createdAt, id: { lt: cursor.id } },
                ],
              }
            : {}),
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit + 1,
      });
      const page = rows.slice(0, limit).map(mapRow);
      const extra = rows[limit];
      const nextCursor: DocumentListCursor | null = extra
        ? { createdAt: page[page.length - 1]!.createdAt, id: page[page.length - 1]!.id }
        : null;
      return { items: page, nextCursor };
    },
    async create(organizationId, workspaceId, input: DocumentCreateInput) {
      const row = await tx.document.create({
        data: {
          ...(input.id ? { id: input.id } : {}),
          organizationId,
          workspaceId,
          title: input.title,
          status: input.status ?? "uploaded",
          originalFileName: input.originalFileName,
          mimeType: input.mimeType,
          byteSize: input.byteSize,
          checksumSha256: input.checksumSha256,
          storageKey: input.storageKey,
          uploadedByUserId: input.uploadedByUserId,
        },
      });
      const version = await tx.documentVersion.create({
        data: {
          organizationId,
          documentId: row.id,
          versionNumber: 1,
          originalFileName: row.originalFileName,
          mimeType: row.mimeType,
          byteSize: row.byteSize,
          checksumSha256: row.checksumSha256,
          storageKey: row.storageKey,
          uploadedByUserId: row.uploadedByUserId,
          searchEligible: false,
        },
      });
      await tx.document.update({
        where: { id: row.id },
        data: { currentVersionId: version.id },
      });
      return mapRow(row);
    },
    async updateStatus(id, status) {
      try {
        const row = await tx.document.update({
          where: { id },
          data: { status },
        });
        return mapRow(row);
      } catch {
        return null;
      }
    },
    async deleteById(id) {
      try {
        const existing = await tx.document.findUnique({
          where: { id },
          select: { status: true },
        });
        if (!existing || existing.status !== "uploading") {
          return false;
        }
        await tx.document.update({
          where: { id },
          data: { currentVersionId: null },
        });
        await tx.documentVersion.deleteMany({ where: { documentId: id } });
        await tx.documentExtraction.deleteMany({ where: { documentId: id } });
        await tx.document.delete({ where: { id } });
        return true;
      } catch {
        return false;
      }
    },
    async markDeletionPending(id, confirmation) {
      const existing = await tx.document.findUnique({ where: { id } });
      if (!existing || existing.status === "uploading") {
        return null;
      }
      if (existing.status === "deletion_pending" || existing.status === "deleted") {
        return mapRow(existing);
      }
      const row = await tx.document.update({
        where: { id },
        data: { status: "deletion_pending" },
      });
      await tx.deletionJournal.upsert({
        where: {
          organizationId_objectType_objectId: {
            organizationId: existing.organizationId,
            objectType: "document",
            objectId: id,
          },
        },
        create: {
          organizationId: existing.organizationId,
          objectType: "document",
          objectId: id,
          requestedByUserId: confirmation.actorUserId,
          confirmerUserId: confirmation.confirmerUserId,
          requestedAt: confirmation.requestedAt,
          purgeAfter: confirmation.purgeAfter,
        },
        update: {},
      });
      return mapRow(row);
    },
  };
}
