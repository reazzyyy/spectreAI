import { createPrismaClient } from "@spectre/db";
import { randomUUID } from "node:crypto";
import { EXTRACT_JOB_TYPE } from "../documents/ai-jobs.service.js";
import { EXTRACT_TIMEOUT_MS } from "../documents/extract-limits.js";
import { extractDocumentText } from "../documents/extract-text.js";
import {
  createLocalObjectStorageFromEnv,
  type LocalObjectStorage,
} from "../documents/local-object-storage.js";
import {
  AiJobDispatchError,
  failAiJob,
  JOB_NOT_FOUND,
  JOB_TYPE_MISMATCH,
} from "../queue/ai-job-dispatch.js";

const TERMINAL_STATUSES = new Set(["succeeded", "cancelled", "failed", "timed_out"]);

/**
 * document.extract handler. Reads the file id from AIJob, not from the queue
 * payload. Retry/timeout behaviour is unchanged in this slice (P0-02).
 * Does not log extracted text.
 */
export class ExtractJobProcessor {
  constructor(
    private readonly storage: LocalObjectStorage = createLocalObjectStorageFromEnv(),
  ) {}

  async process(jobId: string): Promise<void> {
    const prisma = createPrismaClient({ purpose: "migrator" });
    try {
      const aiJob = await prisma.aiJob.findUnique({ where: { id: jobId } });
      if (!aiJob) {
        throw new AiJobDispatchError(JOB_NOT_FOUND);
      }
      if (TERMINAL_STATUSES.has(aiJob.status)) {
        return;
      }
      if (aiJob.type !== EXTRACT_JOB_TYPE) {
        await failAiJob(prisma, jobId, JOB_TYPE_MISMATCH);
      }

      await prisma.aiJob.update({
        where: { id: jobId },
        data: {
          status: "running",
          startedAt: new Date(),
          attemptCount: { increment: 1 },
        },
      });

      const documentId = aiJob.documentId;
      if (!documentId) {
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

      if (!document.currentVersionId) {
        await prisma.aiJob.update({
          where: { id: jobId },
          data: {
            status: "failed",
            lastErrorCode: "VERSION_MISSING",
            completedAt: new Date(),
          },
        });
        await prisma.document.update({
          where: { id: documentId },
          data: { status: "processing_failed" },
        });
        return;
      }

      const bytes = await this.storage.get(document.storageKey);
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
          documentVersionId: document.currentVersionId,
          aiJobId: jobId,
          charCount: result.text.length,
          pageCount: result.pageCount,
          extractor: result.extractor,
          textContent: result.text,
        },
        update: {
          documentVersionId: document.currentVersionId,
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
    } finally {
      await prisma.$disconnect();
    }
  }
}
