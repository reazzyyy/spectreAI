import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createPrismaClient, type PrismaClient } from "@spectre/db";
import { Queue, type Worker } from "bullmq";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { AiJobsService } from "../src/documents/ai-jobs.service.js";
import {
  classifyThrownExtractError,
  ExtractRetryError,
  isPermanentExtractCode,
  PARSER_ERROR,
  STORAGE_UNAVAILABLE,
} from "../src/documents/extract-failure.js";
import { EXTRACT_JOB_TYPE } from "../src/documents/extract-limits.js";
import {
  buildDocumentStorageKey,
  createLocalObjectStorageFromEnv,
  sha256Hex,
  type LocalObjectStorage,
} from "../src/documents/local-object-storage.js";
import { OutboxPublisherService } from "../src/chat/outbox-publisher.service.js";
import { PrismaService } from "../src/db/prisma.service.js";
import { createAiJobsQueue, bullmqRedisConnection } from "../src/queue/ai-jobs.queue.js";
import { ExtractJobProcessor } from "../src/worker/extract-job.processor.js";
import { startAiJobsWorker } from "../src/worker/start-ai-jobs-worker.js";

const redisUrl = process.env.REDIS_URL?.trim() || "redis://localhost:6379";

function blankPdf(): Buffer {
  const header = "%PDF-1.4\n";
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] >>\nendobj\n",
  ];
  let body = header;
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(body));
    body += object;
  }
  const xrefAt = Buffer.byteLength(body);
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index < offsets.length; index += 1) {
    xref += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  return Buffer.from(body + xref + trailer);
}

describe("extract failure codes", () => {
  it("does not classify a parser exception as a timeout", () => {
    expect(classifyThrownExtractError(new Error("boom"))).toBe(PARSER_ERROR);
    expect(isPermanentExtractCode("NO_TEXT_LAYER")).toBe(true);
    expect(isPermanentExtractCode(PARSER_ERROR)).toBe(false);
    expect(isPermanentExtractCode("timed_out")).toBe(false);
  });
});

