import { Module, Scope } from "@nestjs/common";
import { APP_FILTER, REQUEST } from "@nestjs/core";
import { ClientAccess, MatterAccess, WorkspaceAccess } from "@spectre/access";
import { AiGateway } from "@spectre/ai-gateway";
import type { Request } from "express";
import { AiController } from "./ai/ai.controller.js";
import { AuthController } from "./auth/auth.controller.js";
import { ACTOR_CONTEXT, type ActorContext } from "./auth/actor-context.js";
import { ActorGuard } from "./auth/actor.guard.js";
import { SessionService } from "./auth/session.service.js";
import { ClientsController } from "./clients/clients.controller.js";
import { ClientsService } from "./clients/clients.service.js";
import {
  createActorScopedClientStore,
  createActorScopedMatterStore,
  createActorScopedWorkspaceStore,
} from "./db/actor-scoped-stores.js";
import { PrismaService } from "./db/prisma.service.js";
import { HealthController } from "./health/health.controller.js";
import { ApiExceptionFilter } from "./http/api-exception.filter.js";
import { MattersController } from "./matters/matters.controller.js";
import { MattersService } from "./matters/matters.service.js";
import { AI_JOBS_QUEUE } from "./queue/ai-jobs.queue.js";
import { WorkspacesController } from "./workspaces/workspaces.controller.js";
import { WorkspacesService } from "./workspaces/workspaces.service.js";

@Module({
  controllers: [
    HealthController,
    AuthController,
    ClientsController,
    MattersController,
    WorkspacesController,
    AiController,
  ],
  providers: [
    PrismaService,
    SessionService,
    {
      provide: ACTOR_CONTEXT,
      scope: Scope.REQUEST,
      inject: [REQUEST, SessionService],
      useFactory: async (req: Request, sessions: SessionService) =>
        sessions.resolveActor(req),
    },
    ActorGuard,
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
    ClientsService,
    MattersService,
    WorkspacesService,
    { provide: AiGateway, useFactory: () => new AiGateway() },
    { provide: "AI_JOBS_QUEUE_NAME", useValue: AI_JOBS_QUEUE },
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
  ],
})
export class AppModule {}
