import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { redisConnectionFromUrl } from "../src/queue/redis-connection.js";
import { AI_JOBS_QUEUE } from "../src/queue/ai-jobs.queue.js";

describe("ai-jobs queue", () => {
  it("uses the ai-jobs queue name", () => {
    expect(AI_JOBS_QUEUE).toBe("ai-jobs");
  });

  it("reads a local redis URL without inventing credentials", () => {
    expect(redisConnectionFromUrl("redis://localhost:6379")).toEqual({
      host: "localhost",
      port: 6379,
    });
  });

  it("rejects a URL that is not redis", () => {
    expect(() => redisConnectionFromUrl("http://localhost:6379")).toThrow(
      "REDIS_URL is invalid",
    );
  });

  it("keeps extract and chat entrypoints on the shared dispatcher", () => {
    for (const file of ["extract-worker.ts", "chat-worker.ts", "ai-jobs-worker.ts"]) {
      const source = readFileSync(new URL(`../src/worker/${file}`, import.meta.url), "utf8");
      expect(source).not.toContain("new Worker");
      expect(source).toContain("runAiJobsWorker");
    }
  });
});
