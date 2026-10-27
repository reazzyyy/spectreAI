import { Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { MatterAccess } from "@spectre/access";
import { AiGateway } from "@spectre/ai-gateway";
import { AiController } from "./ai/ai.controller.js";
import { ACTOR_CONTEXT } from "./auth/actor-context.js";
import { ActorGuard } from "./auth/actor.guard.js";
import { HealthController } from "./health/health.controller.js";
import { ApiExceptionFilter } from "./http/api-exception.filter.js";
import { MattersController } from "./matters/matters.controller.js";
import { MattersService } from "./matters/matters.service.js";
import { SYNTHETIC_MATTERS } from "./matters/synthetic-matters.js";
import { AI_JOBS_QUEUE } from "./queue/ai-jobs.queue.js";

@Module({
  controllers: [HealthController, MattersController, AiController],
  providers: [
    { provide: ACTOR_CONTEXT, useValue: null },
    ActorGuard,
    {
      provide: MatterAccess,
      useFactory: () =>
        new MatterAccess({
          async findById(id: string) {
            return SYNTHETIC_MATTERS.find((matter) => matter.id === id) ?? null;
          },
        }),
    },
    MattersService,
    { provide: AiGateway, useFactory: () => new AiGateway() },
    { provide: "AI_JOBS_QUEUE_NAME", useValue: AI_JOBS_QUEUE },
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
  ],
})
export class AppModule {}
