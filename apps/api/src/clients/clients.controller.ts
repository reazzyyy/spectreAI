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
import { ClientsService } from "./clients.service.js";
import { parseClientCreate, parseClientUpdate } from "./parse-client.js";

function toBody(client: {
  id: string;
  organizationId: string;
  name: string;
  status: string;
}) {
  return {
    id: client.id,
    organizationId: client.organizationId,
    name: client.name,
    status: client.status,
  };
}

@Controller("clients")
@UseGuards(ActorGuard)
export class ClientsController {
  constructor(
    @Inject(ClientsService) private readonly clients: ClientsService,
    @Inject(ACTOR_CONTEXT) private readonly actor: ActorContext | null,
  ) {}

  private orgId(): string {
    return this.actor?.organizationId ?? "";
  }

  @Get()
  async list() {
    const rows = await this.clients.list(this.orgId());
    return { items: rows.map(toBody) };
  }

  @Post()
  async create(@Body() body: unknown) {
    const input = parseClientCreate(body);
    if (!input) {
      throw new UnprocessableEntityException();
    }
    const client = await this.clients.create(this.orgId(), input);
    return toBody(client);
  }

  @Get(":clientId")
  async get(@Param("clientId") clientId: string) {
    const client = await this.clients.read(this.orgId(), clientId);
    return toBody(client);
  }

  @Patch(":clientId")
  async patch(@Param("clientId") clientId: string, @Body() body: unknown) {
    const input = parseClientUpdate(body);
    if (!input) {
      throw new UnprocessableEntityException();
    }
    const client = await this.clients.update(this.orgId(), clientId, input);
    return toBody(client);
  }
}
