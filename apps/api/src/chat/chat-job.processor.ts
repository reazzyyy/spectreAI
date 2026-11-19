import { Injectable } from "@nestjs/common";
import { AiGateway, classifyUntrustedText } from "@spectre/ai-gateway";
import { createPrismaClient, withActorContext, type PrismaTxClient } from "@spectre/db";
import { createHash, randomUUID } from "node:crypto";
import { CHAT_GENERATE_JOB_TYPE, CHAT_RUNNING_LEASE_MS } from "./chat.constants.js";
import { loadConversationPrefix } from "./conversation-context.js";

const CONTEXT_MODE = "conversation_only";
const PROMPT_VERSION = "chat-conversation-only-v1";
const OPEN_STATUSES = ["queued", "running"] as const;

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

class PublishAborted extends Error {
  readonly code: "CANCELLED" | "ACL_REVOKED";

  constructor(code: "CANCELLED" | "ACL_REVOKED") {
    super(code);
    this.name = "PublishAborted";
    this.code = code;
  }
}

/**
 * Processes chat.generate AIJobs via Synthetic AiGateway only (D-012 / O-002).
 * One compare-and-swap owns the running attempt. The model call is outside the
 * database transaction. Commit publishes the assistant only while the generation
 * is still running, in the same transaction as the snapshot.
 * History is the prefix ending at AiGeneration.userMessageId.
 */
