import { Worker, type Job } from "bullmq";
import { ChatJobProcessor } from "../chat/chat-job.processor.js";
import {
  AiJobDispatchError,
  dispatchAiJob,
} from "../queue/ai-job-dispatch.js";
import { AI_JOBS_QUEUE, bullmqRedisConnection } from "../queue/ai-jobs.queue.js";
import type { AiJobHandler } from "../queue/ai-job-dispatch.js";
import { ExtractJobProcessor } from "./extract-job.processor.js";

/**
 * A missing field stays undefined. A non-string value becomes "" so it cannot
 * match the server-side AIJob row and the dispatcher fails closed.
 */
function optionalPayloadString(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return typeof value === "string" ? value : "";
}

export interface StartAiJobsWorkerOptions {
  redisUrl: string;
  /**
   * Production uses `ai-jobs`. Tests pass a private name so they do not
   * compete with a developer worker on the shared queue.
   */
  queueName?: string;
  concurrency?: number;
  /** Test seam. Production uses ExtractJobProcessor. */
  extract?: AiJobHandler;
}

/**
 * One consumer for the shared ai-jobs queue.
 * Both document.extract and chat.generate are handled here. A second process
 * started from worker:extract or worker:chat runs this same dispatcher, so it
 * cannot acknowledge a foreign job by returning early.
 */
export async function startAiJobsWorker(
  options: StartAiJobsWorkerOptions,
): Promise<Worker> {
  const queueName = options.queueName ?? AI_JOBS_QUEUE;
  const extract = options.extract ?? new ExtractJobProcessor();
  const chat = new ChatJobProcessor();
  const worker = new Worker(
    queueName,
    async (job: Job) => {
      const data = (job.data ?? {}) as Record<string, unknown>;
      const jobId = typeof data.jobId === "string" ? data.jobId : "";
      const payloadType = optionalPayloadString(data.type);
      const payloadDocumentId = optionalPayloadString(data.documentId);
      await dispatchAiJob({
        jobName: job.name,
        jobId,
        payloadType,
        payloadDocumentId,
        extract,
        chat,
      });
    },
    {
      connection: bullmqRedisConnection(options.redisUrl),
      concurrency: options.concurrency ?? 2,
    },
  );

  worker.on("failed", (job, error) => {
    const code = error instanceof AiJobDispatchError ? error.code : error.name;
    console.error(`[ai-jobs-worker] job ${job?.id ?? "?"} failed: ${code}`);
  });

  await worker.waitUntilReady();
  return worker;
}

/**
 * Blocks the process on the shared dispatcher until SIGINT/SIGTERM.
 * Requires REDIS_URL. Does not read tenant ids or document text from the environment.
 */
export async function runAiJobsWorker(): Promise<void> {
  const redisUrl = process.env.REDIS_URL?.trim();
  if (!redisUrl) {
    throw new Error("REDIS_URL is required for ai-jobs worker");
  }
  const worker = await startAiJobsWorker({ redisUrl });
  console.info(`[ai-jobs-worker] listening on queue ${AI_JOBS_QUEUE}`);

  const shutdown = async () => {
    await worker.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}
