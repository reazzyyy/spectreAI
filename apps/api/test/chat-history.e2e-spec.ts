import { createPrismaClient, type PrismaClient } from "@spectre/db";
import { AiGateway } from "@spectre/ai-gateway";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { ChatJobProcessor } from "../src/chat/chat-job.processor.js";
import { CHAT_GENERATE_JOB_TYPE } from "../src/chat/chat.constants.js";

type GatewayCall = {
  messages: Array<{ role: string; content: string }>;
};

function recordingProcessor(): { processor: ChatJobProcessor; calls: GatewayCall[] } {
  const calls: GatewayCall[] = [];
  const gateway = new (class extends AiGateway {
    override async generateText(
      request: Parameters<AiGateway["generateText"]>[0],
    ): ReturnType<AiGateway["generateText"]> {
      calls.push({ messages: request.messages.map((message) => ({ ...message })) });
      return super.generateText(request);
    }
  })();
  return { processor: new ChatJobProcessor(gateway), calls };
}

describe("chat history cutoff", () => {
  const orgId = randomUUID();
  const ownerId = randomUUID();
  const memberId = randomUUID();
  const workspaceId = randomUUID();
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = createPrismaClient({ purpose: "migrator" });
    await prisma.organization.create({
      data: { id: orgId, name: `chat-${orgId}`, status: "active" },
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
        name: "chat",
        visibility: "TEAM",
        status: "ACTIVE",
      },
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
  }, 30_000);

  afterAll(async () => {
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
    await prisma.workspace.deleteMany({ where: { organizationId: orgId } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, memberId] } } });
    await prisma.organization.deleteMany({ where: { id: orgId } });
    await prisma.$disconnect();
  }, 30_000);

  async function createConversation(visibility: "PRIVATE" | "WORKSPACE"): Promise<string> {
    const id = randomUUID();
    await prisma.conversation.create({
      data: {
        id,
        organizationId: orgId,
        workspaceId,
        ownerUserId: ownerId,
        createdByUserId: ownerId,
        visibility,
        status: "ACTIVE",
      },
    });
    return id;
  }

  async function createJob(input: {
    conversationId: string;
    userMessageId: string;
    createdByUserId: string;
  }): Promise<{ jobId: string; generationId: string }> {
    const jobId = randomUUID();
    const generationId = randomUUID();
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
        userMessageId: input.userMessageId,
        generationNumber: 1,
        status: "queued",
        aiJobId: jobId,
        providerId: "synthetic",
        modelId: "synthetic-echo",
      },
    });
    return { jobId, generationId };
  }

  it("sends the last 50 messages to the model, not the first 50", async () => {
    const conversationId = await createConversation("WORKSPACE");
    const ids = Array.from({ length: 100 }, () => randomUUID());
    await prisma.message.createMany({
      data: ids.map((id, index) => ({
        id,
        organizationId: orgId,
        conversationId,
        role: "user" as const,
        content: `body-${index}`,
        createdByUserId: ownerId,
        createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)),
      })),
    });
    const { jobId, generationId } = await createJob({
      conversationId,
      userMessageId: ids[99]!,
      createdByUserId: ownerId,
    });
    const { processor, calls } = recordingProcessor();

    await processor.process(jobId);

    expect(calls).toHaveLength(1);
    expect(calls[0]!.messages.map((message) => message.content)).toEqual(
      Array.from({ length: 50 }, (_, index) => `body-${50 + index}`),
    );
    const snapshot = await prisma.contextSnapshot.findFirst({
      where: { aiGenerationId: generationId },
    });
    const manifest = snapshot?.contextManifest as { messageIds: string[]; targetUserMessageId: string };
    expect(manifest.messageIds).toEqual(ids.slice(50));
    expect(manifest.targetUserMessageId).toBe(ids[99]);
  });

  it("does not include a later message when the worker runs after it was sent", async () => {
    const conversationId = await createConversation("WORKSPACE");
    const firstId = randomUUID();
    const laterId = randomUUID();
    await prisma.message.createMany({
      data: [
        {
          id: firstId,
          organizationId: orgId,
          conversationId,
          role: "user",
          content: "alpha",
          createdByUserId: ownerId,
          createdAt: new Date(Date.UTC(2026, 1, 1)),
        },
        {
          id: laterId,
          organizationId: orgId,
          conversationId,
          role: "user",
          content: "beta",
          createdByUserId: ownerId,
          createdAt: new Date(Date.UTC(2026, 1, 2)),
        },
      ],
    });
    const { jobId, generationId } = await createJob({
      conversationId,
      userMessageId: firstId,
      createdByUserId: ownerId,
    });
    const { processor, calls } = recordingProcessor();

    await processor.process(jobId);

    expect(calls[0]!.messages.map((message) => message.content)).toEqual(["alpha"]);
    const snapshot = await prisma.contextSnapshot.findFirst({
      where: { aiGenerationId: generationId },
    });
    const manifest = snapshot?.contextManifest as { messageIds: string[] };
    expect(manifest.messageIds).toEqual([firstId]);
    expect(manifest.messageIds).not.toContain(laterId);
  });

  it("keeps a unique older message when newer rows share timestamps", async () => {
    const conversationId = await createConversation("WORKSPACE");
    const keepId = randomUUID();
    const targetId = randomUUID();
    const peerId = randomUUID();
    const rows: Array<{
      id: string;
      organizationId: string;
      conversationId: string;
      role: "user";
      content: string;
      createdByUserId: string;
      createdAt: Date;
    }> = [
      {
        id: keepId,
        organizationId: orgId,
        conversationId,
        role: "user",
        content: "keep",
        createdByUserId: ownerId,
        createdAt: new Date(Date.UTC(2026, 2, 1)),
      },
    ];
    for (let index = 1; index <= 60; index += 1) {
      const at = new Date(Date.UTC(2026, 2, 1, 0, index));
      rows.push(
        {
          id: randomUUID(),
          organizationId: orgId,
          conversationId,
          role: "user",
          content: `tie-a-${index}`,
          createdByUserId: ownerId,
          createdAt: at,
        },
        {
          id: randomUUID(),
          organizationId: orgId,
          conversationId,
          role: "user",
          content: `tie-b-${index}`,
          createdByUserId: ownerId,
          createdAt: at,
        },
      );
    }
    rows.push(
      {
        id: targetId,
        organizationId: orgId,
        conversationId,
        role: "user",
        content: "target",
        createdByUserId: ownerId,
        createdAt: new Date(Date.UTC(2026, 2, 2)),
      },
      {
        id: peerId,
        organizationId: orgId,
        conversationId,
        role: "user",
        content: "peer",
        createdByUserId: ownerId,
        createdAt: new Date(Date.UTC(2026, 2, 2)),
      },
    );
    await prisma.message.createMany({ data: rows });
    const { jobId } = await createJob({
      conversationId,
      userMessageId: targetId,
      createdByUserId: ownerId,
    });
    const { processor, calls } = recordingProcessor();

    await processor.process(jobId);

    expect(calls[0]!.messages.map((message) => message.content)).toEqual(["keep", "target"]);
  });

  it("does not call the gateway for a private chat the actor cannot write", async () => {
    const conversationId = await createConversation("PRIVATE");
    const messageId = randomUUID();
    await prisma.message.create({
      data: {
        id: messageId,
        organizationId: orgId,
        conversationId,
        role: "user",
        content: "secret",
        createdByUserId: ownerId,
        createdAt: new Date(Date.UTC(2026, 3, 1)),
      },
    });
    const { jobId } = await createJob({
      conversationId,
      userMessageId: messageId,
      createdByUserId: memberId,
    });
    const { processor, calls } = recordingProcessor();

    await processor.process(jobId);

    expect(calls).toHaveLength(0);
    const job = await prisma.aiJob.findUnique({ where: { id: jobId } });
    expect(job?.status).toBe("failed");
    expect(job?.lastErrorCode).toBe("ACL_REVOKED");
    expect(await prisma.contextSnapshot.count({ where: { aiJobId: jobId } })).toBe(0);
  });

  it("does not call the gateway when the target is outside the conversation", async () => {
    const conversationId = await createConversation("WORKSPACE");
    const otherId = await createConversation("WORKSPACE");
    const foreignMessageId = randomUUID();
    await prisma.message.create({
      data: {
        id: foreignMessageId,
        organizationId: orgId,
        conversationId: otherId,
        role: "user",
        content: "elsewhere",
        createdByUserId: ownerId,
        createdAt: new Date(Date.UTC(2026, 3, 2)),
      },
    });
    const { jobId } = await createJob({
      conversationId,
      userMessageId: foreignMessageId,
      createdByUserId: ownerId,
    });
    const { processor, calls } = recordingProcessor();

    await processor.process(jobId);

    expect(calls).toHaveLength(0);
    const job = await prisma.aiJob.findUnique({ where: { id: jobId } });
    expect(job?.status).toBe("failed");
    expect(job?.lastErrorCode).toBe("TARGET_NOT_VISIBLE");
  });

  it("does not rebuild the snapshot when the same job is delivered again", async () => {
    const conversationId = await createConversation("WORKSPACE");
    const messageId = randomUUID();
    await prisma.message.create({
      data: {
        id: messageId,
        organizationId: orgId,
        conversationId,
        role: "user",
        content: "once",
        createdByUserId: ownerId,
        createdAt: new Date(Date.UTC(2026, 4, 1)),
      },
    });
    const { jobId, generationId } = await createJob({
      conversationId,
      userMessageId: messageId,
      createdByUserId: ownerId,
    });
    const { processor, calls } = recordingProcessor();

    await processor.process(jobId);
    await processor.process(jobId);

    expect(calls).toHaveLength(1);
    expect(await prisma.contextSnapshot.count({ where: { aiGenerationId: generationId } })).toBe(1);
    expect(await prisma.message.count({ where: { conversationId, role: "assistant" } })).toBe(1);
  });

  it("trims older messages to the input budget and keeps the target", async () => {
    const conversationId = await createConversation("WORKSPACE");
    const ids = Array.from({ length: 60 }, () => randomUUID());
    const body = "x".repeat(200);
    await prisma.message.createMany({
      data: ids.map((id, index) => ({
        id,
        organizationId: orgId,
        conversationId,
        role: "user" as const,
        content: body,
        createdByUserId: ownerId,
        createdAt: new Date(Date.UTC(2026, 5, 1, 0, 0, index)),
      })),
    });
    const { jobId, generationId } = await createJob({
      conversationId,
      userMessageId: ids[59]!,
      createdByUserId: ownerId,
    });
    const { processor, calls } = recordingProcessor();

    await processor.process(jobId);

    expect(calls[0]!.messages).toHaveLength(40);
    expect(calls[0]!.messages.reduce((sum, message) => sum + message.content.length, 0)).toBe(8_000);
    const snapshot = await prisma.contextSnapshot.findFirst({
      where: { aiGenerationId: generationId },
    });
    const manifest = snapshot?.contextManifest as {
      messageIds: string[];
      inputTokenBudget: number;
      outputTokenBudget: number;
    };
    expect(manifest.messageIds[0]).toBe(ids[20]);
    expect(manifest.messageIds.at(-1)).toBe(ids[59]);
    expect(manifest.inputTokenBudget).toBe(8_000);
    expect(manifest.outputTokenBudget).toBe(2_000);
    const assistant = await prisma.message.findFirst({
      where: { conversationId, role: "assistant" },
    });
    expect(assistant?.content).toBe(`synthetic:${generationId}:8000`);
  });
});
