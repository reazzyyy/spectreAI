/**
 * BullMQ chat worker entrypoint.
 * Run: `pnpm --filter @spectre/api worker:chat`
 * Synthetic only (D-012). Does not log message content.
 */
import { Worker } from "bullmq";
import { ChatJobProcessor } from "../chat/chat-job.processor.js";
import { CHAT_GENERATE_JOB_TYPE } from "../chat/chat.constants.js";
import { AI_JOBS_QUEUE, bullmqRedisConnection } from "../queue/ai-jobs.queue.js";

async function main(): Promise<void> {
  const redisUrl = process.env.REDIS_URL?.trim();
  if (!redisUrl) {
    throw new Error("REDIS_URL is required for chat worker");
  }

  const processor = new ChatJobProcessor();
  const worker = new Worker(
    AI_JOBS_QUEUE,
    async (job) => {
      const jobId = String(job.data.jobId ?? "");
      const type = String(job.data.type ?? job.name ?? "");
      if (!jobId || type !== CHAT_GENERATE_JOB_TYPE) {
        return;
      }
      await processor.process(jobId);
    },
    { connection: bullmqRedisConnection(redisUrl) },
  );

  worker.on("failed", (job, error) => {
    console.error(
      `[chat-worker] job ${job?.id ?? "?"} failed: ${error.message}`,
    );
  });

  const shutdown = async () => {
    await worker.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());

  console.info(`[chat-worker] listening on queue ${AI_JOBS_QUEUE}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
