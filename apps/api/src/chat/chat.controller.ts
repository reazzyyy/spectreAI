import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Query,
  UnauthorizedException,
  UnprocessableEntityException,
  UseGuards,
} from "@nestjs/common";
import { ACTOR_CONTEXT, type ActorContext } from "../auth/actor-context.js";
import { ActorGuard } from "../auth/actor.guard.js";
import { decodeCursor, encodeCursor, parseLimit } from "../http/cursor.js";
import { ChatService } from "./chat.service.js";

function toConversationBody(row: {
  id: string;
  organizationId: string;
  workspaceId: string;
  ownerUserId: string;
  createdByUserId: string;
  visibility: string;
  title: string | null;
  status: string;
  lastMessageAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    workspaceId: row.workspaceId,
    ownerUserId: row.ownerUserId,
    createdByUserId: row.createdByUserId,
    visibility: row.visibility,
    title: row.title,
    status: row.status,
    lastMessageAt: row.lastMessageAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toMessageBody(row: {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  createdByUserId: string | null;
  generationId: string | null;
  clientMessageId: string | null;
  createdAt: Date;
}) {
  return {
    id: row.id,
    conversationId: row.conversationId,
    role: row.role,
    content: row.content,
    createdByUserId: row.createdByUserId,
    generationId: row.generationId,
    clientMessageId: row.clientMessageId,
    createdAt: row.createdAt,
  };
}

function parseVisibility(raw: unknown): "PRIVATE" | "WORKSPACE" | null {
  return raw === "PRIVATE" || raw === "WORKSPACE" ? raw : null;
}

@Controller()
@UseGuards(ActorGuard)
export class ChatController {
  constructor(
    @Inject(ChatService) private readonly chat: ChatService,
    @Inject(ACTOR_CONTEXT) private readonly actor: ActorContext | null,
  ) {}

  private requireActor(): ActorContext {
    if (!this.actor) {
      throw new UnauthorizedException();
    }
    return this.actor;
  }

  @Post("workspaces/:workspaceId/conversations")
  async create(
    @Param("workspaceId") workspaceId: string,
    @Body() body: unknown,
  ) {
    const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const visibility = parseVisibility(record.visibility);
    if (!visibility) {
      throw new UnprocessableEntityException();
    }
    const title = typeof record.title === "string" ? record.title : null;
    const created = await this.chat.createConversation(this.requireActor(), workspaceId, {
      visibility,
      title,
    });
    return toConversationBody(created);
  }

  @Get("workspaces/:workspaceId/conversations")
  async list(
    @Param("workspaceId") workspaceId: string,
    @Query("limit") limitRaw?: string,
  ) {
    const page = await this.chat.listConversations(this.requireActor(), workspaceId, {
      limit: parseLimit(limitRaw),
    });
    return {
      items: page.items.map(toConversationBody),
      nextCursor: page.nextCursor
        ? encodeCursor({
            createdAt: page.nextCursor.lastMessageAt ?? new Date(0),
            id: page.nextCursor.id,
          })
        : null,
    };
  }

  @Get("conversations/:conversationId")
  async get(@Param("conversationId") conversationId: string) {
    const row = await this.chat.getConversation(this.requireActor(), conversationId);
    return toConversationBody(row);
  }

  @Get("conversations/:conversationId/messages")
  async listMessages(
    @Param("conversationId") conversationId: string,
    @Query("cursor") cursorRaw?: string,
    @Query("limit") limitRaw?: string,
  ) {
    const page = await this.chat.listMessages(this.requireActor(), conversationId, {
      limit: parseLimit(limitRaw),
      cursor: decodeCursor(cursorRaw),
    });
    return {
      items: page.items.map(toMessageBody),
      nextCursor: page.nextCursor ? encodeCursor(page.nextCursor) : null,
    };
  }

  @Post("conversations/:conversationId/messages")
  async sendMessage(
    @Param("conversationId") conversationId: string,
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const content = typeof record.content === "string" ? record.content : "";
    const clientMessageId =
      typeof record.clientMessageId === "string" ? record.clientMessageId : null;
    const result = await this.chat.sendMessage(this.requireActor(), conversationId, {
      content,
      clientMessageId,
      idempotencyKey: idempotencyKey ?? null,
    });
    return {
      message: toMessageBody(result.message),
      generationId: result.generationId,
      jobId: result.jobId,
      reused: result.reused,
      synthetic: true,
    };
  }

  @Get("ai-generations/:generationId")
  async getGeneration(@Param("generationId") generationId: string) {
    const row = await this.chat.getGeneration(this.requireActor(), generationId);
    return {
      id: row.id,
      conversationId: row.conversationId,
      status: row.status,
      aiJobId: row.aiJobId,
      providerId: row.providerId,
      modelId: row.modelId,
      assistantMessageId: row.assistantMessageId,
      contextSnapshotId: row.contextSnapshotId,
      contextMode: row.contextMode,
      contextHash: row.contextHash,
      promptVersion: row.promptVersion,
      sources: row.sources,
      createdAt: row.createdAt,
      completedAt: row.completedAt,
      synthetic: row.providerId === "synthetic",
    };
  }

  @Post("ai-generations/:generationId/cancel")
  async cancel(@Param("generationId") generationId: string) {
    const row = await this.chat.cancelGeneration(this.requireActor(), generationId);
    return {
      id: row.id,
      status: row.status,
      completedAt: row.completedAt,
    };
  }
}
