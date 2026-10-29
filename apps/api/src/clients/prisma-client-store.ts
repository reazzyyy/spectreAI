import type { ClientCreateInput, ClientRecord, ClientStore, ClientUpdateInput } from "@spectre/access";
import type { PrismaClient } from "@spectre/db";

function toRecord(client: {
  id: string;
  organizationId: string;
  name: string;
  status: string;
}): ClientRecord {
  return {
    id: client.id,
    organizationId: client.organizationId,
    name: client.name,
    status: client.status,
  };
}

/**
 * ClientStore backed by Prisma. Organization isolation stays in ClientAccess.
 */
export function createPrismaClientStore(prisma: PrismaClient): ClientStore {
  return {
    async findById(id: string): Promise<ClientRecord | null> {
      const client = await prisma.client.findUnique({ where: { id } });
      return client ? toRecord(client) : null;
    },

    async listByOrganization(organizationId: string): Promise<ClientRecord[]> {
      const rows = await prisma.client.findMany({
        where: { organizationId },
        orderBy: { createdAt: "asc" },
      });
      return rows.map(toRecord);
    },

    async create(organizationId: string, input: ClientCreateInput): Promise<ClientRecord> {
      const client = await prisma.client.create({
        data: {
          organizationId,
          name: input.name,
          status: input.status ?? "active",
        },
      });
      return toRecord(client);
    },

    async update(id: string, input: ClientUpdateInput): Promise<ClientRecord | null> {
      try {
        const client = await prisma.client.update({
          where: { id },
          data: {
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.status !== undefined ? { status: input.status } : {}),
          },
        });
        return toRecord(client);
      } catch {
        return null;
      }
    },
  };
}
