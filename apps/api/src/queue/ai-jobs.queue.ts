import { Queue } from "bullmq";
import { redisConnectionFromUrl } from "./redis-connection.js";

export const AI_JOBS_QUEUE = "ai-jobs";

/**
 * BullMQ producer options that fail fast when Redis is down.
 * CI historically sets REDIS_URL without a Redis service — commands must not hang.
 */
export function bullmqRedisConnection(redisUrl: string) {
  const base = redisConnectionFromUrl(redisUrl);
  return {
    ...base,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: 1_000,
    retryStrategy: () => null,
    lazyConnect: false,
  };
}

/**
 * Creates the AI jobs queue. Callers must `close()` it (Nest provider does this).
 */
export function createAiJobsQueue(redisUrl: string): Queue {
  return new Queue(AI_JOBS_QUEUE, {
    connection: bullmqRedisConnection(redisUrl),
  });
}
