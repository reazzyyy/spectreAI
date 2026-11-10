import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UnauthorizedException,
  UnprocessableEntityException,
  UseGuards,
} from "@nestjs/common";
import { ACTOR_CONTEXT, type ActorContext } from "../auth/actor-context.js";
import { ActorGuard } from "../auth/actor.guard.js";
import { decodeCursor, encodeCursor, parseLimit } from "../http/cursor.js";
import {
  parseMatterLink,
  parseMemberUpsert,
  parseWorkspaceCreate,
  parseWorkspaceUpdate,
} from "./parse-workspace.js";
import { WorkspacesService } from "./workspaces.service.js";

function toWorkspaceBody(workspace: {
  id: string;
  organizationId: string;
  ownerUserId: string;
  name: string;
  description: string | null;
  visibility: string;
  status: string;
  clientId: string | null;
}) {
  return {
    id: workspace.id,
    organizationId: workspace.organizationId,
    ownerUserId: workspace.ownerUserId,
    name: workspace.name,
    description: workspace.description,
    visibility: workspace.visibility,
    status: workspace.status,
    clientId: workspace.clientId,
  };
}

function toMemberBody(member: {
  id: string;
  organizationId: string;
  workspaceId: string;
  userId: string;
  role: string;
  status: string;
}) {
  return {
    id: member.id,
    organizationId: member.organizationId,
    workspaceId: member.workspaceId,
    userId: member.userId,
    role: member.role,
    status: member.status,
  };
}

@Controller("workspaces")
@UseGuards(ActorGuard)
export class WorkspacesController {
  constructor(
    @Inject(WorkspacesService) private readonly workspaces: WorkspacesService,
    @Inject(ACTOR_CONTEXT) private readonly actor: ActorContext | null,
  ) {}

  private requireActor(): ActorContext {
    if (!this.actor) {
      throw new UnauthorizedException();
    }
    return this.actor;
  }

  @Get()
  async list(
    @Query("cursor") cursorRaw?: string,
    @Query("limit") limitRaw?: string,
  ) {
    const page = await this.workspaces.list(this.requireActor(), {
      limit: parseLimit(limitRaw),
      cursor: decodeCursor(cursorRaw),
    });
    return {
      items: page.items.map(toWorkspaceBody),
      nextCursor: page.nextCursor ? encodeCursor(page.nextCursor) : null,
    };
  }

  @Post()
  async create(@Body() body: unknown) {
    const input = parseWorkspaceCreate(body);
    if (!input) {
      throw new UnprocessableEntityException();
    }
    const workspace = await this.workspaces.create(this.requireActor(), input);
    return toWorkspaceBody(workspace);
  }

  @Get(":workspaceId/members")
  async listMembers(@Param("workspaceId") workspaceId: string) {
    const members = await this.workspaces.listMembers(this.requireActor(), workspaceId);
    return { items: members.map(toMemberBody) };
  }

  @Post(":workspaceId/members")
  async upsertMember(@Param("workspaceId") workspaceId: string, @Body() body: unknown) {
    const input = parseMemberUpsert(body);
    if (!input) {
      throw new UnprocessableEntityException();
    }
    const member = await this.workspaces.upsertMember(
      this.requireActor(),
      workspaceId,
      input,
    );
    return toMemberBody(member);
  }

  @Patch(":workspaceId/members/:userId")
  async patchMember(
    @Param("workspaceId") workspaceId: string,
    @Param("userId") userId: string,
    @Body() body: unknown,
  ) {
    const input = parseMemberUpsert({
      ...(typeof body === "object" && body !== null ? body : {}),
      userId,
    });
    if (!input) {
      throw new UnprocessableEntityException();
    }
    const member = await this.workspaces.upsertMember(
      this.requireActor(),
      workspaceId,
      input,
    );
    return toMemberBody(member);
  }

  @Delete(":workspaceId/members/:userId")
  @HttpCode(200)
  async revokeMember(
    @Param("workspaceId") workspaceId: string,
    @Param("userId") userId: string,
  ) {
    const member = await this.workspaces.revokeMember(
      this.requireActor(),
      workspaceId,
      userId,
    );
    return toMemberBody(member);
  }

  @Get(":workspaceId/matters")
  async listMatters(@Param("workspaceId") workspaceId: string) {
    const links = await this.workspaces.listMatters(this.requireActor(), workspaceId);
    return { items: links.map((link) => ({ matterId: link.matterId })) };
  }

  @Post(":workspaceId/matters")
  async linkMatter(@Param("workspaceId") workspaceId: string, @Body() body: unknown) {
    const input = parseMatterLink(body);
    if (!input) {
      throw new UnprocessableEntityException();
    }
    const link = await this.workspaces.linkMatter(
      this.requireActor(),
      workspaceId,
      input.matterId,
    );
    return { matterId: link.matterId };
  }

  @Delete(":workspaceId/matters/:matterId")
  @HttpCode(200)
  async unlinkMatter(
    @Param("workspaceId") workspaceId: string,
    @Param("matterId") matterId: string,
  ) {
    await this.workspaces.unlinkMatter(this.requireActor(), workspaceId, matterId);
    return { ok: true };
  }

  @Get(":workspaceId")
  async get(@Param("workspaceId") workspaceId: string) {
    const workspace = await this.workspaces.read(this.requireActor(), workspaceId);
    return toWorkspaceBody(workspace);
  }

  @Patch(":workspaceId")
  async patch(@Param("workspaceId") workspaceId: string, @Body() body: unknown) {
    const input = parseWorkspaceUpdate(body);
    if (!input) {
      throw new UnprocessableEntityException();
    }
    const workspace = await this.workspaces.update(
      this.requireActor(),
      workspaceId,
      input,
    );
    return toWorkspaceBody(workspace);
  }
}
