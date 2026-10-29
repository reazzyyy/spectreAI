import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { ClientAccess, type ClientRecord } from "@spectre/access";
import type { ParsedClientCreate, ParsedClientUpdate } from "./parse-client.js";

@Injectable()
export class ClientsService {
  constructor(@Inject(ClientAccess) private readonly access: ClientAccess) {}

  async list(organizationId: string): Promise<ClientRecord[]> {
    return this.access.listForOrganization(organizationId);
  }

  async read(organizationId: string, clientId: string): Promise<ClientRecord> {
    const client = await this.access.readForOrganization(organizationId, clientId);
    if (!client) {
      throw new NotFoundException();
    }
    return client;
  }

  async create(organizationId: string, input: ParsedClientCreate): Promise<ClientRecord> {
    const client = await this.access.createForOrganization(organizationId, input);
    if (!client) {
      throw new NotFoundException();
    }
    return client;
  }

  async update(
    organizationId: string,
    clientId: string,
    input: ParsedClientUpdate,
  ): Promise<ClientRecord> {
    const client = await this.access.updateForOrganization(organizationId, clientId, input);
    if (!client) {
      throw new NotFoundException();
    }
    return client;
  }
}
