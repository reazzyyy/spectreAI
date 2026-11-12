import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  ConversationAccess,
  type ConversationRecord,
  type ConversationVisibility,
} from "@spectre/access";
import { randomUUID } from "node:crypto";
import type { ActorContext } from "../auth/actor-context.js";
import { PrismaService } from "../db/prisma.service.js";
import {
  CHAT_GENERATE_JOB_TYPE,
  CHAT_GENERATE_OUTBOX_EVENT,
  CHAT_JOB_MAX_ATTEMPTS,
} from "./chat.constants.js";
import { OutboxPublisherService } from "./outbox-publisher.service.js";

export interface ChatMessageRecord {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  createdByUserId: string | null;
  generationId: string | null;
  clientMessageId: string | null;
  createdAt: Date;
}

export interface SendMessageResult {
  message: ChatMessageRecord;
  generationId: string;
  jobId: string;
  reused: boolean;
}

function chatIdempotencyKey(conversationId: string, key: string): string {
  return `${conversationId}:chat:${key}`;
}

function toMessage(row: {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  createdByUserId: string | null;
  generationId: string | null;
  clientMessageId: string | null;
  createdAt: Date;
}): ChatMessageRecord {
  return {
    id: row.id,
    conversationId: row.conversationId,
    role: row.role as "user" | "assistant",
    content: row.content,
    createdByUserId: row.createdByUserId,
    generationId: row.generationId,
    clientMessageId: row.clientMessageId,
    createdAt: row.createdAt,
  };
}

