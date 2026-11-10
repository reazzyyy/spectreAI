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
 * Thin append-only audit (no document/prompt content). Uses migrator client so
 * login/unauthenticated edges can record events without RLS actor GUC.
 */
@Injectable()
export class AuditService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async write(input: AuditWriteInput): Promise<void> {
    try {
      await this.prisma.migrator.auditEvent.create({
        data: {
          id: randomUUID(),
          organizationId: input.organizationId ?? null,
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
