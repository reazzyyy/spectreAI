import { ConversationAccess, WorkspaceAccess } from "@spectre/access";
import { AiGateway } from "@spectre/ai-gateway";
import { createPrismaClient, type PrismaClient } from "@spectre/db";
import { Queue } from "bullmq";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { ChatService } from "../src/chat/chat.service.js";
import { CHAT_GENERATE_JOB_TYPE, CHAT_GENERATE_OUTBOX_EVENT } from "../src/chat/chat.constants.js";
import { ChatJobProcessor } from "../src/chat/chat-job.processor.js";
import { claimOutboxEvent, OutboxPublisherService } from "../src/chat/outbox-publisher.service.js";
import {
  createActorScopedConversationStore,
  createActorScopedWorkspaceStore,
} from "../src/db/actor-scoped-stores.js";
import { PrismaService } from "../src/db/prisma.service.js";
import { bullmqRedisConnection } from "../src/queue/ai-jobs.queue.js";

const redisUrl = process.env.REDIS_URL?.trim() || "redis://localhost:6379";

function gatedProcessor(): {
  processor: ChatJobProcessor;
  calls: number;
  release: () => void;
  entered: Promise<void>;
} {
  let calls = 0;
  let release = (): void => {};
  let markEntered = (): void => {};
  const entered = new Promise<void>((resolve) => {
    markEntered = resolve;
  });
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  const gateway = new (class extends AiGateway {
    override async generateText(
      request: Parameters<AiGateway["generateText"]>[0],
    ): ReturnType<AiGateway["generateText"]> {
      calls += 1;
      markEntered();
      await hold;
      return super.generateText(request);
    }
  })();
  return {
    processor: new ChatJobProcessor(gateway),
    get calls() {
      return calls;
    },
    release,
    entered,
  };
}

