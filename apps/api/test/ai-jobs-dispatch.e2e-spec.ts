import "reflect-metadata";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createPrismaClient, type PrismaClient } from "@spectre/db";
import { Job, Queue, QueueEvents, type Worker } from "bullmq";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  buildDocumentStorageKey,
  createLocalObjectStorageFromEnv,
  sha256Hex,
  type LocalObjectStorage,
} from "../src/documents/local-object-storage.js";
import { CHAT_GENERATE_JOB_TYPE } from "../src/chat/chat.constants.js";
import { EXTRACT_JOB_TYPE } from "../src/documents/ai-jobs.service.js";
import {
  INVALID_JOB_PAYLOAD,
  JOB_PAYLOAD_MISMATCH,
  JOB_TYPE_MISMATCH,
  UNKNOWN_JOB_TYPE,
} from "../src/queue/ai-job-dispatch.js";
import { bullmqRedisConnection } from "../src/queue/ai-jobs.queue.js";
import { startAiJobsWorker } from "../src/worker/start-ai-jobs-worker.js";

const EXTRACT_COUNT = 20;
const CHAT_COUNT = 20;
const redisUrl = process.env.REDIS_URL?.trim() || "redis://localhost:6379";

describe("ai-jobs shared dispatcher", () => {
  const orgId = randomUUID();
  const userId = randomUUID();
  const workspaceId = randomUUID();
  const conversationId = randomUUID();
  const queueName = `ai-jobs-it-${orgId}`;
  const previousStorageRoot = process.env.DOCUMENT_STORAGE_ROOT;
  let prisma: PrismaClient;
  let storage: LocalObjectStorage;
  let queue: Queue;
  let events: QueueEvents;
  let workers: Worker[] = [];
  let firstCompletions = 0;
  let secondCompletions = 0;

  beforeAll(async () => {
    process.env.DOCUMENT_STORAGE_ROOT = mkdtempSync(
      path.join(tmpdir(), "spectre-dispatch-"),
    );
    prisma = createPrismaClient({ purpose: "migrator" });
    storage = createLocalObjectStorageFromEnv();
    await prisma.organization.create({
      data: { id: orgId, name: `dispatch-${orgId}`, status: "active" },
    });
    await prisma.user.create({
      data: {
        id: userId,
        email: `dispatch-${orgId}@localhost`,
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
        name: "dispatch",
        visibility: "PERSONAL",
        status: "ACTIVE",
      },
    });
    await prisma.conversation.create({
      data: {
        id: conversationId,
        organizationId: orgId,
        workspaceId,
        ownerUserId: userId,
        createdByUserId: userId,
        visibility: "PRIVATE",
        status: "ACTIVE",
      },
    });

    const connection = bullmqRedisConnection(redisUrl);
    queue = new Queue(queueName, { connection });
    queue.setMaxListeners(40);
    events = new QueueEvents(queueName, { connection: bullmqRedisConnection(redisUrl) });
    events.setMaxListeners(40);
    await events.waitUntilReady();
    workers = await Promise.all([
      startAiJobsWorker({ redisUrl, queueName, concurrency: 2 }),
      startAiJobsWorker({ redisUrl, queueName, concurrency: 2 }),
    ]);
    workers[0]!.on("completed", () => {
      firstCompletions += 1;
    });
    workers[1]!.on("completed", () => {
      secondCompletions += 1;
    });
  }, 30_000);

  afterAll(async () => {
    await Promise.all(workers.map((worker) => worker.close()));
    if (queue) {
      await queue.obliterate({ force: true });
      await queue.close();
    }
    if (events) {
      await events.close();
    }
    if (prisma) {
      await prisma.messageSource.deleteMany({ where: { organizationId: orgId } });
      await prisma.contextSnapshotItem.deleteMany({ where: { organizationId: orgId } });
      await prisma.aiGeneration.updateMany({
        where: { organizationId: orgId },
        data: { contextSnapshotId: null, assistantMessageId: null },
      });
      await prisma.contextSnapshot.deleteMany({ where: { organizationId: orgId } });
      await prisma.message.updateMany({
        where: { organizationId: orgId },
        data: { generationId: null },
      });
      await prisma.aiGeneration.deleteMany({ where: { organizationId: orgId } });
      await prisma.message.deleteMany({ where: { organizationId: orgId } });
      await prisma.conversation.deleteMany({ where: { organizationId: orgId } });
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

  async function settle(job: Job): Promise<string> {
    try {
      await job.waitUntilFinished(events, 60_000);
    } catch {
      // A rejected delivery settles as failed. The Redis state is the assertion.
    }
    return job.getState();
  }

  async function createExtractJob(marker: string): Promise<{ jobId: string; documentId: string }> {
    const documentId = randomUUID();
    const versionId = randomUUID();
    const jobId = randomUUID();
    const bytes = Buffer.from(marker, "utf8");
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
        title: marker,
        status: "processing",
        originalFileName: "note.txt",
        mimeType: "text/plain",
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
        originalFileName: "note.txt",
        mimeType: "text/plain",
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
    await prisma.aiJob.create({
      data: {
        id: jobId,
        organizationId: orgId,
        workspaceId,
        documentId,
        createdByUserId: userId,
        type: EXTRACT_JOB_TYPE,
        status: "queued",
        idempotencyKey: `dispatch:${jobId}`,
        maxAttempts: 3,
      },
    });
    return { jobId, documentId };
  }

  async function createChatJob(content: string): Promise<string> {
    const messageId = randomUUID();
    const jobId = randomUUID();
    await prisma.message.create({
      data: {
        id: messageId,
        organizationId: orgId,
        conversationId,
        role: "user",
        content,
        createdByUserId: userId,
      },
    });
    await prisma.aiJob.create({
      data: {
        id: jobId,
        organizationId: orgId,
        workspaceId,
        createdByUserId: userId,
        type: CHAT_GENERATE_JOB_TYPE,
        status: "queued",
        idempotencyKey: `dispatch:${jobId}`,
        maxAttempts: 3,
      },
    });
    await prisma.aiGeneration.create({
      data: {
        id: randomUUID(),
        organizationId: orgId,
        conversationId,
        userMessageId: messageId,
        aiJobId: jobId,
        status: "queued",
      },
    });
    return jobId;
  }

  it("runs extract and chat on two consumers without dropping either type", async () => {
    const extracts = await Promise.all(
      Array.from({ length: EXTRACT_COUNT }, (_, index) =>
        createExtractJob(`extract-body-${index}`),
      ),
    );
    const chatIds = await Promise.all(
      Array.from({ length: CHAT_COUNT }, (_, index) =>
        createChatJob(`synthetic chat ${index}`),
      ),
    );

    await workers[0]!.pause();
    await workers[1]!.pause();
    let extractJobs: Job[] = [];
    let chatJobs: Job[] = [];
    try {
      extractJobs = await Promise.all(
        extracts.map((item) =>
          queue.add(
            EXTRACT_JOB_TYPE,
            { jobId: item.jobId, documentId: item.documentId, type: EXTRACT_JOB_TYPE },
            { jobId: item.jobId },
          ),
        ),
      );
      chatJobs = await Promise.all(
        chatIds.map((jobId) =>
          queue.add(
            CHAT_GENERATE_JOB_TYPE,
            { jobId, type: CHAT_GENERATE_JOB_TYPE },
            { jobId },
          ),
        ),
      );
    } finally {
      await workers[0]!.resume();
      await workers[1]!.resume();
    }

    const states = await Promise.all([...extractJobs, ...chatJobs].map((job) => settle(job)));
    expect(states.every((state) => state === "completed")).toBe(true);
    expect(firstCompletions).toBeGreaterThan(0);
    expect(secondCompletions).toBeGreaterThan(0);

    for (const [index, item] of extracts.entries()) {
      const row = await prisma.aiJob.findUniqueOrThrow({ where: { id: item.jobId } });
      expect(row.status).toBe("succeeded");
      const document = await prisma.document.findUniqueOrThrow({
        where: { id: item.documentId },
      });
      expect(document.status).toBe("ready");
      const extraction = await prisma.documentExtraction.findUniqueOrThrow({
        where: { documentId: item.documentId },
      });
      expect(extraction.textContent).toBe(`extract-body-${index}`);
      expect(extraction.aiJobId).toBe(item.jobId);
    }

    for (const jobId of chatIds) {
      const row = await prisma.aiJob.findUniqueOrThrow({ where: { id: jobId } });
      expect(row.status).toBe("succeeded");
      const generation = await prisma.aiGeneration.findFirstOrThrow({
        where: { aiJobId: jobId },
      });
      expect(generation.status).toBe("succeeded");
      expect(generation.assistantMessageId).toBeTruthy();
    }

    const assistants = await prisma.message.count({
      where: { conversationId, role: "assistant" },
    });
    expect(assistants).toBe(CHAT_COUNT);
  }, 90_000);

  it("fails a delivery whose queue name does not match AIJob.type", async () => {
    const item = await createExtractJob("must-not-extract");
    const assistantsBefore = await prisma.message.count({
      where: { conversationId, role: "assistant" },
    });
    const job = await queue.add(
      CHAT_GENERATE_JOB_TYPE,
      { jobId: item.jobId, type: CHAT_GENERATE_JOB_TYPE, documentId: item.documentId },
      { jobId: `${item.jobId}-mismatch` },
    );
    expect(await settle(job)).toBe("failed");
    const row = await prisma.aiJob.findUniqueOrThrow({ where: { id: item.jobId } });
    expect(row.status).toBe("failed");
    expect(row.lastErrorCode).toBe(JOB_TYPE_MISMATCH);
    const document = await prisma.document.findUniqueOrThrow({ where: { id: item.documentId } });
    expect(document.status).toBe("processing");
    expect(
      await prisma.documentExtraction.findUnique({ where: { documentId: item.documentId } }),
    ).toBeNull();
    expect(
      await prisma.message.count({ where: { conversationId, role: "assistant" } }),
    ).toBe(assistantsBefore);
  }, 30_000);

  it("does not extract when the payload type disagrees with the row", async () => {
    const item = await createExtractJob("payload-type");
    const job = await queue.add(
      EXTRACT_JOB_TYPE,
      { jobId: item.jobId, documentId: item.documentId, type: CHAT_GENERATE_JOB_TYPE },
      { jobId: `${item.jobId}-payload-type` },
    );
    expect(await settle(job)).toBe("failed");
    const row = await prisma.aiJob.findUniqueOrThrow({ where: { id: item.jobId } });
    expect(row.status).toBe("failed");
    expect(row.lastErrorCode).toBe(JOB_TYPE_MISMATCH);
    expect(
      await prisma.documentExtraction.findUnique({ where: { documentId: item.documentId } }),
    ).toBeNull();
  }, 30_000);

  it("does not read a document id that the payload swaps in", async () => {
    const item = await createExtractJob("payload-doc");
    const job = await queue.add(
      EXTRACT_JOB_TYPE,
      { jobId: item.jobId, documentId: randomUUID(), type: EXTRACT_JOB_TYPE },
      { jobId: `${item.jobId}-payload-doc` },
    );
    expect(await settle(job)).toBe("failed");
    const row = await prisma.aiJob.findUniqueOrThrow({ where: { id: item.jobId } });
    expect(row.status).toBe("failed");
    expect(row.lastErrorCode).toBe(JOB_PAYLOAD_MISMATCH);
    expect(
      await prisma.documentExtraction.findUnique({ where: { documentId: item.documentId } }),
    ).toBeNull();
  }, 30_000);

  it("fails an unknown job type instead of completing it", async () => {
    const jobId = randomUUID();
    await prisma.aiJob.create({
      data: {
        id: jobId,
        organizationId: orgId,
        workspaceId,
        createdByUserId: userId,
        type: "mystery.op",
        status: "queued",
        idempotencyKey: `dispatch:${jobId}`,
        maxAttempts: 3,
      },
    });
    const job = await queue.add(
      "mystery.op",
      { jobId, type: "mystery.op" },
      { jobId },
    );
    expect(await settle(job)).toBe("failed");
    const row = await prisma.aiJob.findUniqueOrThrow({ where: { id: jobId } });
    expect(row.status).toBe("failed");
    expect(row.lastErrorCode).toBe(UNKNOWN_JOB_TYPE);
  }, 30_000);

  it("does not run a terminal job again", async () => {
    const jobId = randomUUID();
    await prisma.aiJob.create({
      data: {
        id: jobId,
        organizationId: orgId,
        workspaceId,
        createdByUserId: userId,
        type: EXTRACT_JOB_TYPE,
        status: "succeeded",
        attemptCount: 2,
        idempotencyKey: `dispatch:${jobId}`,
        maxAttempts: 3,
      },
    });
    const job = await queue.add(
      EXTRACT_JOB_TYPE,
      { jobId, type: EXTRACT_JOB_TYPE },
      { jobId: `${jobId}-again` },
    );
    expect(await settle(job)).toBe("completed");
    const row = await prisma.aiJob.findUniqueOrThrow({ where: { id: jobId } });
    expect(row.status).toBe("succeeded");
    expect(row.attemptCount).toBe(2);
  }, 30_000);

  it("rejects a queue message with no job id", async () => {
    const job = await queue.add(EXTRACT_JOB_TYPE, {}, { jobId: randomUUID() });
    expect(await settle(job)).toBe("failed");
    const failed = await Job.fromId(queue, String(job.id));
    expect(failed?.failedReason ?? "").toContain(INVALID_JOB_PAYLOAD);
  }, 30_000);
});
