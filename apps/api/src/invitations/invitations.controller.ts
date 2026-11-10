import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  UnauthorizedException,
  UnprocessableEntityException,
  UseGuards,
} from "@nestjs/common";
import { ACTOR_CONTEXT, type ActorContext } from "../auth/actor-context.js";
import { ActorGuard } from "../auth/actor.guard.js";
import { assertRateLimit } from "../http/rate-limit.js";
import { InvitationsService } from "./invitations.service.js";
import { parseInviteAccept, parseInviteCreate } from "./parse-invitation.js";

@Controller("organizations/:organizationId/invitations")
@UseGuards(ActorGuard)
export class OrganizationInvitationsController {
  constructor(
    @Inject(InvitationsService) private readonly invitations: InvitationsService,
    @Inject(ACTOR_CONTEXT) private readonly actor: ActorContext | null,
  ) {}

  private requireActor(): ActorContext {
    if (!this.actor) {
      throw new UnauthorizedException();
    }
    return this.actor;
  }

  @Get()
  async list(@Param("organizationId") organizationId: string) {
    const items = await this.invitations.list(this.requireActor(), organizationId);
    return { items };
  }

  @Post()
  async create(
    @Param("organizationId") organizationId: string,
    @Body() body: unknown,
  ) {
    const input = parseInviteCreate(body);
    if (!input) {
      throw new UnprocessableEntityException();
    }
    return this.invitations.create(this.requireActor(), organizationId, input);
  }

  @Post(":invitationId/resend")
  async resend(
    @Param("organizationId") organizationId: string,
    @Param("invitationId") invitationId: string,
  ) {
    return this.invitations.resend(this.requireActor(), organizationId, invitationId);
  }

  @Delete(":invitationId")
  @HttpCode(200)
  async revoke(
    @Param("organizationId") organizationId: string,
    @Param("invitationId") invitationId: string,
  ) {
    return this.invitations.revoke(this.requireActor(), organizationId, invitationId);
  }
}

@Controller("invitations")
export class InvitationAcceptController {
  constructor(
    @Inject(InvitationsService) private readonly invitations: InvitationsService,
    @Inject(ACTOR_CONTEXT) private readonly actor: ActorContext | null,
  ) {}

  @Post("accept")
  @HttpCode(200)
  async accept(@Body() body: unknown) {
    const input = parseInviteAccept(body);
    if (!input) {
      throw new UnprocessableEntityException();
    }
    await assertRateLimit("invite_accept", input.token.slice(0, 16));
    const result = await this.invitations.accept(this.actor, input);
    return {
      organizationId: result.organizationId,
      userId: result.userId,
      role: result.role,
    };
  }
}
