import { Module, Scope } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, REQUEST } from "@nestjs/core";
import {
  ClientAccess,
  ConversationAccess,
  DocumentAccess,
  MatterAccess,
  WorkspaceAccess,
} from "@spectre/access";
import { AiGateway } from "@spectre/ai-gateway";
import type { Request } from "express";
import { AiController } from "./ai/ai.controller.js";
import { AuthController } from "./auth/auth.controller.js";
import { ACTOR_CONTEXT, type ActorContext } from "./auth/actor-context.js";
import { ActorGuard } from "./auth/actor.guard.js";
import { SessionService } from "./auth/session.service.js";
import { AuditService } from "./audit/audit.service.js";
import { ChatController } from "./chat/chat.controller.js";
import { ChatJobProcessor } from "./chat/chat-job.processor.js";
import { ChatService } from "./chat/chat.service.js";
import { OutboxPublisherService } from "./chat/outbox-publisher.service.js";
import { ClientsController } from "./clients/clients.controller.js";
import { ClientsService } from "./clients/clients.service.js";
import {
  createActorScopedClientStore,
  createActorScopedConversationStore,
  createActorScopedDocumentStore,
  createActorScopedMatterStore,
  createActorScopedWorkspaceStore,
} from "./db/actor-scoped-stores.js";
import { PrismaService } from "./db/prisma.service.js";
import { DocumentsController } from "./documents/documents.controller.js";
import { DocumentsService } from "./documents/documents.service.js";
import { AiJobsService } from "./documents/ai-jobs.service.js";
import {
  createLocalObjectStorageFromEnv,
  LocalObjectStorage,
} from "./documents/local-object-storage.js";
import { HealthController } from "./health/health.controller.js";
import { ApiExceptionFilter } from "./http/api-exception.filter.js";
import { CsrfGuard } from "./http/csrf.guard.js";
import { MattersController } from "./matters/matters.controller.js";
import { MattersService } from "./matters/matters.service.js";
import { AI_JOBS_QUEUE } from "./queue/ai-jobs.queue.js";
import { AiJobsQueueProvider } from "./queue/ai-jobs-queue.provider.js";
import { AI_JOBS_QUEUE_TOKEN } from "./queue/ai-jobs.tokens.js";
import {
  InvitationAcceptController,
  OrganizationInvitationsController,
} from "./invitations/invitations.controller.js";
import { InvitationsService } from "./invitations/invitations.service.js";
import { OrganizationMembersController } from "./organizations/organization-members.controller.js";
import { OrganizationMembersService } from "./organizations/organization-members.service.js";
import { WorkspacesController } from "./workspaces/workspaces.controller.js";
import { WorkspacesService } from "./workspaces/workspaces.service.js";

@Module({
  controllers: [
    HealthController,
    AuthController,
    ClientsController,
    MattersController,
    WorkspacesController,
    DocumentsController,
    OrganizationInvitationsController,
    OrganizationMembersController,
    InvitationAcceptController,
    AiController,
    ChatController,
  ],
  providers: [
    PrismaService,
    SessionService,
    AuditService,
    {
      provide: ACTOR_CONTEXT,
      scope: Scope.REQUEST,
      inject: [REQUEST, SessionService],
      useFactory: async (req: Request, sessions: SessionService) =>
        sessions.resolveActor(req),
    },
    ActorGuard,
    { provide: APP_GUARD, useClass: CsrfGuard },
    {
      provide: ClientAccess,
      scope: Scope.REQUEST,
      inject: [PrismaService, ACTOR_CONTEXT],
      useFactory: (prisma: PrismaService, actor: ActorContext | null) =>
        new ClientAccess(createActorScopedClientStore(prisma, actor)),
    },
    {
      provide: MatterAccess,
      scope: Scope.REQUEST,
      inject: [PrismaService, ACTOR_CONTEXT],
      useFactory: (prisma: PrismaService, actor: ActorContext | null) =>
        new MatterAccess(createActorScopedMatterStore(prisma, actor)),
    },
    {
      provide: WorkspaceAccess,
      scope: Scope.REQUEST,
      inject: [PrismaService, ACTOR_CONTEXT],
      useFactory: (prisma: PrismaService, actor: ActorContext | null) =>
        new WorkspaceAccess(createActorScopedWorkspaceStore(prisma, actor)),
    },
    {
      provide: DocumentAccess,
      scope: Scope.REQUEST,
      inject: [PrismaService, ACTOR_CONTEXT],
      useFactory: (prisma: PrismaService, actor: ActorContext | null) =>
        new DocumentAccess(createActorScopedDocumentStore(prisma, actor)),
    },
    {
      provide: ConversationAccess,
      scope: Scope.REQUEST,
      inject: [PrismaService, ACTOR_CONTEXT, WorkspaceAccess],
      useFactory: (
        prisma: PrismaService,
        actor: ActorContext | null,
        workspaces: WorkspaceAccess,
      ) =>
        new ConversationAccess(
          createActorScopedConversationStore(prisma, actor),
          workspaces,
        ),
    },
    {
      provide: LocalObjectStorage,
      useFactory: () => createLocalObjectStorageFromEnv(),
    },
    AiJobsQueueProvider,
    {
      provide: AI_JOBS_QUEUE_TOKEN,
      inject: [AiJobsQueueProvider],
      useFactory: (provider: AiJobsQueueProvider) => provider.queue,
    },
    OutboxPublisherService,
    ChatJobProcessor,
    ChatService,
    AiJobsService,
    ClientsService,
    MattersService,
    WorkspacesService,
    DocumentsService,
    InvitationsService,
    OrganizationMembersService,
    { provide: AiGateway, useFactory: () => new AiGateway() },
    { provide: "AI_JOBS_QUEUE_NAME", useValue: AI_JOBS_QUEUE },
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
  ],
})
export class AppModule {}