@Injectable()
export class ChatJobProcessor {
  /**
   * Test seam. Runs after the provider returns and before the commit transaction.
   * Production leaves this unset.
   */
  beforeCommit: (() => Promise<void>) | null = null;

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
        await migrator.aiJob.updateMany({
          where: { id: jobId, status: { in: [...OPEN_STATUSES] } },
          data: {
            status: "failed",
            lastErrorCode: "GENERATION_NOT_FOUND",
            completedAt: new Date(),
          },
        });
        return;
      }

      if (generation.status === "cancelled") {
        await this.alignCancelled(migrator, jobId, generation.id);
        return;
      }
      if (
        generation.status === "succeeded" ||
        generation.status === "failed" ||
        generation.status === "timed_out"
      ) {
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

      const allowed = await withActorContext(runtime, actor, (tx) =>
        this.actorMayMutate(tx, actor, conversation),
      );
      if (!allowed) {
        await this.fail(migrator, jobId, generation.id, "ACL_REVOKED");
        return;
      }

      const prefix = await withActorContext(runtime, actor, (tx) =>
        loadConversationPrefix(tx, {
          conversationId: conversation.id,
          organizationId: actor.organizationId,
          targetMessageId: generation.userMessageId,
        }),
      );
      if (!prefix) {
        await this.fail(migrator, jobId, generation.id, "TARGET_NOT_VISIBLE");
        return;
      }
      const history = prefix.messages;

      const claim = await this.claimAttempt(migrator, aiJob.id, generation.id, aiJob.maxAttempts);
      if (claim !== "owned") {
        return;
      }

      let result: Awaited<ReturnType<AiGateway["generateText"]>>;
      try {
        result = await this.gateway.generateText({
          operationId: generation.id,
          dataClass: classifyUntrustedText(),
          messages: history.map((message) => ({
            role: message.role === "assistant" ? ("assistant" as const) : ("user" as const),
            content: message.content,
          })),
        });
      } catch {
        await this.fail(migrator, jobId, generation.id, "GATEWAY_ERROR");
        return;
      }

      if (this.beforeCommit) {
        await this.beforeCommit();
      }

      const assistantId = randomUUID();
      const snapshotId = randomUUID();
      const manifest = {
        contextMode: CONTEXT_MODE,
        promptVersion: PROMPT_VERSION,
        selectionPolicyVersion: prefix.selectionPolicyVersion,
        targetUserMessageId: prefix.targetUserMessageId,
        cutoff: prefix.cutoff,
        inputTokenBudget: prefix.inputTokenBudget,
        outputTokenBudget: prefix.outputTokenBudget,
        messageIds: history.map((message) => message.id),
        contentHashes: prefix.contentHashes,
        roles: history.map((message) => message.role),
      };
      const contextHash = sha256(JSON.stringify(manifest));

      try {
        await withActorContext(runtime, actor, async (tx) => {
          const stillAllowed = await this.actorMayMutate(tx, actor, conversation);
          if (!stillAllowed) {
            throw new PublishAborted("ACL_REVOKED");
          }
          const fresh = await tx.aiGeneration.findUnique({ where: { id: generation.id } });
          if (!fresh || fresh.status !== "running") {
            throw new PublishAborted("CANCELLED");
          }

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
                contentHash: prefix.contentHashes[i],
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

          const won = await tx.aiGeneration.updateMany({
            where: { id: generation.id, status: "running" },
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
          if (won.count !== 1) {
            throw new PublishAborted("CANCELLED");
          }
          const jobWon = await tx.aiJob.updateMany({
            where: { id: jobId, status: "running" },
            data: { status: "succeeded", completedAt: new Date(), lastErrorCode: null },
          });
          if (jobWon.count !== 1) {
            throw new PublishAborted("CANCELLED");
          }
          await tx.conversation.update({
            where: { id: conversation.id },
            data: { lastMessageAt: new Date() },
          });
        });
      } catch (error) {
        if (error instanceof PublishAborted) {
          if (error.code === "ACL_REVOKED") {
            await this.fail(migrator, jobId, generation.id, "ACL_REVOKED");
          } else {
            await this.alignCancelled(migrator, jobId, generation.id);
          }
          return;
        }
        await this.fail(migrator, jobId, generation.id, "COMMIT_FAILED");
      }
    } finally {
      await Promise.all([migrator.$disconnect(), runtime.$disconnect()]);
    }
  }

  /**
   * queued → running, or reclaim a running attempt whose lease expired.
   * A second live worker gets "busy" and must not call the provider.
   */
  private async claimAttempt(
    migrator: ReturnType<typeof createPrismaClient>,
    jobId: string,
    generationId: string,
    maxAttempts: number,
  ): Promise<"owned" | "busy"> {
    const now = new Date();
    const staleBefore = new Date(now.getTime() - CHAT_RUNNING_LEASE_MS);
    const queued = await migrator.aiJob.updateMany({
      where: { id: jobId, type: CHAT_GENERATE_JOB_TYPE, status: "queued" },
      data: { status: "running", startedAt: now, attemptCount: { increment: 1 } },
    });
    if (queued.count === 1) {
      return this.ownGeneration(migrator, jobId, generationId, now);
    }

    const reclaimed = await migrator.aiJob.updateMany({
      where: {
        id: jobId,
        type: CHAT_GENERATE_JOB_TYPE,
        status: "running",
        startedAt: { lt: staleBefore },
        attemptCount: { lt: maxAttempts },
      },
      data: { startedAt: now, attemptCount: { increment: 1 } },
    });
    if (reclaimed.count === 1) {
      return this.ownGeneration(migrator, jobId, generationId, now);
    }

    const expired = await migrator.aiJob.updateMany({
      where: {
        id: jobId,
        status: "running",
        startedAt: { lt: staleBefore },
        attemptCount: { gte: maxAttempts },
      },
      data: { status: "timed_out", completedAt: now, lastErrorCode: "timed_out" },
    });
    if (expired.count === 1) {
      await migrator.aiGeneration.updateMany({
        where: { id: generationId, status: "running" },
        data: { status: "timed_out", completedAt: now },
      });
    }
    return "busy";
  }

  private async ownGeneration(
    migrator: ReturnType<typeof createPrismaClient>,
    jobId: string,
    generationId: string,
    now: Date,
  ): Promise<"owned" | "busy"> {
    const owned = await migrator.aiGeneration.updateMany({
      where: { id: generationId, status: { in: [...OPEN_STATUSES] } },
      data: { status: "running", startedAt: now },
    });
    if (owned.count === 1) {
      return "owned";
    }
    await this.alignCancelled(migrator, jobId, generationId);
    return "busy";
  }

  private async alignCancelled(
    migrator: ReturnType<typeof createPrismaClient>,
    jobId: string,
    generationId: string,
  ): Promise<void> {
    const now = new Date();
    await migrator.aiGeneration.updateMany({
      where: { id: generationId, status: { in: [...OPEN_STATUSES] } },
      data: { status: "cancelled", completedAt: now },
    });
    await migrator.aiJob.updateMany({
      where: { id: jobId, status: { in: [...OPEN_STATUSES] } },
      data: { status: "cancelled", completedAt: now, lastErrorCode: "CANCELLED" },
    });
  }

  private async fail(
    migrator: ReturnType<typeof createPrismaClient>,
    jobId: string,
    generationId: string,
    code: string,
  ): Promise<void> {
    const now = new Date();
    await migrator.aiGeneration.updateMany({
      where: { id: generationId, status: { in: [...OPEN_STATUSES] } },
      data: { status: "failed", completedAt: now },
    });
    await migrator.aiJob.updateMany({
      where: { id: jobId, status: { in: [...OPEN_STATUSES] } },
      data: { status: "failed", lastErrorCode: code, completedAt: now },
    });
  }

  private async actorMayMutate(
    tx: PrismaTxClient,
    actor: { userId: string; organizationId: string },
    conversation: {
      id: string;
      organizationId: string;
      workspaceId: string;
      ownerUserId: string;
      visibility: string;
    },
  ): Promise<boolean> {
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
  }
}
