import { Inject, Injectable, Optional } from "@nestjs/common";
import { Queue } from "bullmq";
import { randomUUID } from "node:crypto";
import type { PrismaTxClient } from "@spectre/db";
import { PrismaService } from "../db/prisma.service.js";
import {
  EXTRACT_JOB_TYPE,
  EXTRACT_MAX_ATTEMPTS,
  extractIdempotencyKey,
} from "./extract-limits.js";
import { AI_JOBS_QUEUE_TOKEN } from "../queue/ai-jobs.tokens.js";
import { deliverOutboxJob } from "../queue/deliver-outbox-job.js";

export { EXTRACT_JOB_TYPE } from "./extract-limits.js";
const PUBLISH_TIMEOUT_MS = 1_500;

@Injectable()
export class AiJobsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Optional() @Inject(AI_JOBS_QUEUE_TOKEN) private readonly queue: Queue | null,
  ) {}

  /**
   * Idempotent extract enqueue (D-027). The AIJob and outbox row commit together.
   * Redis publish is best-effort. An unpublished outbox row is the recovery path
   * when Redis is down. The payload is jobId and type only — never file text.
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
      if (existing.status === "queued") {
        await this.ensureOutbox(existing.id, input.organizationId);
        await this.publish(existing.id);
      }
      return { jobId: existing.id, created: false };
    }

    const jobId = randomUUID();
    const outboxId = randomUUID();
    await this.prisma.migrator.$transaction(async (tx: PrismaTxClient) => {
      await tx.aiJob.create({
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
      await tx.document.update({
        where: { id: input.documentId },
        data: { status: "processing" },
      });
      await tx.outboxEvent.create({
        data: {
          id: outboxId,
          organizationId: input.organizationId,
          eventType: EXTRACT_JOB_TYPE,
          aggregateId: jobId,
          payload: { jobId, type: EXTRACT_JOB_TYPE },
        },
      });
    });
    await this.publish(jobId);
    return { jobId, created: true };
  }

  private async ensureOutbox(jobId: string, organizationId: string): Promise<void> {
    const pending = await this.prisma.migrator.outboxEvent.findFirst({
      where: { aggregateId: jobId, eventType: EXTRACT_JOB_TYPE, publishedAt: null },
    });
    if (pending) {
      return;
    }
    await this.prisma.migrator.outboxEvent.create({
      data: {
        id: randomUUID(),
        organizationId,
        eventType: EXTRACT_JOB_TYPE,
        aggregateId: jobId,
        payload: { jobId, type: EXTRACT_JOB_TYPE },
      },
    });
  }

  /**
   * Publishes the newest unpublished extract outbox row for this job.
   * Failure leaves publishedAt null so the poller can try again.
   */
  private async publish(jobId: string): Promise<void> {
    if (!this.queue) {
      return;
    }
    const event = await this.prisma.migrator.outboxEvent.findFirst({
      where: { aggregateId: jobId, eventType: EXTRACT_JOB_TYPE, publishedAt: null },
      orderBy: { createdAt: "desc" },
    });
    if (!event) {
      return;
    }
    try {
      const result = await Promise.race([
        deliverOutboxJob(this.queue, this.prisma.migrator, event),
        new Promise<never>((_, reject) => {
          setTimeout(
            () => reject(new Error("AI_JOBS_PUBLISH_TIMEOUT")),
            PUBLISH_TIMEOUT_MS,
          );
        }),
      ]);
      if (result !== "published") {
        throw new Error("AI_JOBS_PUBLISH_FAILED");
      }
      await this.prisma.migrator.outboxEvent.update({
        where: { id: event.id },
        data: {
          publishedAt: new Date(),
          attemptCount: { increment: 1 },
          lastError: null,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "publish_failed";
      await this.prisma.migrator.outboxEvent.update({
        where: { id: event.id },
        data: {
          attemptCount: { increment: 1 },
          lastError: message.slice(0, 200),
          nextAttemptAt: new Date(Date.now() + 5_000),
        },
      });
    }
  }
}
