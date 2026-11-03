import {
  Inject,
  Injectable,
  NotFoundException,
  Scope,
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  ClientAccess,
  MatterAccess,
  WorkspaceAccess,
  type WorkspaceActor,
  type WorkspaceMatterLink,
  type WorkspaceMemberRecord,
  type WorkspaceRecord,
} from "@spectre/access";
import type { ActorContext } from "../auth/actor-context.js";
import type {
  ParsedMemberUpsert,
  ParsedWorkspaceCreate,
  ParsedWorkspaceUpdate,
} from "./parse-workspace.js";

function toWorkspaceActor(actor: ActorContext): WorkspaceActor {
  return {
    userId: actor.userId,
    organizationId: actor.organizationId,
    orgRole: actor.orgRole,
  };
}

@Injectable({ scope: Scope.REQUEST })
export class WorkspacesService {
  constructor(
    @Inject(WorkspaceAccess) private readonly workspaces: WorkspaceAccess,
    @Inject(MatterAccess) private readonly matters: MatterAccess,
    @Inject(ClientAccess) private readonly clients: ClientAccess,
  ) {}

  async list(actor: ActorContext): Promise<WorkspaceRecord[]> {
    return this.workspaces.listForContent(toWorkspaceActor(actor));
  }

  async read(actor: ActorContext, workspaceId: string): Promise<WorkspaceRecord> {
    const workspace = await this.workspaces.readForContent(
      toWorkspaceActor(actor),
      workspaceId,
    );
    if (!workspace) {
      throw new NotFoundException();
    }
    return workspace;
  }

  async create(actor: ActorContext, input: ParsedWorkspaceCreate): Promise<WorkspaceRecord> {
    await this.assertClientInOrganization(actor.organizationId, input.clientId);

    const workspace = await this.workspaces.createPersonal(toWorkspaceActor(actor), input);
    if (!workspace) {
      throw new NotFoundException();
    }
    return workspace;
  }

  async update(
    actor: ActorContext,
    workspaceId: string,
    input: ParsedWorkspaceUpdate,
  ): Promise<WorkspaceRecord> {
    if (input.clientId !== undefined && input.clientId !== null) {
      await this.assertClientInOrganization(actor.organizationId, input.clientId);
    }

    const workspace = await this.workspaces.updateForOwner(
      toWorkspaceActor(actor),
      workspaceId,
      input,
    );
    if (!workspace) {
      throw new NotFoundException();
    }
    return workspace;
  }

  async listMembers(
    actor: ActorContext,
    workspaceId: string,
  ): Promise<WorkspaceMemberRecord[]> {
    const members = await this.workspaces.listMembersForManager(
      toWorkspaceActor(actor),
      workspaceId,
    );
    if (!members) {
      throw new NotFoundException();
    }
    return members;
  }

  async upsertMember(
    actor: ActorContext,
    workspaceId: string,
    input: ParsedMemberUpsert,
  ): Promise<WorkspaceMemberRecord> {
    const member = await this.workspaces.upsertMember(
      toWorkspaceActor(actor),
      workspaceId,
      input,
    );
    if (!member) {
      throw new NotFoundException();
    }
    return member;
  }

  async revokeMember(
    actor: ActorContext,
    workspaceId: string,
    userId: string,
  ): Promise<WorkspaceMemberRecord> {
    const member = await this.workspaces.revokeMember(
      toWorkspaceActor(actor),
      workspaceId,
      userId,
    );
    if (!member) {
      throw new NotFoundException();
    }
    return member;
  }

  async listMatters(
    actor: ActorContext,
    workspaceId: string,
  ): Promise<WorkspaceMatterLink[]> {
    const links = await this.workspaces.listMatterLinks(
      toWorkspaceActor(actor),
      workspaceId,
    );
    if (!links) {
      throw new NotFoundException();
    }
    return links;
  }

  async linkMatter(
    actor: ActorContext,
    workspaceId: string,
    matterId: string,
  ): Promise<WorkspaceMatterLink> {
    const matter = await this.matters.readForOrganization(actor.organizationId, matterId);
    if (!matter) {
      // Same-org missing and foreign matter → identical validation failure (no cross-org leak).
      throw new UnprocessableEntityException();
    }

    const link = await this.workspaces.linkMatter(
      toWorkspaceActor(actor),
      workspaceId,
      matterId,
    );
    if (!link) {
      throw new NotFoundException();
    }
    return link;
  }

  async unlinkMatter(
    actor: ActorContext,
    workspaceId: string,
    matterId: string,
  ): Promise<void> {
    const ok = await this.workspaces.unlinkMatter(
      toWorkspaceActor(actor),
      workspaceId,
      matterId,
    );
    if (!ok) {
      throw new NotFoundException();
    }
  }

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
