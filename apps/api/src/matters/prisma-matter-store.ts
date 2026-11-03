import type { MatterCreateInput, MatterRecord, MatterStore, MatterUpdateInput } from "@spectre/access";
import type { PrismaClient } from "@spectre/db";

function toRecord(matter: {
  id: string;
  organizationId: string;
  title: string;
  clientId: string | null;
  workspaceId: string | null;
  status: string;
}): MatterRecord {
  return {
    id: matter.id,
    organizationId: matter.organizationId,
    title: matter.title,
    clientId: matter.clientId,
    workspaceId: matter.workspaceId,
    status: matter.status,
  };
}

/**
 * MatterStore backed by Prisma. Loads/writes by id; organization isolation stays in MatterAccess.
 */
export function createPrismaMatterStore(prisma: PrismaClient): MatterStore {
  return {
    async findById(id: string): Promise<MatterRecord | null> {
      const matter = await prisma.matter.findUnique({ where: { id } });
      return matter ? toRecord(matter) : null;
    },

    async listByOrganization(organizationId: string): Promise<MatterRecord[]> {
      const rows = await prisma.matter.findMany({
        where: { organizationId },
        orderBy: { createdAt: "asc" },
      });
      return rows.map(toRecord);
    },

    async create(organizationId: string, input: MatterCreateInput): Promise<MatterRecord> {
      const matter = await prisma.matter.create({
        data: {
          organizationId,
          title: input.title,
          clientId: input.clientId ?? null,
          workspaceId: input.workspaceId ?? null,
          status: input.status ?? "active",
        },
      });
      return toRecord(matter);
    },

    async update(id: string, input: MatterUpdateInput): Promise<MatterRecord | null> {
      try {
        const matter = await prisma.matter.update({
          where: { id },
          data: {
            ...(input.title !== undefined ? { title: input.title } : {}),
            ...(input.clientId !== undefined ? { clientId: input.clientId } : {}),
            ...(input.workspaceId !== undefined ? { workspaceId: input.workspaceId } : {}),
            ...(input.status !== undefined ? { status: input.status } : {}),
          },
        });
        return toRecord(matter);
      } catch {
        return null;
      }
    },
  };
}
