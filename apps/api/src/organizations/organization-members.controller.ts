import {
  Controller,
  Get,
  Inject,
  Param,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { ACTOR_CONTEXT, type ActorContext } from "../auth/actor-context.js";
import { ActorGuard } from "../auth/actor.guard.js";
import { OrganizationMembersService } from "./organization-members.service.js";

@Controller("organizations/:organizationId/members")
@UseGuards(ActorGuard)
export class OrganizationMembersController {
  constructor(
    @Inject(OrganizationMembersService)
    private readonly members: OrganizationMembersService,
    @Inject(ACTOR_CONTEXT) private readonly actor: ActorContext | null,
  ) {}

  private requireActor(): ActorContext {
    if (!this.actor) {
      throw new UnauthorizedException();
    }
    return this.actor;
  }

  /** GET — same-org directory (SEC-01). Foreign orgId → 404. */
  @Get()
  async list(@Param("organizationId") organizationId: string) {
    const items = await this.members.list(this.requireActor(), organizationId);
    return { items };
  }
}
