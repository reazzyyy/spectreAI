import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { Queue } from "bullmq";
import { createAiJobsQueue } from "./ai-jobs.queue.js";

/**
 * Owns the BullMQ Queue lifecycle so Nest `app.close()` does not hang on Redis.
 */
@Injectable()
export class AiJobsQueueProvider implements OnModuleDestroy {
  readonly queue: Queue | null;

  constructor() {
    const url = process.env.REDIS_URL?.trim();
    if (!url) {
      this.queue = null;
      return;
    }
    try {
      this.queue = createAiJobsQueue(url);
      this.queue.on("error", () => {
        // Avoid unhandled Redis error spam when Redis is absent (CI/local).
      });
    } catch {
      this.queue = null;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.queue) {
      return;
    }
    try {
      await Promise.race([
        this.queue.close(),
        new Promise((resolve) => setTimeout(resolve, 1_500)),
      ]);
    } catch {
      // ignore close errors when Redis is down
    }
  }
}
