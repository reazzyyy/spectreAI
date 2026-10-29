import { Module, Scope } from "@nestjs/common";
import { APP_FILTER, REQUEST } from "@nestjs/core";
import { MatterAccess } from "@spectre/access";
import { AiGateway } from "@spectre/ai-gateway";
import type { Request } from "express";
import { AiController } from "./ai/ai.controller.js";
import { AuthController } from "./auth/auth.controller.js";
import { ACTOR_CONTEXT } from "./auth/actor-context.js";
import { ActorGuard } from "./auth/actor.guard.js";
import { SessionService } from "./auth/session.service.js";
import { PrismaService } from "./db/prisma.service.js";
import { HealthController } from "./health/health.controller.js";
import { ApiExceptionFilter } from "./http/api-exception.filter.js";
import { MattersController } from "./matters/matters.controller.js";
import { MattersService } from "./matters/matters.service.js";
import { createPrismaMatterStore } from "./matters/prisma-matter-store.js";
import { AI_JOBS_QUEUE } from "./queue/ai-jobs.queue.js";

@Module({
  controllers: [
    HealthController,
    AuthController,
    MattersController,
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
      provide: MatterAccess,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) =>
        new MatterAccess(createPrismaMatterStore(prisma.client)),
    },
    MattersService,
    { provide: AiGateway, useFactory: () => new AiGateway() },
    { provide: "AI_JOBS_QUEUE_NAME", useValue: AI_JOBS_QUEUE },
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
  ],
})
export class AppModule {}
