import { Injectable } from "@nestjs/common";
import { AiGateway } from "@spectre/ai-gateway";
import { createPrismaClient, withActorContext } from "@spectre/db";
import { createHash, randomUUID } from "node:crypto";
import { CHAT_GENERATE_JOB_TYPE } from "./chat.constants.js";

const CONTEXT_MODE = "conversation_only";
const PROMPT_VERSION = "chat-conversation-only-v1";

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/**
 * Processes chat.generate AIJobs via Synthetic AiGateway only (D-012 / O-002).
 * Re-checks conversation ACL before calling the model and before persisting.
 * Safe to call from the BullMQ worker or e2e drain without Redis consumer.
 */
@Injectable()
export class ChatJobProcessor {
  constructor(private readonly gateway: AiGateway = new AiGateway()) {}

  async process(jobId: string): Promise<void> {
    const migrator = createPrismaClient({ purpose: "migrator" });
    const runtime = createPrismaClient({ purpose: "runtime" });
    try {
      const aiJob = await migrator.aiJob.findUnique({ where: { id: jobId } });
      if (!aiJob || aiJob.type !== CHAT_GENERATE_JOB_TYPE) {
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

      const generation = await migrator.aiGeneration.findFirst({
        where: { aiJobId: jobId },
      });
      if (!generation) {
        await migrator.aiJob.update({
          where: { id: jobId },
          data: {
            status: "failed",
            lastErrorCode: "GENERATION_NOT_FOUND",
            completedAt: new Date(),
          },
        });
        return;
      }

      if (generation.status === "cancelled") {
        await migrator.aiJob.update({
          where: { id: jobId },
          data: {
            status: "cancelled",
            completedAt: new Date(),
            lastErrorCode: "CANCELLED",
          },
        });
        return;
      }

      const conversation = await migrator.conversation.findUnique({
        where: { id: generation.conversationId },
      });
      if (!conversation) {
        await this.fail(migrator, jobId, generation.id, "CONVERSATION_NOT_FOUND");
        return;
      }

      const actor = {
        userId: aiJob.createdByUserId,
        organizationId: aiJob.organizationId,
      };

      const allowed = await this.actorStillMayMutate(runtime, actor, conversation);
      if (!allowed) {
        await this.fail(migrator, jobId, generation.id, "ACL_REVOKED");
        return;
      }

      await migrator.aiJob.update({
        where: { id: jobId },
        data: {
          status: "running",
          startedAt: new Date(),
          attemptCount: { increment: 1 },
        },
      });
      await migrator.aiGeneration.update({
        where: { id: generation.id },
        data: { status: "running", startedAt: new Date() },
      });

      const history = await withActorContext(
        runtime,
        actor,
        async (
          tx,
        ): Promise<
          Array<{ id: string; role: string; content: string; createdAt: Date }>
        > =>
          tx.message.findMany({
            where: {
              conversationId: conversation.id,
              organizationId: actor.organizationId,
            },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            take: 50,
            select: { id: true, role: true, content: true, createdAt: true },
          }),
      );

      const result = await this.gateway.generateText({
        operationId: generation.id,
        dataClass: "synthetic",
        messages: history.map((m) => ({
          role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
          content: m.content,
        })),
      });

      // Re-check cancel + ACL before persist.
      const freshGen = await migrator.aiGeneration.findUnique({
        where: { id: generation.id },
      });
      if (!freshGen || freshGen.status === "cancelled") {
        await migrator.aiJob.update({
          where: { id: jobId },
          data: {
            status: "cancelled",
            completedAt: new Date(),
            lastErrorCode: "CANCELLED",
          },
        });
        return;
      }
      const stillAllowed = await this.actorStillMayMutate(runtime, actor, conversation);
      if (!stillAllowed) {
        await this.fail(migrator, jobId, generation.id, "ACL_REVOKED");
        return;
      }

      const assistantId = randomUUID();
      const snapshotId = randomUUID();
      const manifest = {
        contextMode: CONTEXT_MODE,
        promptVersion: PROMPT_VERSION,
        messageIds: history.map((m) => m.id),
        roles: history.map((m) => m.role),
      };
      const contextHash = sha256(JSON.stringify(manifest));

      await withActorContext(runtime, actor, async (tx) => {
        await tx.contextSnapshot.create({
          data: {
            id: snapshotId,
            organizationId: actor.organizationId,
            workspaceId: conversation.workspaceId,
            conversationId: conversation.id,
            aiGenerationId: generation.id,
            aiJobId: jobId,
            contextMode: CONTEXT_MODE,
            contextManifest: manifest,
            contextHash,
            promptVersion: PROMPT_VERSION,
            providerId: result.providerId,
            modelId: result.modelId,
            inputTokenEstimate: result.usage.inputTokens,
          },
        });

        const itemIds: string[] = [];
        for (let i = 0; i < history.length; i += 1) {
          const msg = history[i]!;
          const itemId = randomUUID();
          itemIds.push(itemId);
          const citationKey = `S${i + 1}`;
          await tx.contextSnapshotItem.create({
            data: {
              id: itemId,
              organizationId: actor.organizationId,
              contextSnapshotId: snapshotId,
              ordinal: i,
              itemType: "conversation_message",
              sourceEntityType: "message",
              sourceEntityId: msg.id,
              contentHash: sha256(msg.content),
              sourceLocator: { role: msg.role, createdAt: msg.createdAt.toISOString() },
              includedTokenEstimate: msg.content.length,
              citationKey,
            },
          });
        }

        await tx.message.create({
          data: {
            id: assistantId,
            organizationId: actor.organizationId,
            conversationId: conversation.id,
            role: "assistant",
            content: result.text,
            generationId: generation.id,
            createdByUserId: null,
          },
        });

        for (let i = 0; i < itemIds.length; i += 1) {
          await tx.messageSource.create({
            data: {
              id: randomUUID(),
              organizationId: actor.organizationId,
              messageId: assistantId,
              contextSnapshotItemId: itemIds[i]!,
              citationKey: `S${i + 1}`,
              rank: i,
              sourceType: "conversation_message",
            },
          });
        }

        await tx.aiGeneration.update({
          where: { id: generation.id },
          data: {
            status: "succeeded",
            assistantMessageId: assistantId,
            contextSnapshotId: snapshotId,
            providerId: result.providerId,
            modelId: result.modelId,
            promptVersion: PROMPT_VERSION,
            completedAt: new Date(),
          },
        });
        await tx.aiJob.update({
          where: { id: jobId },
          data: { status: "succeeded", completedAt: new Date() },
        });
        await tx.conversation.update({
          where: { id: conversation.id },
          data: { lastMessageAt: new Date() },
        });
      });
    } finally {
      await Promise.all([migrator.$disconnect(), runtime.$disconnect()]);
    }
  }

  private async fail(
    migrator: ReturnType<typeof createPrismaClient>,
    jobId: string,
    generationId: string,
    code: string,
  ): Promise<void> {
    await migrator.aiGeneration.update({
      where: { id: generationId },
      data: { status: "failed", completedAt: new Date() },
    });
    await migrator.aiJob.update({
      where: { id: jobId },
      data: {
        status: "failed",
        lastErrorCode: code,
        completedAt: new Date(),
      },
    });
  }

  private async actorStillMayMutate(
    runtime: ReturnType<typeof createPrismaClient>,
    actor: { userId: string; organizationId: string },
    conversation: {
      id: string;
      organizationId: string;
      workspaceId: string;
      ownerUserId: string;
      visibility: string;
    },
  ): Promise<boolean> {
    return withActorContext(runtime, actor, async (tx) => {
      const workspace = await tx.workspace.findUnique({
        where: { id: conversation.workspaceId },
      });
      if (!workspace || workspace.organizationId !== actor.organizationId) {
        return false;
      }
      const isOwner = workspace.ownerUserId === actor.userId;
      let role: "OWNER" | "EDITOR" | "VIEWER" | null = isOwner ? "OWNER" : null;
      if (!role && workspace.visibility === "TEAM") {
        const member = await tx.workspaceMember.findFirst({
          where: {
            workspaceId: workspace.id,
            userId: actor.userId,
            status: "ACTIVE",
          },
        });
        if (member) {
          role = member.role === "EDITOR" ? "EDITOR" : "VIEWER";
        }
      }
      if (!role || (role !== "OWNER" && role !== "EDITOR")) {
        return false;
      }
      if (conversation.visibility === "PRIVATE") {
        return conversation.ownerUserId === actor.userId;
      }
      return true;
    });
  }
}
