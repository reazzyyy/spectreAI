import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from "@nestjs/common";
import type { PrismaClient } from "@spectre/db";
import { Queue } from "bullmq";
import { PrismaService } from "../db/prisma.service.js";
import { EXTRACT_JOB_TYPE } from "../documents/extract-limits.js";
import { deliverOutboxJob } from "../queue/deliver-outbox-job.js";
import { AI_JOBS_QUEUE_TOKEN } from "../queue/ai-jobs.tokens.js";
import { CHAT_GENERATE_OUTBOX_EVENT } from "./chat.constants.js";

const POLL_MS = 2_000;
const BATCH = 20;
const PUBLISH_TIMEOUT_MS = 1_500;
/** Other publishers skip a claimed row until this passes. */
export const OUTBOX_CLAIM_MS = 5_000;

/**
 * One publisher owns the row. A second process that read the same unpublished
 * event loses the compare-and-swap and must not deliver it again.
 */
export async function claimOutboxEvent(
  prisma: PrismaClient,
  event: { id: string; attemptCount: number },
  now = new Date(),
): Promise<boolean> {
  const claimed = await prisma.outboxEvent.updateMany({
    where: {
      id: event.id,
      publishedAt: null,
      attemptCount: event.attemptCount,
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
    },
    data: {
      attemptCount: { increment: 1 },
      nextAttemptAt: new Date(now.getTime() + OUTBOX_CLAIM_MS),
    },
  });
  return claimed.count === 1;
}

/**
 * Drains unpublished Outbox events into BullMQ (docs/15 §7.2 / docs/32 §8.1).
 * Uses migrator connection so unpublished rows are visible without actor GUC.
 * Payload is jobId-only — never document or prompt text.
 */
@Injectable()
export class OutboxPublisherService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(OutboxPublisherService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Optional() @Inject(AI_JOBS_QUEUE_TOKEN) private readonly queue: Queue | null,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.publishPending(BATCH, [CHAT_GENERATE_OUTBOX_EVENT, EXTRACT_JOB_TYPE]).catch(
        (error: unknown) => {
          this.log.warn(
            `outbox poll failed: ${error instanceof Error ? error.message : "unknown"}`,
          );
        },
      );
    }, POLL_MS);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Drains unpublished rows. Callers that just wrote one chat event should pass
   * that event type so an older extract row is not published instead of it.
   */
  async publishPending(
    limit = BATCH,
    eventTypes: readonly string[] = [CHAT_GENERATE_OUTBOX_EVENT, EXTRACT_JOB_TYPE],
  ): Promise<number> {
    if (!this.queue) {
      return 0;
    }
    const now = new Date();
    const events = await this.prisma.migrator.outboxEvent.findMany({
      where: {
        eventType: { in: [...eventTypes] },
        publishedAt: null,
        OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
      },
      orderBy: { createdAt: "asc" },
      take: limit,
    });

    let published = 0;
    for (const event of events) {
      const owned = await claimOutboxEvent(this.prisma.migrator, event, now);
      if (!owned) {
        continue;
      }
      try {
        const result = await Promise.race([
          deliverOutboxJob(this.queue, this.prisma.migrator, event),
          new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error("OUTBOX_PUBLISH_TIMEOUT")), PUBLISH_TIMEOUT_MS);
          }),
        ]);
        if (result !== "published") {
          throw new Error("OUTBOX_PUBLISH_FAILED");
        }
        await this.prisma.migrator.outboxEvent.updateMany({
          where: { id: event.id, publishedAt: null },
          data: { publishedAt: new Date(), lastError: null },
        });
        published += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : "publish_failed";
        await this.prisma.migrator.outboxEvent.updateMany({
          where: { id: event.id, publishedAt: null },
          data: {
            lastError: message.slice(0, 200),
            nextAttemptAt: new Date(Date.now() + 5_000),
          },
        });
      }
    }
    return published;
  }
}
