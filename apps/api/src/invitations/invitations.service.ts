import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import type { OrganizationInvitation, PrismaTxClient } from "@spectre/db";
import type { ActorContext } from "../auth/actor-context.js";
import { hashPassword } from "../auth/password.js";
import { PrismaService } from "../db/prisma.service.js";
import { exposeInviteTokenInResponse, inviteTtlMs } from "./invite-config.js";
import { hashInviteToken, mintInviteToken } from "./invite-token.js";
import type { InvitableRole, ParsedInviteAccept, ParsedInviteCreate } from "./parse-invitation.js";

export interface InvitationView {
  id: string;
  organizationId: string;
  emailNormalized: string;
  role: InvitableRole;
  invitedByUserId: string;
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  lastSentAt: string | null;
  sendCount: number;
  /** Present only outside production (dev outbox substitute). Never log. */
  devToken?: string;
}

/**
 * Organization invitations (W-012 / S4c). Uses migrator DB like auth (token lookup / user create)
 * until SECURITY DEFINER helpers exist. Nest authz remains mandatory.
 */
@Injectable()
export class InvitationsService {
  constructor(private readonly prisma: PrismaService) {}

  private get db() {
    return this.prisma.migrator;
  }

  assertCanManageInvites(actor: ActorContext, organizationId: string): void {
    if (actor.organizationId !== organizationId || actor.orgRole !== "owner") {
      throw new NotFoundException();
    }
  }

  async list(actor: ActorContext, organizationId: string): Promise<InvitationView[]> {
    this.assertCanManageInvites(actor, organizationId);
    const rows = await this.db.organizationInvitation.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((row: OrganizationInvitation) => toView(row));
  }

  async create(
    actor: ActorContext,
    organizationId: string,
    input: ParsedInviteCreate,
  ): Promise<InvitationView> {
    this.assertCanManageInvites(actor, organizationId);
    const ttlMs = inviteTtlMs();

    const existingMember = await this.db.organizationMembership.findFirst({
      where: {
        organizationId,
        status: "active",
        user: { email: input.email },
      },
    });
    if (existingMember) {
      throw new UnprocessableEntityException();
    }

    const { rawToken, tokenHash } = mintInviteToken();
    const now = new Date();

    const row = await this.db.$transaction(async (tx: PrismaTxClient) => {
      // Supersede prior pending invites only after TTL is known-valid.
      await tx.organizationInvitation.updateMany({
        where: {
          organizationId,
          emailNormalized: input.email,
          acceptedAt: null,
          revokedAt: null,
        },
        data: { revokedAt: now },
      });

      return tx.organizationInvitation.create({
        data: {
          organizationId,
          emailNormalized: input.email,
          role: input.role,
          tokenHash,
          invitedByUserId: actor.userId,
          expiresAt: new Date(now.getTime() + ttlMs),
          lastSentAt: now,
          sendCount: 1,
        },
      });
    });

    return toView(row, exposeInviteTokenInResponse() ? rawToken : undefined);
  }

  async resend(
    actor: ActorContext,
    organizationId: string,
    invitationId: string,
  ): Promise<InvitationView> {
    this.assertCanManageInvites(actor, organizationId);
    const ttlMs = inviteTtlMs();
    const existing = await this.findPending(organizationId, invitationId);
    const { rawToken, tokenHash } = mintInviteToken();
    const now = new Date();
    const row = await this.db.organizationInvitation.update({
      where: { id: existing.id },
      data: {
        tokenHash,
        expiresAt: new Date(now.getTime() + ttlMs),
        lastSentAt: now,
        sendCount: { increment: 1 },
      },
    });
    return toView(row, exposeInviteTokenInResponse() ? rawToken : undefined);
  }

