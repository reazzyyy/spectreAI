import { Inject, Injectable, Optional } from "@nestjs/common";
import { Queue } from "bullmq";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../db/prisma.service.js";
import {
  EXTRACT_MAX_ATTEMPTS,
  extractIdempotencyKey,
} from "./extract-limits.js";
import { AI_JOBS_QUEUE_TOKEN } from "../queue/ai-jobs.tokens.js";

export const EXTRACT_JOB_TYPE = "document.extract";

@Injectable()
export class AiJobsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Optional() @Inject(AI_JOBS_QUEUE_TOKEN) private readonly queue: Queue | null,
  ) {}

  /**
   * Idempotent extract enqueue (D-027). Reuses existing job for same key.
   * Uses migrator for insert so worker role bootstrap stays simple; RLS still on runtime path.
   */
  async enqueueDocumentExtract(input: {
    organizationId: string;
    workspaceId: string;
    documentId: string;
    createdByUserId: string;
  }): Promise<{ jobId: string; created: boolean }> {
    const idempotencyKey = extractIdempotencyKey(input.documentId);
    const existing = await this.prisma.migrator.aiJob.findUnique({
      where: {
        organizationId_idempotencyKey: {
          organizationId: input.organizationId,
          idempotencyKey,
        },
      },
    });
    if (existing) {
      if (existing.status === "queued" || existing.status === "running") {
        await this.publish(existing.id, input.documentId);
      }
      return { jobId: existing.id, created: false };
    }

    const jobId = randomUUID();
    await this.prisma.migrator.aiJob.create({
      data: {
        id: jobId,
        organizationId: input.organizationId,
        workspaceId: input.workspaceId,
        documentId: input.documentId,
        createdByUserId: input.createdByUserId,
        type: EXTRACT_JOB_TYPE,
        status: "queued",
        idempotencyKey,
        maxAttempts: EXTRACT_MAX_ATTEMPTS,
      },
    });
    await this.prisma.migrator.document.update({
      where: { id: input.documentId },
      data: { status: "processing" },
    });
    await this.publish(jobId, input.documentId);
    return { jobId, created: true };
  }

  private async publish(jobId: string, documentId: string): Promise<void> {
    if (!this.queue) {
      return;
    }
    await this.queue.add(
      EXTRACT_JOB_TYPE,
      { jobId, documentId },
      { jobId, removeOnComplete: 100, removeOnFail: 100 },
    );
  }
}
