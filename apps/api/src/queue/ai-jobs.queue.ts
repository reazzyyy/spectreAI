import { Queue } from "bullmq";
import { redisConnectionFromUrl } from "./redis-connection.js";

export const AI_JOBS_QUEUE = "ai-jobs";

/**
 * Creates the AI jobs queue. Callers must `close()` it.
 * No worker is started here: document processing is not part of the scaffold.
 */
export function createAiJobsQueue(redisUrl: string): Queue {
  return new Queue(AI_JOBS_QUEUE, {
    connection: redisConnectionFromUrl(redisUrl),
  });
}
