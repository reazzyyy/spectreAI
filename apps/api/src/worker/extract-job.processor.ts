import { createPrismaClient, type PrismaClient } from "@spectre/db";
import { randomUUID } from "node:crypto";
import {
  EXTRACT_JOB_TYPE,
  EXTRACT_RUNNING_LEASE_MS,
  EXTRACT_TIMEOUT_MS,
} from "../documents/extract-limits.js";
import {
  classifyThrownExtractError,
  ExtractRetryError,
  isPermanentExtractCode,
  PARSER_ERROR,
} from "../documents/extract-failure.js";
import {
  extractDocumentText,
  type ExtractResult,
} from "../documents/extract-text.js";
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

export interface ExtractJobProcessorOptions {
  storage?: LocalObjectStorage;
  /** Defaults to the local parser. Tests pass a function that fails or stalls. */
  extractText?: (bytes: Buffer, mimeType: string) => Promise<ExtractResult>;
  /** Defaults to D-030 (120s). The timer does not kill in-flight parser work. */
  timeoutMs?: number;
  /** Defaults to the same 120s. Tests pass a short lease for a stale running row. */
  leaseMs?: number;
}

/**
 * document.extract handler. The file id comes from AIJob, not the queue payload.
 *
 * Retry owner is BullMQ backoff plus these PostgreSQL transitions (D-011 statuses
 * only). A crash after claim leaves the row `running`; the next delivery reclaims
 * it while attempts remain, or marks `timed_out` when the lease and maxAttempts
 * are both spent, so the document does not stay `processing`. A transient error
 * sets the row back to queued and throws so BullMQ actually delivers again.
 * A parser throw is PARSER_ERROR, never timed_out.
 * The timeout is soft: late parser output cannot commit after timed_out wins
 * the compare-and-swap, but the parser call itself is not aborted.
 * Does not log extracted text.
 */
export class ExtractJobProcessor {
  private readonly storage: LocalObjectStorage;
  private readonly extractText: (bytes: Buffer, mimeType: string) => Promise<ExtractResult>;
  private readonly timeoutMs: number;
  private readonly leaseMs: number;

