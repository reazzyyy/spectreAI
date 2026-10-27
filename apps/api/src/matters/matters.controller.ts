import { Controller, Get, Inject, Param, UseGuards } from "@nestjs/common";
import { ACTOR_CONTEXT, type ActorContext } from "../auth/actor-context.js";
import { ActorGuard } from "../auth/actor.guard.js";
import { MattersService } from "./matters.service.js";

@Controller("matters")
@UseGuards(ActorGuard)
export class MattersController {
  constructor(
    @Inject(MattersService) private readonly matters: MattersService,
    @Inject(ACTOR_CONTEXT) private readonly actor: ActorContext | null,
  ) {}

  @Get(":matterId")
  async get(@Param("matterId") matterId: string) {
    const matter = await this.matters.read(this.actor?.organizationId ?? "", matterId);
    return {
      id: matter.id,
      organizationId: matter.organizationId,
      title: matter.title,
      clientId: matter.clientId,
      workspaceId: matter.workspaceId,
    };
  }
}
