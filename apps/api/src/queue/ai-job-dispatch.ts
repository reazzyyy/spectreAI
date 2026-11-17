import { createPrismaClient, type PrismaClient } from "@spectre/db";
import { CHAT_GENERATE_JOB_TYPE } from "../chat/chat.constants.js";
import { EXTRACT_JOB_TYPE } from "../documents/ai-jobs.service.js";

/** BullMQ name or payload type does not match the PostgreSQL AIJob row. */
export const JOB_TYPE_MISMATCH = "JOB_TYPE_MISMATCH";
/** Payload document id does not match AIJob.documentId. */
export const JOB_PAYLOAD_MISMATCH = "JOB_PAYLOAD_MISMATCH";
/** Job name is not a handler this worker knows. */
export const UNKNOWN_JOB_TYPE = "UNKNOWN_JOB_TYPE";
/** Queue message has no AIJob id. */
export const INVALID_JOB_PAYLOAD = "INVALID_JOB_PAYLOAD";
/** No AIJob row for the queue message. */
export const JOB_NOT_FOUND = "JOB_NOT_FOUND";

const TERMINAL_STATUSES = new Set(["succeeded", "cancelled", "failed", "timed_out"]);

/**
 * Routing failure. The worker must reject the BullMQ job instead of returning
 * success: a bare return marks the Redis job completed and drops the work.
 */
export class AiJobDispatchError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "AiJobDispatchError";
    this.code = code;
  }
}

export interface AiJobHandler {
  process(jobId: string): Promise<void>;
}

export interface DispatchAiJobInput {
  /** BullMQ job name. Producers set this to AIJob.type. */
  jobName: string;
  /** AIJob id from the queue payload. Tenant ids in the payload are ignored. */
  jobId: string;
  /** Optional payload copy of the type. When present it must match the row. */
  payloadType?: string;
  /** Optional payload document id. When present it must match AIJob.documentId. */
  payloadDocumentId?: string;
  extract: AiJobHandler;
  chat: AiJobHandler;
  prisma?: PrismaClient;
}

/**
 * Routes one ai-jobs delivery to the handler named by the PostgreSQL row.
 * BullMQ is transport only. A terminal row is a no-op. A mismatched or unknown
 * type is failed in PostgreSQL and rejected so Redis cannot show completed
 * while the row is still queued.
 */
export async function dispatchAiJob(input: DispatchAiJobInput): Promise<void> {
  if (input.jobId.trim() === "") {
    throw new AiJobDispatchError(INVALID_JOB_PAYLOAD);
  }

  const prisma = input.prisma ?? createPrismaClient({ purpose: "migrator" });
  const ownsClient = input.prisma === undefined;
  try {
    const aiJob = await prisma.aiJob.findUnique({ where: { id: input.jobId } });
    if (!aiJob) {
      throw new AiJobDispatchError(JOB_NOT_FOUND);
    }
    if (TERMINAL_STATUSES.has(aiJob.status)) {
      return;
    }

    const documentMismatch =
      input.payloadDocumentId !== undefined &&
      input.payloadDocumentId !== aiJob.documentId;
    if (documentMismatch) {
      await failAiJob(prisma, aiJob.id, JOB_PAYLOAD_MISMATCH);
    }

    const typeMismatch =
      input.jobName !== aiJob.type ||
      (input.payloadType !== undefined && input.payloadType !== aiJob.type);
    if (typeMismatch) {
      await failAiJob(prisma, aiJob.id, JOB_TYPE_MISMATCH);
    }

    if (aiJob.type === EXTRACT_JOB_TYPE) {
      await input.extract.process(aiJob.id);
      return;
    }
    if (aiJob.type === CHAT_GENERATE_JOB_TYPE) {
      await input.chat.process(aiJob.id);
      return;
    }
    await failAiJob(prisma, aiJob.id, UNKNOWN_JOB_TYPE);
  } finally {
    if (ownsClient) {
      await prisma.$disconnect();
    }
  }
}

/**
 * Marks a non-terminal AIJob failed and rejects the delivery.
 * Does not overwrite a terminal status that won the race.
 */
export async function failAiJob(
  prisma: PrismaClient,
  jobId: string,
  code: string,
): Promise<never> {
  await prisma.aiJob.updateMany({
    where: { id: jobId, status: { in: ["queued", "running"] } },
    data: {
      status: "failed",
      lastErrorCode: code,
      completedAt: new Date(),
    },
  });
  throw new AiJobDispatchError(code);
}