@Injectable()
export class ChatService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConversationAccess) private readonly conversations: ConversationAccess,
    @Inject(OutboxPublisherService) private readonly outbox: OutboxPublisherService,
  ) {}

  private wsActor(actor: ActorContext) {
    return {
      userId: actor.userId,
      organizationId: actor.organizationId,
      orgRole: actor.orgRole,
    };
  }

  async createConversation(
    actor: ActorContext,
    workspaceId: string,
    input: { visibility: ConversationVisibility; title?: string | null },
  ): Promise<ConversationRecord> {
    const created = await this.conversations.create(this.wsActor(actor), workspaceId, input);
    if (!created) {
      throw new NotFoundException();
    }
    return created;
  }

  async listConversations(
    actor: ActorContext,
    workspaceId: string,
    options?: { limit?: number },
  ) {
    return this.conversations.listForWorkspace(this.wsActor(actor), workspaceId, options);
  }

  async getConversation(
    actor: ActorContext,
    conversationId: string,
  ): Promise<ConversationRecord> {
    const row = await this.conversations.read(this.wsActor(actor), conversationId);
    if (!row) {
      throw new NotFoundException();
    }
    return row;
  }

  async listMessages(
    actor: ActorContext,
    conversationId: string,
    options?: { limit?: number; cursor?: { createdAt: Date; id: string } },
  ): Promise<{ items: ChatMessageRecord[]; nextCursor: { createdAt: Date; id: string } | null }> {
    await this.getConversation(actor, conversationId);
    const limit = Math.min(options?.limit ?? 50, 100);
    return this.prisma.withActor(actor, async (tx) => {
      const rows = await tx.message.findMany({
        where: {
          conversationId,
          organizationId: actor.organizationId,
          ...(options?.cursor
            ? {
                OR: [
                  { createdAt: { lt: options.cursor.createdAt } },
                  {
                    createdAt: options.cursor.createdAt,
                    id: { lt: options.cursor.id },
                  },
                ],
              }
            : {}),
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit + 1,
      });
      const page = rows.slice(0, limit).map(toMessage);
      const nextCursor =
        rows.length > limit
          ? { createdAt: page[page.length - 1]!.createdAt, id: page[page.length - 1]!.id }
          : null;
      return { items: page, nextCursor };
    });
  }

  /**
   * Idempotent send: Message + AiGeneration + AiJob + Outbox in one RLS transaction (docs/32 §8.1).
   */
  async sendMessage(
    actor: ActorContext,
    conversationId: string,
    input: { content: string; clientMessageId?: string | null; idempotencyKey?: string | null },
  ): Promise<SendMessageResult> {
    const content = input.content.trim();
    if (content === "") {
      throw new UnprocessableEntityException();
    }
    if (!(await this.conversations.canMutate(this.wsActor(actor), conversationId))) {
      throw new NotFoundException();
    }
    const conversation = await this.getConversation(actor, conversationId);
    const idemKeyRaw = (input.idempotencyKey ?? input.clientMessageId ?? "").trim();
    if (idemKeyRaw === "") {
      throw new UnprocessableEntityException();
    }
    const idempotencyKey = chatIdempotencyKey(conversationId, idemKeyRaw);

    const result = await this.prisma.withActor(actor, async (tx) => {
      const existingJob = await tx.aiJob.findUnique({
        where: {
          organizationId_idempotencyKey: {
            organizationId: actor.organizationId,
            idempotencyKey,
          },
        },
        include: { aiGeneration: true },
      });
      if (existingJob?.aiGeneration) {
        const userMessage = await tx.message.findUnique({
          where: { id: existingJob.aiGeneration.userMessageId },
        });
        if (!userMessage) {
          throw new ConflictException();
        }
        if (userMessage.content !== content) {
          throw new ConflictException();
        }
        return {
          message: toMessage(userMessage),
          generationId: existingJob.aiGeneration.id,
          jobId: existingJob.id,
          reused: true,
        } satisfies SendMessageResult;
      }

      if (input.clientMessageId) {
        const byClient = await tx.message.findUnique({
          where: {
            conversationId_clientMessageId: {
              conversationId,
              clientMessageId: input.clientMessageId,
            },
          },
        });
        if (byClient && byClient.content !== content) {
          throw new ConflictException();
        }
      }

      const messageId = randomUUID();
      const generationId = randomUUID();
      const jobId = randomUUID();
      const outboxId = randomUUID();

      const message = await tx.message.create({
        data: {
          id: messageId,
          organizationId: actor.organizationId,
          conversationId,
          role: "user",
          content,
          createdByUserId: actor.userId,
          clientMessageId: input.clientMessageId ?? idemKeyRaw,
        },
      });

      await tx.aiJob.create({
        data: {
          id: jobId,
          organizationId: actor.organizationId,
          workspaceId: conversation.workspaceId,
          createdByUserId: actor.userId,
          type: CHAT_GENERATE_JOB_TYPE,
          status: "queued",
          idempotencyKey,
          maxAttempts: CHAT_JOB_MAX_ATTEMPTS,
        },
      });

      await tx.aiGeneration.create({
        data: {
          id: generationId,
          organizationId: actor.organizationId,
          conversationId,
          userMessageId: messageId,
          generationNumber: 1,
          status: "queued",
          aiJobId: jobId,
          providerId: "synthetic",
          modelId: "synthetic-echo",
        },
      });

      await tx.outboxEvent.create({
        data: {
          id: outboxId,
          organizationId: actor.organizationId,
          eventType: CHAT_GENERATE_OUTBOX_EVENT,
          aggregateId: jobId,
          payload: { jobId, type: CHAT_GENERATE_JOB_TYPE },
        },
      });

      await tx.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: message.createdAt },
      });

      return {
        message: toMessage(message),
        generationId,
        jobId,
        reused: false,
      } satisfies SendMessageResult;
    });

    // Best-effort immediate drain; unpublished rows remain for publisher retry.
    await this.outbox.publishPending(1);
    return result;
  }

  async getGeneration(actor: ActorContext, generationId: string) {
    const row = await this.prisma.withActor(
      actor,
      async (tx): Promise<{
        id: string;
        conversationId: string;
        status: string;
        aiJobId: string | null;
        providerId: string | null;
        modelId: string | null;
        assistantMessageId: string | null;
        createdAt: Date;
        completedAt: Date | null;
      } | null> =>
        tx.aiGeneration.findFirst({
          where: { id: generationId, organizationId: actor.organizationId },
        }),
    );
    if (!row) {
      throw new NotFoundException();
    }
    await this.getConversation(actor, row.conversationId);
    return row;
  }

  async cancelGeneration(actor: ActorContext, generationId: string) {
    const generation = await this.getGeneration(actor, generationId);
    if (!(await this.conversations.canMutate(this.wsActor(actor), generation.conversationId))) {
      throw new NotFoundException();
    }
    return this.prisma.withActor(actor, async (tx) => {
      const current = await tx.aiGeneration.findUnique({ where: { id: generationId } });
      if (!current) {
        throw new NotFoundException();
      }
      if (current.status === "succeeded" || current.status === "failed" || current.status === "timed_out") {
        return current;
      }
      if (current.status === "cancelled") {
        return current;
      }
      if (current.status === "running") {
        // Cooperative cancel only: mark cancelled; worker must not publish after this.
        const updated = await tx.aiGeneration.update({
          where: { id: generationId },
          data: { status: "cancelled", completedAt: new Date() },
        });
        if (current.aiJobId) {
          await tx.aiJob.updateMany({
            where: { id: current.aiJobId, status: { in: ["queued", "running"] } },
            data: { status: "cancelled", completedAt: new Date(), lastErrorCode: "CANCELLED" },
          });
        }
        return updated;
      }
      const updated = await tx.aiGeneration.update({
        where: { id: generationId },
        data: { status: "cancelled", completedAt: new Date() },
      });
      if (current.aiJobId) {
        await tx.aiJob.updateMany({
          where: { id: current.aiJobId, status: "queued" },
          data: { status: "cancelled", completedAt: new Date(), lastErrorCode: "CANCELLED" },
        });
      }
      return updated;
    });
  }
}
