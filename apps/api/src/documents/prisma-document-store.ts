import type {
  DocumentCreateInput,
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
    storageKey: row.storageKey,
    uploadedByUserId: row.uploadedByUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Prisma-backed DocumentStore; expects caller to set RLS actor GUC. */
export function createPrismaDocumentStore(tx: PrismaTxClient): DocumentStore {
  return {
    async findById(id) {
      const row = await tx.document.findUnique({ where: { id } });
      return row ? mapRow(row) : null;
    },
    async listByWorkspace(organizationId, workspaceId) {
      const rows = await tx.document.findMany({
        where: { organizationId, workspaceId },
        orderBy: { createdAt: "desc" },
      });
      return rows.map(mapRow);
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
      return mapRow(row);
    },
  };
}
