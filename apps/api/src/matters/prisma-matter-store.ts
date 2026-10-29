import type { MatterRecord, MatterStore } from "@spectre/access";
import type { PrismaClient } from "@spectre/db";

/**
 * MatterStore backed by Prisma. Loads by id only; organization isolation stays in MatterAccess.
 */
export function createPrismaMatterStore(prisma: PrismaClient): MatterStore {
  return {
    async findById(id: string): Promise<MatterRecord | null> {
      const matter = await prisma.matter.findUnique({ where: { id } });
      if (!matter) {
        return null;
      }

      return {
        id: matter.id,
        organizationId: matter.organizationId,
        title: matter.title,
        clientId: matter.clientId,
        workspaceId: matter.workspaceId,
      };
    },
  };
}
