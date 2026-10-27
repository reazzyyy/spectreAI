import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { MatterAccess, type MatterRecord } from "@spectre/access";

@Injectable()
export class MattersService {
  constructor(@Inject(MatterAccess) private readonly access: MatterAccess) {}

  async read(organizationId: string, matterId: string): Promise<MatterRecord> {
    const matter = await this.access.readForOrganization(organizationId, matterId);
    if (!matter) {
      throw new NotFoundException();
    }
    return matter;
  }
}
