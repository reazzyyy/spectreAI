/**
 * BullMQ extract worker entrypoint.
 * Run: `pnpm --filter @spectre/api worker:extract`
 * Does not log document text (D-021 / AGENTS.md).
 */
import { Worker } from "bullmq";
import { createPrismaClient } from "@spectre/db";
import { randomUUID } from "node:crypto";
import {
  createLocalObjectStorageFromEnv,
} from "../documents/local-object-storage.js";
import { extractDocumentText } from "../documents/extract-text.js";
import { EXTRACT_TIMEOUT_MS } from "../documents/extract-limits.js";
import { EXTRACT_JOB_TYPE } from "../documents/ai-jobs.service.js";
import { AI_JOBS_QUEUE, bullmqRedisConnection } from "../queue/ai-jobs.queue.js";

async function main(): Promise<void> {
  const redisUrl = process.env.REDIS_URL?.trim();
  if (!redisUrl) {
    throw new Error("REDIS_URL is required for extract worker");
  }

  const prisma = createPrismaClient({ purpose: "migrator" });
  const storage = createLocalObjectStorageFromEnv();

  const worker = new Worker(
    AI_JOBS_QUEUE,
    async (job) => {
      const jobId = String(job.data.jobId ?? "");
      const documentId = String(job.data.documentId ?? "");
      if (!jobId || !documentId) {
        throw new Error("Invalid extract job payload");
      }

      const aiJob = await prisma.aiJob.findUnique({ where: { id: jobId } });
      if (!aiJob || aiJob.type !== EXTRACT_JOB_TYPE) {
        return;
      }
      if (
        aiJob.status === "succeeded" ||
        aiJob.status === "cancelled" ||
        aiJob.status === "failed" ||
        aiJob.status === "timed_out"
      ) {
        return;
      }

      await prisma.aiJob.update({
        where: { id: jobId },
        data: {
          status: "running",
          startedAt: new Date(),
          attemptCount: { increment: 1 },
        },
      });

      const document = await prisma.document.findUnique({ where: { id: documentId } });
      if (!document) {
        await prisma.aiJob.update({
          where: { id: jobId },
          data: {
            status: "failed",
            lastErrorCode: "DOCUMENT_NOT_FOUND",
            completedAt: new Date(),
          },
        });
        return;
      }

      const bytes = await storage.get(document.storageKey);
      const result = await Promise.race([
        extractDocumentText(bytes, document.mimeType),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("EXTRACT_TIMEOUT")), EXTRACT_TIMEOUT_MS);
        }),
      ]).catch(() => ({ ok: false as const, errorCode: "timed_out" }));

      if (!result.ok) {
        const terminal =
          result.errorCode === "timed_out" || aiJob.attemptCount + 1 >= aiJob.maxAttempts;
        const status = result.errorCode === "timed_out" ? "timed_out" : "failed";
        await prisma.aiJob.update({
          where: { id: jobId },
          data: {
            status: terminal ? status : "queued",
            lastErrorCode: result.errorCode,
            completedAt: terminal ? new Date() : null,
          },
        });
        if (terminal) {
          await prisma.document.update({
            where: { id: documentId },
            data: { status: "processing_failed" },
          });
        }
        return;
      }

      await prisma.documentExtraction.upsert({
        where: { documentId },
        create: {
          id: randomUUID(),
          organizationId: document.organizationId,
          documentId,
          aiJobId: jobId,
          charCount: result.text.length,
          pageCount: result.pageCount,
          extractor: result.extractor,
          textContent: result.text,
        },
        update: {
          aiJobId: jobId,
          charCount: result.text.length,
          pageCount: result.pageCount,
          extractor: result.extractor,
          textContent: result.text,
        },
      });

      await prisma.document.update({
        where: { id: documentId },
        data: { status: "ready" },
      });
      await prisma.aiJob.update({
        where: { id: jobId },
        data: {
          status: "succeeded",
          completedAt: new Date(),
          lastErrorCode: null,
        },
      });
    },
    { connection: bullmqRedisConnection(redisUrl), concurrency: 2 },
  );

  worker.on("failed", (job, err) => {
    console.error("extract job failed", job?.id, err.message);
  });

  const shutdown = async () => {
    await worker.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());

  console.log("extract worker listening on", AI_JOBS_QUEUE);
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