  async revoke(
    actor: ActorContext,
    organizationId: string,
    invitationId: string,
  ): Promise<InvitationView> {
    this.assertCanManageInvites(actor, organizationId);
    const existing = await this.findPending(organizationId, invitationId);
    const row = await this.db.organizationInvitation.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() },
    });
    return toView(row);
  }

  /**
   * Accept invite. New user: password required. Existing user: session email must match invite.
   * Token claim is atomic (conditional update) so parallel accepts cannot both succeed.
   */
  async accept(
    actor: ActorContext | null,
    input: ParsedInviteAccept,
  ): Promise<{ organizationId: string; userId: string; role: InvitableRole }> {
    const tokenHash = hashInviteToken(input.token);

    // Preflight for clearer errors before claiming (not a substitute for atomic claim).
    const preview = await this.db.organizationInvitation.findUnique({
      where: { tokenHash },
    });
    if (!preview || !isPending(preview) || preview.expiresAt.getTime() <= Date.now()) {
      throw new NotFoundException();
    }
    if (preview.role !== "admin" && preview.role !== "member") {
      throw new ForbiddenException();
    }

    const existingUser = await this.db.user.findUnique({
      where: { email: preview.emailNormalized },
    });

    let passwordHash: string | undefined;
    if (!existingUser) {
      if (!input.password) {
        throw new UnprocessableEntityException();
      }
      passwordHash = await hashPassword(input.password);
    } else {
      if (!actor || actor.userId !== existingUser.id) {
        throw new ForbiddenException();
      }
      if (existingUser.email !== preview.emailNormalized || existingUser.status !== "active") {
        throw new ForbiddenException();
      }
    }

    return this.db.$transaction(async (tx: PrismaTxClient) => {
      const claimed = await tx.organizationInvitation.updateMany({
        where: {
          tokenHash,
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { acceptedAt: new Date() },
      });
      if (claimed.count !== 1) {
        throw new NotFoundException();
      }

      const invite = await tx.organizationInvitation.findUniqueOrThrow({
        where: { tokenHash },
      });
      if (invite.role !== "admin" && invite.role !== "member") {
        throw new ForbiddenException();
      }

      let userId: string;
      if (!existingUser) {
        const created = await tx.user.create({
          data: {
            email: invite.emailNormalized,
            passwordHash: passwordHash!,
            status: "active",
          },
        });
        userId = created.id;
      } else {
        userId = existingUser.id;
      }

      const membership = await tx.organizationMembership.findUnique({
        where: {
          organizationId_userId: {
            organizationId: invite.organizationId,
            userId,
          },
        },
      });
      if (!membership) {
        await tx.organizationMembership.create({
          data: {
            organizationId: invite.organizationId,
            userId,
            role: invite.role,
            status: "active",
          },
        });
      } else if (membership.status !== "active") {
        await tx.organizationMembership.update({
          where: { id: membership.id },
          data: { status: "active", role: invite.role },
        });
      }

      return {
        organizationId: invite.organizationId,
        userId,
        role: invite.role as InvitableRole,
      };
    });
  }

  private async findPending(
    organizationId: string,
    invitationId: string,
  ): Promise<OrganizationInvitation> {
    const row = await this.db.organizationInvitation.findFirst({
      where: { id: invitationId, organizationId },
    });
    if (!row || !isPending(row)) {
      throw new NotFoundException();
    }
    return row;
  }
}

function isPending(row: OrganizationInvitation): boolean {
  return row.acceptedAt === null && row.revokedAt === null;
}

function toView(row: OrganizationInvitation, devToken?: string): InvitationView {
  const view: InvitationView = {
    id: row.id,
    organizationId: row.organizationId,
    emailNormalized: row.emailNormalized,
    role: row.role as InvitableRole,
    invitedByUserId: row.invitedByUserId,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    acceptedAt: row.acceptedAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    lastSentAt: row.lastSentAt?.toISOString() ?? null,
    sendCount: row.sendCount,
  };
  if (devToken) {
    view.devToken = devToken;
  }
  return view;
}
