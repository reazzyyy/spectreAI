import {
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { ClientAccess, MatterAccess, type MatterRecord } from "@spectre/access";
import type { ParsedMatterCreate, ParsedMatterUpdate } from "./parse-matter.js";

@Injectable()
export class MattersService {
  constructor(
    @Inject(MatterAccess) private readonly access: MatterAccess,
    @Inject(ClientAccess) private readonly clients: ClientAccess,
  ) {}

  async list(organizationId: string): Promise<MatterRecord[]> {
    return this.access.listForOrganization(organizationId);
  }

  async read(organizationId: string, matterId: string): Promise<MatterRecord> {
    const matter = await this.access.readForOrganization(organizationId, matterId);
    if (!matter) {
      throw new NotFoundException();
    }
    return matter;
  }

  async create(organizationId: string, input: ParsedMatterCreate): Promise<MatterRecord> {
    await this.assertClientInOrganization(organizationId, input.clientId);
    const matter = await this.access.createForOrganization(organizationId, input);
    if (!matter) {
      throw new NotFoundException();
    }
    return matter;
  }

  async update(
    organizationId: string,
    matterId: string,
    input: ParsedMatterUpdate,
  ): Promise<MatterRecord> {
    if (input.clientId !== undefined) {
      await this.assertClientInOrganization(organizationId, input.clientId);
    }
    const matter = await this.access.updateForOrganization(organizationId, matterId, input);
    if (!matter) {
      throw new NotFoundException();
    }
    return matter;
  }

  /**
   * clientId must reference a Client in the actor org (or be null/omitted).
   * Missing and foreign clientIds share the same validation failure — no cross-org leak.
   */
  private async assertClientInOrganization(
    organizationId: string,
    clientId: string | null | undefined,
  ): Promise<void> {
    if (clientId === undefined || clientId === null) {
      return;
    }
    const client = await this.clients.readForOrganization(organizationId, clientId);
    if (!client) {
      throw new UnprocessableEntityException();
    }
  }
}
