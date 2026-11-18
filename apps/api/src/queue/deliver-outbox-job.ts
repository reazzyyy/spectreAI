import type { PrismaClient } from "@spectre/db";
import type { JobsOptions, Queue } from "bullmq";
import { CHAT_GENERATE_JOB_TYPE } from "../chat/chat.constants.js";
import {
  EXTRACT_JOB_TYPE,
  EXTRACT_MAX_ATTEMPTS,
  EXTRACT_RETRY_BACKOFF_MS,
} from "../documents/extract-limits.js";

const TERMINAL = new Set(["succeeded", "cancelled", "failed", "timed_out"]);

export interface OutboxDelivery {
  eventType: string;
  aggregateId: string;
  payload: unknown;
}

/**
 * Puts one outbox row onto BullMQ. Payload is jobId and type only.
 * An existing Redis job is success: the publisher crashed after add and
 * before publishedAt, and a second add must not create a second run.
 * Returns "retry" when Redis did not accept the job.
 */
export async function deliverOutboxJob(
  queue: Queue,
  prisma: PrismaClient,
  event: OutboxDelivery,
): Promise<"published" | "retry"> {
  const payload = readPayload(event.payload);
  const jobId = payload.jobId ?? event.aggregateId;
  const type = payload.type ?? event.eventType;
  if (type !== EXTRACT_JOB_TYPE && type !== CHAT_GENERATE_JOB_TYPE) {
    return "retry";
  }
  if (jobId.trim() === "") {
    return "retry";
  }

  try {
    const existing = await queue.getJob(jobId);
    if (!existing) {
      const row =
        type === EXTRACT_JOB_TYPE
          ? await prisma.aiJob.findUnique({ where: { id: jobId } })
          : null;
      if (row && TERMINAL.has(row.status)) {
        return "published";
      }
      await queue.add(type, { jobId, type }, await jobOptions(type, jobId, row?.maxAttempts));
    }
    return "published";
  } catch {
    try {
      const existing = await queue.getJob(jobId);
      if (existing) {
        return "published";
      }
    } catch {
      // Redis is still unavailable. The outbox row stays unpublished.
    }
    return "retry";
  }
}

function readPayload(payload: unknown): { jobId?: string; type?: string } {
  if (!payload || typeof payload !== "object") {
    return {};
  }
  const record = payload as { jobId?: unknown; type?: unknown };
  return {
    jobId: typeof record.jobId === "string" ? record.jobId : undefined,
    type: typeof record.type === "string" ? record.type : undefined,
  };
}

async function jobOptions(
  type: string,
  jobId: string,
  maxAttempts: number | undefined,
): Promise<JobsOptions> {
  const options: JobsOptions = {
    jobId,
    removeOnComplete: 100,
    removeOnFail: 100,
  };
  if (type === EXTRACT_JOB_TYPE) {
    options.attempts = maxAttempts && maxAttempts > 0 ? maxAttempts : EXTRACT_MAX_ATTEMPTS;
    options.backoff = { type: "exponential", delay: EXTRACT_RETRY_BACKOFF_MS };
  }
  return options;
}