  constructor(options: ExtractJobProcessorOptions = {}) {
    this.storage = options.storage ?? createLocalObjectStorageFromEnv();
    this.extractText = options.extractText ?? extractDocumentText;
    this.timeoutMs = options.timeoutMs ?? EXTRACT_TIMEOUT_MS;
    this.leaseMs = options.leaseMs ?? EXTRACT_RUNNING_LEASE_MS;
  }

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
        return;
      }

      const claimed = await this.claimRunning(prisma, aiJob);
      if (claimed !== "owned") {
        return;
      }
      const running = await prisma.aiJob.findUniqueOrThrow({ where: { id: jobId } });
      const attempt = running.attemptCount;
      const maxAttempts = running.maxAttempts;

      const documentId = running.documentId;
      if (!documentId) {
        await this.failPermanent(prisma, jobId, attempt, "DOCUMENT_NOT_FOUND", null);
        return;
      }
      const document = await prisma.document.findUnique({ where: { id: documentId } });
      if (!document) {
        await this.failPermanent(prisma, jobId, attempt, "DOCUMENT_NOT_FOUND", null);
        return;
      }
      if (!document.currentVersionId) {
        await this.failPermanent(prisma, jobId, attempt, "VERSION_MISSING", documentId);
        return;
      }

      const versionId = document.currentVersionId;
      const outcome = await this.readText(document.storageKey, document.mimeType);
      if (!outcome.ok && outcome.errorCode === "timed_out") {
        await this.markTimedOut(prisma, jobId, attempt, documentId);
        void outcome.late.then(async (late) => {
          if (!late.ok) {
            return;
          }
          const lateClient = createPrismaClient({ purpose: "migrator" });
          try {
            await this.commitSuccess(lateClient, {
              jobId,
              attempt,
              documentId,
              organizationId: document.organizationId,
              versionId,
              text: late.text,
              pageCount: late.pageCount,
              extractor: late.extractor,
            });
          } catch {
            // The timeout already owns the row. Late text is discarded.
          } finally {
            await lateClient.$disconnect();
          }
        });
        return;
      }

      if (!outcome.ok) {
        await this.finishFailure(prisma, {
          jobId,
          attempt,
          maxAttempts,
          documentId,
          errorCode: outcome.errorCode,
        });
        return;
      }

      try {
        await this.commitSuccess(prisma, {
          jobId,
          attempt,
          documentId,
          organizationId: document.organizationId,
          versionId,
          text: outcome.text,
          pageCount: outcome.pageCount,
          extractor: outcome.extractor,
        });
      } catch {
        await this.finishFailure(prisma, {
          jobId,
          attempt,
          maxAttempts,
          documentId,
          errorCode: "EXTRACT_PERSIST_FAILED",
        });
      }
    } finally {
      await prisma.$disconnect();
    }
  }

  /**
   * queued → running, or reclaim a running attempt whose lease expired.
   * When maxAttempts is already spent, the stale row becomes timed_out (D-011)
   * and a document left in processing moves to processing_failed.
   * A second worker inside the lease gets "busy" and must not parse.
   */
  private async claimRunning(
    prisma: PrismaClient,
    aiJob: { id: string; maxAttempts: number; documentId: string | null },
  ): Promise<"owned" | "busy"> {
    const now = new Date();
    const staleBefore = new Date(now.getTime() - this.leaseMs);
    const staleStartedAt = [{ startedAt: null }, { startedAt: { lt: staleBefore } }];

    const queued = await prisma.aiJob.updateMany({
      where: { id: aiJob.id, status: "queued", type: EXTRACT_JOB_TYPE },
      data: {
        status: "running",
        startedAt: now,
        attemptCount: { increment: 1 },
      },
    });
    if (queued.count === 1) {
      return "owned";
    }

    const reclaimed = await prisma.aiJob.updateMany({
      where: {
        id: aiJob.id,
        type: EXTRACT_JOB_TYPE,
        status: "running",
        attemptCount: { lt: aiJob.maxAttempts },
        OR: staleStartedAt,
      },
      data: { startedAt: now, attemptCount: { increment: 1 } },
    });
    if (reclaimed.count === 1) {
      return "owned";
    }

    const expired = await prisma.aiJob.updateMany({
      where: {
        id: aiJob.id,
        type: EXTRACT_JOB_TYPE,
        status: "running",
        attemptCount: { gte: aiJob.maxAttempts },
        OR: staleStartedAt,
      },
      data: {
        status: "timed_out",
        completedAt: now,
        lastErrorCode: "timed_out",
      },
    });
    if (expired.count === 1 && aiJob.documentId) {
      await prisma.document.updateMany({
        where: { id: aiJob.documentId, status: "processing" },
        data: { status: "processing_failed" },
      });
    }
    return "busy";
  }

  private async readText(
    storageKey: string,
    mimeType: string,
  ): Promise<
    | (ExtractResult & { late: Promise<ExtractResult> })
    | { ok: false; errorCode: string; late: Promise<ExtractResult> }
  > {
    let timer: NodeJS.Timeout | undefined;
    const late = this.storage
      .get(storageKey)
      .then((bytes) => this.extractText(bytes, mimeType))
      .then(
        (result) => {
          if (timer) {
            clearTimeout(timer);
          }
          return result;
        },
        (error: unknown) => {
          if (timer) {
            clearTimeout(timer);
          }
          return {
            ok: false as const,
            errorCode: classifyThrownExtractError(error),
          };
        },
      );
    const timeout = new Promise<ExtractResult>((resolve) => {
      timer = setTimeout(() => {
        resolve({ ok: false, errorCode: "timed_out" });
      }, this.timeoutMs);
      timer.unref?.();
    });
    const result = await Promise.race([late, timeout]);
    return { ...result, late };
  }

  private async finishFailure(
    prisma: PrismaClient,
    input: {
      jobId: string;
      attempt: number;
      maxAttempts: number;
      documentId: string;
      errorCode: string;
    },
  ): Promise<void> {
    const permanent = isPermanentExtractCode(input.errorCode);
    const retry = !permanent && input.attempt < input.maxAttempts;
    const status = retry ? "queued" : "failed";
    const updated = await prisma.aiJob.updateMany({
      where: { id: input.jobId, status: "running", attemptCount: input.attempt },
      data: {
        status,
        lastErrorCode: input.errorCode,
        completedAt: retry ? null : new Date(),
      },
    });
    if (updated.count !== 1) {
      return;
    }
    if (!retry) {
      await prisma.document.update({
        where: { id: input.documentId },
        data: { status: "processing_failed" },
      });
      return;
    }
    throw new ExtractRetryError(input.errorCode || PARSER_ERROR);
  }

  private async failPermanent(
    prisma: PrismaClient,
    jobId: string,
    attempt: number,
    errorCode: string,
    documentId: string | null,
  ): Promise<void> {
    await prisma.aiJob.updateMany({
      where: { id: jobId, status: "running", attemptCount: attempt },
      data: {
        status: "failed",
        lastErrorCode: errorCode,
        completedAt: new Date(),
      },
    });
    if (documentId) {
      await prisma.document.update({
        where: { id: documentId },
        data: { status: "processing_failed" },
      });
    }
  }

  private async markTimedOut(
    prisma: PrismaClient,
    jobId: string,
    attempt: number,
    documentId: string,
  ): Promise<void> {
    const updated = await prisma.aiJob.updateMany({
      where: { id: jobId, status: "running", attemptCount: attempt },
      data: {
        status: "timed_out",
        lastErrorCode: "timed_out",
        completedAt: new Date(),
      },
    });
    if (updated.count !== 1) {
      return;
    }
    await prisma.document.update({
      where: { id: documentId },
      data: { status: "processing_failed" },
    });
  }

  /**
   * Commits extraction only while this attempt still owns the row.
   * A timeout or a second worker that already finished makes this a no-op.
   */
  private async commitSuccess(
    prisma: PrismaClient,
    input: {
      jobId: string;
      attempt: number;
      documentId: string;
      organizationId: string;
      versionId: string;
      text: string;
      pageCount: number | null;
      extractor: string;
    },
  ): Promise<void> {
    await prisma.$transaction(async (tx: PrismaClient) => {
      const won = await tx.aiJob.updateMany({
        where: { id: input.jobId, status: "running", attemptCount: input.attempt },
        data: {
          status: "succeeded",
          completedAt: new Date(),
          lastErrorCode: null,
        },
      });
      if (won.count !== 1) {
        return;
      }
      await tx.documentExtraction.upsert({
        where: { documentId: input.documentId },
        create: {
          id: randomUUID(),
          organizationId: input.organizationId,
          documentId: input.documentId,
          documentVersionId: input.versionId,
          aiJobId: input.jobId,
          charCount: input.text.length,
          pageCount: input.pageCount,
          extractor: input.extractor,
          textContent: input.text,
        },
        update: {
          documentVersionId: input.versionId,
          aiJobId: input.jobId,
          charCount: input.text.length,
          pageCount: input.pageCount,
          extractor: input.extractor,
          textContent: input.text,
        },
      });
      await tx.document.update({
        where: { id: input.documentId },
        data: { status: "ready" },
      });
    });
  }
}