describe("document.extract retry and outbox", () => {
  const orgId = randomUUID();
  const userId = randomUUID();
  const workspaceId = randomUUID();
  const previousStorageRoot = process.env.DOCUMENT_STORAGE_ROOT;
  let prisma: PrismaClient;
  let storage: LocalObjectStorage;

  beforeAll(async () => {
    process.env.DOCUMENT_STORAGE_ROOT = mkdtempSync(path.join(tmpdir(), "spectre-extract-"));
    prisma = createPrismaClient({ purpose: "migrator" });
    storage = createLocalObjectStorageFromEnv();
    await prisma.organization.create({
      data: { id: orgId, name: `extract-${orgId}`, status: "active" },
    });
    await prisma.user.create({
      data: {
        id: userId,
        email: `extract-${orgId}@localhost`,
        passwordHash: "synthetic-not-a-login",
        status: "active",
      },
    });
    await prisma.organizationMembership.create({
      data: { organizationId: orgId, userId, role: "owner", status: "active" },
    });
    await prisma.workspace.create({
      data: {
        id: workspaceId,
        organizationId: orgId,
        ownerUserId: userId,
        name: "extract",
        visibility: "PERSONAL",
        status: "ACTIVE",
      },
    });
  }, 30_000);

  afterAll(async () => {
    if (prisma) {
      await prisma.outboxEvent.deleteMany({ where: { organizationId: orgId } });
      await prisma.document.updateMany({
        where: { organizationId: orgId },
        data: { currentVersionId: null },
      });
      await prisma.documentExtraction.deleteMany({ where: { organizationId: orgId } });
      await prisma.documentVersion.deleteMany({ where: { organizationId: orgId } });
      await prisma.aiJob.deleteMany({ where: { organizationId: orgId } });
      await prisma.document.deleteMany({ where: { organizationId: orgId } });
      await prisma.workspace.deleteMany({ where: { organizationId: orgId } });
      await prisma.organizationMembership.deleteMany({ where: { organizationId: orgId } });
      await prisma.user.deleteMany({ where: { id: userId } });
      await prisma.organization.deleteMany({ where: { id: orgId } });
      await prisma.$disconnect();
    }
    if (previousStorageRoot === undefined) {
      delete process.env.DOCUMENT_STORAGE_ROOT;
    } else {
      process.env.DOCUMENT_STORAGE_ROOT = previousStorageRoot;
    }
  }, 30_000);

  async function createDocument(bytes: Buffer, mimeType: string): Promise<string> {
    const documentId = randomUUID();
    const versionId = randomUUID();
    const storageKey = buildDocumentStorageKey({
      organizationId: orgId,
      workspaceId,
      documentId,
    });
    await storage.put(storageKey, bytes);
    await prisma.document.create({
      data: {
        id: documentId,
        organizationId: orgId,
        workspaceId,
        title: "note",
        status: "uploaded",
        originalFileName: "note.bin",
        mimeType,
        byteSize: bytes.length,
        checksumSha256: sha256Hex(bytes),
        storageKey,
        uploadedByUserId: userId,
      },
    });
    await prisma.documentVersion.create({
      data: {
        id: versionId,
        organizationId: orgId,
        documentId,
        versionNumber: 1,
        originalFileName: "note.bin",
        mimeType,
        byteSize: bytes.length,
        checksumSha256: sha256Hex(bytes),
        storageKey,
        uploadedByUserId: userId,
      },
    });
    await prisma.document.update({
      where: { id: documentId },
      data: { currentVersionId: versionId },
    });
    return documentId;
  }

  async function waitFor(predicate: () => Promise<boolean>, timeoutMs = 8_000): Promise<void> {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (await predicate()) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    throw new Error("timed out waiting for extract outcome");
  }

  it("retries a transient parser failure once and stores one extraction", async () => {
    const documentId = await createDocument(Buffer.from("hello extract", "utf8"), "text/plain");
    const queueName = `extract-retry-${randomUUID()}`;
    const queue = new Queue(queueName, { connection: bullmqRedisConnection(redisUrl) });
    let calls = 0;
    let seenCode = "";
    const worker = await startAiJobsWorker({
      redisUrl,
      queueName,
      concurrency: 1,
      extract: new ExtractJobProcessor({
        storage,
        extractText: async () => {
          calls += 1;
          if (calls === 1) {
            throw new Error("parser blew up");
          }
          return { ok: true, text: "hello extract", pageCount: null, extractor: "test" };
        },
      }),
    });
    await worker.pause();
    try {
      const service = new AiJobsService(prismaService(prisma), queue);
      const { jobId } = await service.enqueueDocumentExtract({
        organizationId: orgId,
        workspaceId,
        documentId,
        createdByUserId: userId,
      });
      const outbox = await prisma.outboxEvent.findFirstOrThrow({
        where: { aggregateId: jobId, eventType: EXTRACT_JOB_TYPE },
      });
      expect(outbox.payload).toEqual({ jobId, type: EXTRACT_JOB_TYPE });
      await worker.resume();
      await waitFor(async () => {
        const row = await prisma.aiJob.findUniqueOrThrow({ where: { id: jobId } });
        if (row.lastErrorCode) {
          seenCode = row.lastErrorCode;
        }
        return row.status === "succeeded";
      });
      expect(calls).toBe(2);
      expect(seenCode).toBe(PARSER_ERROR);
      const row = await prisma.aiJob.findUniqueOrThrow({ where: { id: jobId } });
      expect(row.attemptCount).toBe(2);
      expect(row.status).not.toBe("timed_out");
      const extractions = await prisma.documentExtraction.count({ where: { documentId } });
      expect(extractions).toBe(1);
    } finally {
      await closeWorker(worker, queue);
    }
  }, 20_000);

  it("fails a textless PDF once and does not retry it", async () => {
    const documentId = await createDocument(blankPdf(), "application/pdf");
    const jobId = randomUUID();
    await prisma.aiJob.create({
      data: {
        id: jobId,
        organizationId: orgId,
        workspaceId,
        documentId,
        createdByUserId: userId,
        type: EXTRACT_JOB_TYPE,
        status: "queued",
        idempotencyKey: `extract-blank:${jobId}`,
        maxAttempts: 3,
      },
    });
    const processor = new ExtractJobProcessor({ storage });
    await processor.process(jobId);
    const row = await prisma.aiJob.findUniqueOrThrow({ where: { id: jobId } });
    expect(row.status).toBe("failed");
    expect(row.lastErrorCode).toBe("NO_TEXT_LAYER");
    expect(row.attemptCount).toBe(1);
    await processor.process(jobId);
    const again = await prisma.aiJob.findUniqueOrThrow({ where: { id: jobId } });
    expect(again.attemptCount).toBe(1);
    expect(again.status).toBe("failed");
    const document = await prisma.document.findUniqueOrThrow({ where: { id: documentId } });
    expect(document.status).toBe("processing_failed");
  }, 20_000);

  it("records a thrown parser error as PARSER_ERROR and queues a retry", async () => {
    const documentId = await createDocument(Buffer.from("plain", "utf8"), "text/plain");
    const jobId = randomUUID();
    await prisma.aiJob.create({
      data: {
        id: jobId,
        organizationId: orgId,
        workspaceId,
        documentId,
        createdByUserId: userId,
        type: EXTRACT_JOB_TYPE,
        status: "queued",
        idempotencyKey: `extract-throw:${jobId}`,
        maxAttempts: 3,
      },
    });
    const processor = new ExtractJobProcessor({
      storage,
      extractText: async () => {
        throw new Error("parser blew up");
      },
    });
    await expect(processor.process(jobId)).rejects.toBeInstanceOf(ExtractRetryError);
    const row = await prisma.aiJob.findUniqueOrThrow({ where: { id: jobId } });
    expect(row.status).toBe("queued");
    expect(row.lastErrorCode).toBe(PARSER_ERROR);
    expect(row.lastErrorCode).not.toBe("timed_out");
  }, 20_000);

  it("does not commit extraction after the soft deadline", async () => {
    const documentId = await createDocument(Buffer.from("late", "utf8"), "text/plain");
    const jobId = randomUUID();
    await prisma.aiJob.create({
      data: {
        id: jobId,
        organizationId: orgId,
        workspaceId,
        documentId,
        createdByUserId: userId,
        type: EXTRACT_JOB_TYPE,
        status: "queued",
        idempotencyKey: `extract-timeout:${jobId}`,
        maxAttempts: 3,
      },
    });
    let release: (value: { ok: true; text: string; pageCount: null; extractor: string }) => void =
      () => undefined;
    const processor = new ExtractJobProcessor({
      storage,
      timeoutMs: 40,
      extractText: () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    });
    await processor.process(jobId);
    const timedOut = await prisma.aiJob.findUniqueOrThrow({ where: { id: jobId } });
    expect(timedOut.status).toBe("timed_out");
    release({ ok: true, text: "should-not-land", pageCount: null, extractor: "late" });
    await new Promise((resolve) => setTimeout(resolve, 80));
    const row = await prisma.aiJob.findUniqueOrThrow({ where: { id: jobId } });
    expect(row.status).toBe("timed_out");
    expect(await prisma.documentExtraction.findUnique({ where: { documentId } })).toBeNull();
    const document = await prisma.document.findUniqueOrThrow({ where: { id: documentId } });
    expect(document.status).toBe("processing_failed");
  }, 20_000);

  it("keeps the AIJob and outbox when Redis refuses the first publish", async () => {
    const documentId = await createDocument(Buffer.from("from-outbox", "utf8"), "text/plain");
    const dead = createAiJobsQueue("redis://127.0.0.1:6399");
    const queueName = `extract-recover-${randomUUID()}`;
    const queue = new Queue(queueName, { connection: bullmqRedisConnection(redisUrl) });
    const worker = await startAiJobsWorker({ redisUrl, queueName, concurrency: 1 });
    await worker.pause();
    try {
      const service = new AiJobsService(prismaService(prisma), dead);
      const { jobId } = await service.enqueueDocumentExtract({
        organizationId: orgId,
        workspaceId,
        documentId,
        createdByUserId: userId,
      });
      const pending = await prisma.outboxEvent.findFirstOrThrow({
        where: { aggregateId: jobId, publishedAt: null },
      });
      expect(pending.payload).toEqual({ jobId, type: EXTRACT_JOB_TYPE });
      const row = await prisma.aiJob.findUniqueOrThrow({ where: { id: jobId } });
      expect(row.status).toBe("queued");
      await prisma.outboxEvent.update({
        where: { id: pending.id },
        data: { nextAttemptAt: null },
      });
      const publisher = new OutboxPublisherService(prismaService(prisma), queue);
      expect(await publisher.publishPending(10, [EXTRACT_JOB_TYPE])).toBe(1);
      await worker.resume();
      await waitFor(async () => {
        const current = await prisma.aiJob.findUniqueOrThrow({ where: { id: jobId } });
        return current.status === "succeeded";
      });
      expect(await prisma.documentExtraction.count({ where: { documentId } })).toBe(1);
    } finally {
      await dead.close();
      await closeWorker(worker, queue);
    }
  }, 20_000);

  it("publishes an already queued Redis job once after a crash before publishedAt", async () => {
    const documentId = await createDocument(Buffer.from("once", "utf8"), "text/plain");
    const jobId = randomUUID();
    await prisma.aiJob.create({
      data: {
        id: jobId,
        organizationId: orgId,
        workspaceId,
        documentId,
        createdByUserId: userId,
        type: EXTRACT_JOB_TYPE,
        status: "queued",
        idempotencyKey: `extract-crash:${jobId}`,
        maxAttempts: 3,
      },
    });
    await prisma.outboxEvent.create({
      data: {
        id: randomUUID(),
        organizationId: orgId,
        eventType: EXTRACT_JOB_TYPE,
        aggregateId: jobId,
        payload: { jobId, type: EXTRACT_JOB_TYPE },
      },
    });
    const queueName = `extract-once-${randomUUID()}`;
    const queue = new Queue(queueName, { connection: bullmqRedisConnection(redisUrl) });
    const worker = await startAiJobsWorker({ redisUrl, queueName, concurrency: 1 });
    await worker.pause();
    try {
      await queue.add(
        EXTRACT_JOB_TYPE,
        { jobId, type: EXTRACT_JOB_TYPE },
        { jobId, removeOnComplete: 100, removeOnFail: 100 },
      );
      const publisher = new OutboxPublisherService(prismaService(prisma), queue);
      expect(await publisher.publishPending(10, [EXTRACT_JOB_TYPE])).toBe(1);
      const counts = await queue.getJobCounts("waiting", "delayed", "active");
      expect((counts.waiting ?? 0) + (counts.delayed ?? 0) + (counts.active ?? 0)).toBe(1);
      await worker.resume();
      await waitFor(async () => {
        const row = await prisma.aiJob.findUniqueOrThrow({ where: { id: jobId } });
        return row.status === "succeeded";
      });
      expect(await prisma.documentExtraction.count({ where: { documentId } })).toBe(1);
      const published = await prisma.outboxEvent.findFirstOrThrow({ where: { aggregateId: jobId } });
      expect(published.publishedAt).toBeTruthy();
    } finally {
      await closeWorker(worker, queue);
    }
  }, 20_000);

  it("does not write an extraction after organization membership is revoked", async () => {
    const documentId = await createDocument(Buffer.from("revoked", "utf8"), "text/plain");
    await prisma.document.update({
      where: { id: documentId },
      data: { status: "processing" },
    });
    const jobId = randomUUID();
    await prisma.aiJob.create({
      data: {
        id: jobId,
        organizationId: orgId,
        workspaceId,
        documentId,
        createdByUserId: userId,
        type: EXTRACT_JOB_TYPE,
        status: "queued",
        idempotencyKey: `extract-revoked:${jobId}`,
        maxAttempts: 3,
      },
    });
    await prisma.organizationMembership.updateMany({
      where: { organizationId: orgId, userId },
      data: { status: "revoked" },
    });
    let called = false;
    const processor = new ExtractJobProcessor({
      storage,
      extractText: async () => {
        called = true;
        return { ok: true, text: "should-not-persist", pageCount: null, extractor: "test" };
      },
    });
    try {
      await processor.process(jobId);
      expect(called).toBe(false);
      expect(await prisma.documentExtraction.count({ where: { documentId } })).toBe(0);
      const row = await prisma.aiJob.findUniqueOrThrow({ where: { id: jobId } });
      expect(row.status).toBe("failed");
      expect(row.lastErrorCode).toBe("ACL_REVOKED");
      const document = await prisma.document.findUniqueOrThrow({ where: { id: documentId } });
      expect(document.status).toBe("processing_failed");
    } finally {
      await prisma.organizationMembership.updateMany({
        where: { organizationId: orgId, userId },
        data: { status: "active" },
      });
    }
  }, 20_000);

  it("reclaims a stale running extract and does not leave the document processing", async () => {
    const documentId = await createDocument(Buffer.from("stale-ok", "utf8"), "text/plain");
    await prisma.document.update({
      where: { id: documentId },
      data: { status: "processing" },
    });
    const jobId = randomUUID();
    await prisma.aiJob.create({
      data: {
        id: jobId,
        organizationId: orgId,
        workspaceId,
        documentId,
        createdByUserId: userId,
        type: EXTRACT_JOB_TYPE,
        status: "running",
        startedAt: new Date(Date.now() - 60_000),
        attemptCount: 1,
        idempotencyKey: `extract-stale:${jobId}`,
        maxAttempts: 3,
      },
    });
    const processor = new ExtractJobProcessor({
      storage,
      leaseMs: 1_000,
      extractText: async () => ({
        ok: true,
        text: "recovered",
        pageCount: null,
        extractor: "test",
      }),
    });
    await processor.process(jobId);
    const row = await prisma.aiJob.findUniqueOrThrow({ where: { id: jobId } });
    expect(row.status).toBe("succeeded");
    expect(row.attemptCount).toBe(2);
    const document = await prisma.document.findUniqueOrThrow({ where: { id: documentId } });
    expect(document.status).toBe("ready");
    expect(document.status).not.toBe("processing");
  }, 20_000);

  it("times out a stale running extract once attempts are spent", async () => {
    const documentId = await createDocument(Buffer.from("stale-dead", "utf8"), "text/plain");
    await prisma.document.update({
      where: { id: documentId },
      data: { status: "processing" },
    });
    const jobId = randomUUID();
    await prisma.aiJob.create({
      data: {
        id: jobId,
        organizationId: orgId,
        workspaceId,
        documentId,
        createdByUserId: userId,
        type: EXTRACT_JOB_TYPE,
        status: "running",
        startedAt: new Date(Date.now() - 60_000),
        attemptCount: 3,
        idempotencyKey: `extract-stale-out:${jobId}`,
        maxAttempts: 3,
      },
    });
    let called = false;
    const processor = new ExtractJobProcessor({
      storage,
      leaseMs: 1_000,
      extractText: async () => {
        called = true;
        return { ok: true, text: "nope", pageCount: null, extractor: "test" };
      },
    });
    await processor.process(jobId);
    expect(called).toBe(false);
    const row = await prisma.aiJob.findUniqueOrThrow({ where: { id: jobId } });
    expect(row.status).toBe("timed_out");
    expect(row.lastErrorCode).toBe("timed_out");
    const document = await prisma.document.findUniqueOrThrow({ where: { id: documentId } });
    expect(document.status).toBe("processing_failed");
  }, 20_000);

  it("lets only one of two overlapping claims write the extraction", async () => {
    const documentId = await createDocument(Buffer.from("single", "utf8"), "text/plain");
    const jobId = randomUUID();
    await prisma.aiJob.create({
      data: {
        id: jobId,
        organizationId: orgId,
        workspaceId,
        documentId,
        createdByUserId: userId,
        type: EXTRACT_JOB_TYPE,
        status: "queued",
        idempotencyKey: `extract-claim:${jobId}`,
        maxAttempts: 3,
      },
    });
    let release: () => void = () => undefined;
    let started = 0;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const processor = new ExtractJobProcessor({
      storage,
      extractText: async () => {
        started += 1;
        if (started === 1) {
          await gate;
        }
        return { ok: true, text: "single", pageCount: null, extractor: "test" };
      },
    });
    const first = processor.process(jobId);
    await waitFor(async () => started === 1);
    await processor.process(jobId);
    expect(started).toBe(1);
    release();
    await first;
    const row = await prisma.aiJob.findUniqueOrThrow({ where: { id: jobId } });
    expect(row.status).toBe("succeeded");
    expect(row.attemptCount).toBe(1);
    expect(await prisma.documentExtraction.count({ where: { documentId } })).toBe(1);
  }, 20_000);

  it("stops after maxAttempts instead of leaving the job queued", async () => {
    const documentId = await createDocument(Buffer.from("missing-body", "utf8"), "text/plain");
    await storage.delete(
      (
        await prisma.document.findUniqueOrThrow({ where: { id: documentId } })
      ).storageKey,
    );
    const queueName = `extract-exhausted-${randomUUID()}`;
    const queue = new Queue(queueName, { connection: bullmqRedisConnection(redisUrl) });
    const worker = await startAiJobsWorker({ redisUrl, queueName, concurrency: 1 });
    await worker.pause();
    try {
      const service = new AiJobsService(prismaService(prisma), queue);
      const { jobId } = await service.enqueueDocumentExtract({
        organizationId: orgId,
        workspaceId,
        documentId,
        createdByUserId: userId,
      });
      await worker.resume();
      await waitFor(async () => {
        const row = await prisma.aiJob.findUniqueOrThrow({ where: { id: jobId } });
        return row.status === "failed";
      });
      const row = await prisma.aiJob.findUniqueOrThrow({ where: { id: jobId } });
      expect(row.attemptCount).toBe(3);
      expect(row.lastErrorCode).toBe(STORAGE_UNAVAILABLE);
      expect(row.status).not.toBe("queued");
      const document = await prisma.document.findUniqueOrThrow({ where: { id: documentId } });
      expect(document.status).toBe("processing_failed");
      expect(await prisma.documentExtraction.count({ where: { documentId } })).toBe(0);
    } finally {
      await closeWorker(worker, queue);
    }
  }, 20_000);
});

function prismaService(prisma: PrismaClient): PrismaService {
  return { migrator: prisma } as PrismaService;
}

async function closeWorker(worker: Worker, queue: Queue): Promise<void> {
  await worker.close();
  await queue.obliterate({ force: true }).catch(() => undefined);
  await queue.close();
}
