import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../db/prisma.service.js";

export interface AuditWriteInput {
  organizationId?: string | null;
  actorUserId?: string | null;
  action: string;
  objectType?: string | null;
  objectId?: string | null;
  requestId?: string | null;
}

/**
 * Thin append-only audit (no document/prompt content).
 * Uses the migrator client so login and anonymous edges can write without a
 * tenant GUC. A missing organizationId is a system event: runtime RLS does not
 * return those rows to any organization. Tenant actions must pass organizationId.
 */
@Injectable()
export class AuditService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async write(input: AuditWriteInput): Promise<void> {
    const organizationId = input.organizationId ?? null;
    try {
      await this.prisma.migrator.auditEvent.create({
        data: {
          id: randomUUID(),
          organizationId,
          systemEvent: organizationId === null,
          actorUserId: input.actorUserId ?? null,
          action: input.action,
          objectType: input.objectType ?? null,
          objectId: input.objectId ?? null,
          requestId: input.requestId ?? null,
        },
      });
    } catch {
      // Audit must not break primary flows; operators watch logs separately.
    }
  }
}