describe("chat single outcome", () => {
  const orgId = randomUUID();
  const ownerId = randomUUID();
  const memberId = randomUUID();
  const workspaceId = randomUUID();
  let prisma: PrismaClient;
  let prismaService: PrismaService;
  let chat: ChatService;

  beforeAll(async () => {
    prisma = createPrismaClient({ purpose: "migrator" });
    await prisma.organization.create({
      data: { id: orgId, name: `outcome-${orgId}`, status: "active" },
    });
    await prisma.user.createMany({
      data: [
        {
          id: ownerId,
          email: `owner-${orgId}@localhost`,
          passwordHash: "synthetic-not-a-login",
          status: "active",
        },
        {
          id: memberId,
          email: `member-${orgId}@localhost`,
          passwordHash: "synthetic-not-a-login",
          status: "active",
        },
      ],
    });
    await prisma.workspace.create({
      data: {
        id: workspaceId,
        organizationId: orgId,
        ownerUserId: ownerId,
        name: "outcome",
        visibility: "TEAM",
        status: "ACTIVE",
      },
    });
    await prisma.organizationMembership.createMany({
      data: [
        { organizationId: orgId, userId: ownerId, role: "owner", status: "active" },
        { organizationId: orgId, userId: memberId, role: "member", status: "active" },
      ],
    });
    await prisma.workspaceMember.create({
      data: {
        id: randomUUID(),
        organizationId: orgId,
        workspaceId,
        userId: memberId,
        role: "EDITOR",
        status: "ACTIVE",
      },
    });
    prismaService = new PrismaService();
    const actorDb = { userId: ownerId, organizationId: orgId };
    const workspaces = new WorkspaceAccess(
      createActorScopedWorkspaceStore(prismaService, actorDb),
    );
    const conversations = new ConversationAccess(
      createActorScopedConversationStore(prismaService, actorDb),
      workspaces,
    );
    chat = new ChatService(prismaService, conversations, {
      publishPending: async () => 0,
    } as unknown as OutboxPublisherService);
  }, 30_000);

  afterAll(async () => {
    ChatService.beforeCreate = null;
    if (prismaService) {
      await prismaService.onModuleDestroy();
    }
    if (!prisma) {
      return;
    }
    await prisma.messageSource.deleteMany({ where: { organizationId: orgId } });
    await prisma.contextSnapshotItem.deleteMany({ where: { organizationId: orgId } });
    await prisma.message.deleteMany({ where: { organizationId: orgId, role: "assistant" } });
    await prisma.aiGeneration.updateMany({
      where: { organizationId: orgId },
      data: { assistantMessageId: null, contextSnapshotId: null },
    });
    await prisma.contextSnapshot.deleteMany({ where: { organizationId: orgId } });
    await prisma.aiGeneration.deleteMany({ where: { organizationId: orgId } });
    await prisma.message.deleteMany({ where: { organizationId: orgId } });
    await prisma.outboxEvent.deleteMany({ where: { organizationId: orgId } });
    await prisma.aiJob.deleteMany({ where: { organizationId: orgId } });
    await prisma.conversation.deleteMany({ where: { organizationId: orgId } });
    await prisma.workspaceMember.deleteMany({ where: { organizationId: orgId } });
    await prisma.organizationMembership.deleteMany({ where: { organizationId: orgId } });
    await prisma.workspace.deleteMany({ where: { organizationId: orgId } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, memberId] } } });
    await prisma.organization.deleteMany({ where: { id: orgId } });
    await prisma.$disconnect();
  }, 30_000);

  async function createConversation(): Promise<string> {
    const id = randomUUID();
    await prisma.conversation.create({
      data: {
        id,
        organizationId: orgId,
        workspaceId,
        ownerUserId: ownerId,
        createdByUserId: ownerId,
        visibility: "WORKSPACE",
        status: "ACTIVE",
      },
    });
    return id;
  }

  async function createTurn(input: {
    conversationId: string;
    createdByUserId: string;
    content?: string;
  }): Promise<{ messageId: string; jobId: string; generationId: string }> {
    const messageId = randomUUID();
    const jobId = randomUUID();
    const generationId = randomUUID();
    await prisma.message.create({
      data: {
        id: messageId,
        organizationId: orgId,
        conversationId: input.conversationId,
        role: "user",
        content: input.content ?? "question",
        createdByUserId: input.createdByUserId,
        createdAt: new Date(Date.UTC(2026, 6, 1)),
      },
    });
    await prisma.aiJob.create({
      data: {
        id: jobId,
        organizationId: orgId,
        workspaceId,
        createdByUserId: input.createdByUserId,
        type: CHAT_GENERATE_JOB_TYPE,
        status: "queued",
        idempotencyKey: randomUUID(),
      },
    });
    await prisma.aiGeneration.create({
      data: {
        id: generationId,
        organizationId: orgId,
        conversationId: input.conversationId,
        userMessageId: messageId,
        generationNumber: 1,
        status: "queued",
        aiJobId: jobId,
        providerId: "synthetic",
        modelId: "synthetic-echo",
      },
    });
    return { messageId, jobId, generationId };
  }

  it("lets one of two workers call the provider", async () => {
    const conversationId = await createConversation();
    const { jobId, generationId } = await createTurn({ conversationId, createdByUserId: ownerId });
    const gate = gatedProcessor();
    const first = gate.processor.process(jobId);
    await gate.entered;
    await gate.processor.process(jobId);
    gate.release();
    await first;

    expect(gate.calls).toBe(1);
    expect(await prisma.message.count({ where: { generationId, role: "assistant" } })).toBe(1);
    const job = await prisma.aiJob.findUnique({ where: { id: jobId } });
    expect(job?.status).toBe("succeeded");
    expect(job?.attemptCount).toBe(1);
  });

  it("does not publish an assistant when cancel wins before commit", async () => {
    const conversationId = await createConversation();
    const { jobId, generationId } = await createTurn({ conversationId, createdByUserId: ownerId });
    const processor = new ChatJobProcessor();
    processor.beforeCommit = async () => {
      await prisma.aiGeneration.updateMany({
        where: { id: generationId, status: "running" },
        data: { status: "cancelled", completedAt: new Date() },
      });
      await prisma.aiJob.updateMany({
        where: { id: jobId, status: "running" },
        data: { status: "cancelled", completedAt: new Date(), lastErrorCode: "CANCELLED" },
      });
    };

    await processor.process(jobId);

    expect(await prisma.message.count({ where: { generationId, role: "assistant" } })).toBe(0);
    expect(await prisma.contextSnapshot.count({ where: { aiGenerationId: generationId } })).toBe(0);
    const generation = await prisma.aiGeneration.findUnique({ where: { id: generationId } });
    expect(generation?.status).toBe("cancelled");
  });

  it("keeps succeeded when cancel arrives after commit", async () => {
    const conversationId = await createConversation();
    const { jobId, generationId } = await createTurn({ conversationId, createdByUserId: ownerId });
    await new ChatJobProcessor().process(jobId);
    const actor = { userId: ownerId, organizationId: orgId, orgRole: "owner" as const };

    const cancelled = await chat.cancelGeneration(actor, generationId);

    expect(cancelled.status).toBe("succeeded");
    expect(await prisma.message.count({ where: { generationId, role: "assistant" } })).toBe(1);
  });

  it("does not publish after membership is revoked", async () => {
    const conversationId = await createConversation();
    const { jobId, generationId } = await createTurn({
      conversationId,
      createdByUserId: memberId,
      content: "member-question",
    });
    const processor = new ChatJobProcessor();
    processor.beforeCommit = async () => {
      await prisma.workspaceMember.updateMany({
        where: { workspaceId, userId: memberId },
        data: { status: "REVOKED" },
      });
    };

    await processor.process(jobId);

    expect(await prisma.message.count({ where: { generationId, role: "assistant" } })).toBe(0);
    const job = await prisma.aiJob.findUnique({ where: { id: jobId } });
    expect(job?.status).toBe("failed");
    expect(job?.lastErrorCode).toBe("ACL_REVOKED");
    await prisma.workspaceMember.updateMany({
      where: { workspaceId, userId: memberId },
      data: { status: "ACTIVE" },
    });
  });

  it("does not publish after organization membership is revoked", async () => {
    const conversationId = await createConversation();
    const { jobId, generationId } = await createTurn({
      conversationId,
      createdByUserId: memberId,
      content: "member-question",
    });
    const processor = new ChatJobProcessor();
    processor.beforeCommit = async () => {
      await prisma.organizationMembership.updateMany({
        where: { organizationId: orgId, userId: memberId },
        data: { status: "revoked" },
      });
    };

    await processor.process(jobId);

    expect(await prisma.message.count({ where: { generationId, role: "assistant" } })).toBe(0);
    const job = await prisma.aiJob.findUnique({ where: { id: jobId } });
    expect(job?.status).toBe("failed");
    expect(job?.lastErrorCode).toBe("ACL_REVOKED");
    await prisma.organizationMembership.updateMany({
      where: { organizationId: orgId, userId: memberId },
      data: { status: "active" },
    });
  });

  it("finishes a crashed running attempt without a second assistant", async () => {
    const conversationId = await createConversation();
    const { jobId, generationId } = await createTurn({ conversationId, createdByUserId: ownerId });
    const stale = new Date(Date.now() - 60_000);
    await prisma.aiJob.update({
      where: { id: jobId },
      data: { status: "running", startedAt: stale, attemptCount: 1 },
    });
    await prisma.aiGeneration.update({
      where: { id: generationId },
      data: { status: "running", startedAt: stale },
    });

    await new ChatJobProcessor().process(jobId);

    expect(await prisma.message.count({ where: { generationId, role: "assistant" } })).toBe(1);
    expect(await prisma.contextSnapshot.count({ where: { aiGenerationId: generationId } })).toBe(1);
    const job = await prisma.aiJob.findUnique({ where: { id: jobId } });
    expect(job?.status).toBe("succeeded");
    expect(job?.attemptCount).toBe(2);
  });

  it("publishes one outbox row from two publishers and generates once", async () => {
    const conversationId = await createConversation();
    const { jobId } = await createTurn({ conversationId, createdByUserId: ownerId });
    const outboxId = randomUUID();
    await prisma.outboxEvent.create({
      data: {
        id: outboxId,
        organizationId: orgId,
        eventType: CHAT_GENERATE_OUTBOX_EVENT,
        aggregateId: jobId,
        payload: { jobId, type: CHAT_GENERATE_JOB_TYPE },
      },
    });
    const queueName = `chat-outcome-${randomUUID()}`;
    const queue = new Queue(queueName, { connection: bullmqRedisConnection(redisUrl) });
    const publisher = new OutboxPublisherService(
      { migrator: prisma } as PrismaService,
      queue,
    );
    try {
      const [first, second] = await Promise.all([
        publisher.publishPending(10, [CHAT_GENERATE_OUTBOX_EVENT]),
        publisher.publishPending(10, [CHAT_GENERATE_OUTBOX_EVENT]),
      ]);
      expect(first + second).toBe(1);
      const counts = await queue.getJobCounts("waiting", "delayed", "active");
      expect((counts.waiting ?? 0) + (counts.delayed ?? 0) + (counts.active ?? 0)).toBe(1);
      await new ChatJobProcessor().process(jobId);
      await new ChatJobProcessor().process(jobId);
      const generation = await prisma.aiGeneration.findFirst({ where: { aiJobId: jobId } });
      expect(await prisma.message.count({
        where: { generationId: generation?.id, role: "assistant" },
      })).toBe(1);
    } finally {
      await queue.obliterate({ force: true });
      await queue.close();
    }
  });

  it("returns one job when two sends share an idempotency key", async () => {
    const conversationId = await createConversation();
    const actor = { userId: ownerId, organizationId: orgId, orgRole: "owner" as const };
    let release = (): void => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered = 0;
    ChatService.beforeCreate = async () => {
      entered += 1;
      if (entered === 1) {
        await gate;
        return;
      }
      release();
    };
    try {
      const [left, right] = await Promise.all([
        chat.sendMessage(actor, conversationId, {
          content: "same-body",
          idempotencyKey: "race-key",
          clientMessageId: "race-client",
        }),
        chat.sendMessage(actor, conversationId, {
          content: "same-body",
          idempotencyKey: "race-key",
          clientMessageId: "race-client",
        }),
      ]);
      expect(left.jobId).toBe(right.jobId);
      expect([left.reused, right.reused].filter(Boolean)).toHaveLength(1);
      expect(await prisma.aiJob.count({
        where: { organizationId: orgId, idempotencyKey: `${conversationId}:chat:race-key` },
      })).toBe(1);
    } finally {
      ChatService.beforeCreate = null;
    }
  });

  it("rejects a second assistant message for the same generation", async () => {
    const conversationId = await createConversation();
    const { generationId } = await createTurn({ conversationId, createdByUserId: ownerId });
    await prisma.message.create({
      data: {
        id: randomUUID(),
        organizationId: orgId,
        conversationId,
        role: "assistant",
        content: "first",
        generationId,
      },
    });
    await expect(
      prisma.message.create({
        data: {
          id: randomUUID(),
          organizationId: orgId,
          conversationId,
          role: "assistant",
          content: "second",
          generationId,
        },
      }),
    ).rejects.toThrow();
  });

  it("gives the outbox claim to one publisher", async () => {
    const eventId = randomUUID();
    await prisma.outboxEvent.create({
      data: {
        id: eventId,
        organizationId: orgId,
        eventType: CHAT_GENERATE_OUTBOX_EVENT,
        aggregateId: randomUUID(),
        payload: { jobId: randomUUID(), type: CHAT_GENERATE_JOB_TYPE },
      },
    });
    const [left, right] = await Promise.all([
      claimOutboxEvent(prisma, { id: eventId, attemptCount: 0 }),
      claimOutboxEvent(prisma, { id: eventId, attemptCount: 0 }),
    ]);
    expect([left, right].filter(Boolean)).toHaveLength(1);
    expect(await claimOutboxEvent(prisma, { id: eventId, attemptCount: 1 })).toBe(false);
  });

  it("marks a provider exception failed instead of leaving the job running", async () => {
    const conversationId = await createConversation();
    const { jobId } = await createTurn({ conversationId, createdByUserId: ownerId });
    const gateway = new (class extends AiGateway {
      override generateText(): ReturnType<AiGateway["generateText"]> {
        return Promise.reject(new Error("synthetic-down"));
      }
    })();
    await new ChatJobProcessor(gateway).process(jobId);
    const job = await prisma.aiJob.findUnique({ where: { id: jobId } });
    expect(job?.status).toBe("failed");
    expect(job?.lastErrorCode).toBe("GATEWAY_ERROR");
  });
});
