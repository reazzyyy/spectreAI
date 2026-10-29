import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  UnprocessableEntityException,
  UseGuards,
} from "@nestjs/common";
import { ACTOR_CONTEXT, type ActorContext } from "../auth/actor-context.js";
import { ActorGuard } from "../auth/actor.guard.js";
import { MattersService } from "./matters.service.js";
import { parseMatterCreate, parseMatterUpdate } from "./parse-matter.js";

function toBody(matter: {
  id: string;
  organizationId: string;
  title: string;
  clientId: string | null;
  workspaceId: string | null;
  status: string;
}) {
  return {
    id: matter.id,
    organizationId: matter.organizationId,
    title: matter.title,
    clientId: matter.clientId,
    workspaceId: matter.workspaceId,
    status: matter.status,
  };
}

@Controller("matters")
@UseGuards(ActorGuard)
export class MattersController {
  constructor(
    @Inject(MattersService) private readonly matters: MattersService,
    @Inject(ACTOR_CONTEXT) private readonly actor: ActorContext | null,
  ) {}

  private orgId(): string {
    return this.actor?.organizationId ?? "";
  }

  @Get()
  async list() {
    const rows = await this.matters.list(this.orgId());
    return { items: rows.map(toBody) };
  }

  @Post()
  async create(@Body() body: unknown) {
    const input = parseMatterCreate(body);
    if (!input) {
      throw new UnprocessableEntityException();
    }
    const matter = await this.matters.create(this.orgId(), input);
    return toBody(matter);
  }

  @Get(":matterId")
  async get(@Param("matterId") matterId: string) {
    const matter = await this.matters.read(this.orgId(), matterId);
    return toBody(matter);
  }

  @Patch(":matterId")
  async patch(@Param("matterId") matterId: string, @Body() body: unknown) {
    const input = parseMatterUpdate(body);
    if (!input) {
      throw new UnprocessableEntityException();
    }
    const matter = await this.matters.update(this.orgId(), matterId, input);
    return toBody(matter);
  }
}
