import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { ActorContext } from "../auth/actor-context.js";
import { PrismaService } from "../db/prisma.service.js";

export interface OrganizationMemberView {
  userId: string;
  email: string;
  role: "owner" | "admin" | "member";
  status: "active" | "revoked";
  userStatus: string;
}

type MembershipWithUser = {
  userId: string;
  role: string;
  status: string;
  user: { email: string; status: string };
};

/**
 * Org directory (SEC-01 thin): list memberships for the actor's organization.
 * Nest authz: same organizationId only. Uses runtime RLS + GUC.
 */
@Injectable()
export class OrganizationMembersService {
  /** Explicit @Inject: tsx ESM does not emit constructor metadata for Nest DI. */
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(
    actor: ActorContext,
    organizationId: string,
  ): Promise<OrganizationMemberView[]> {
    if (actor.organizationId !== organizationId) {
      throw new NotFoundException();
    }

    return this.prisma.withActor(actor, async (tx) => {
      const rows = (await tx.organizationMembership.findMany({
        where: { organizationId },
        include: {
          user: { select: { id: true, email: true, status: true } },
        },
        orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      })) as MembershipWithUser[];

      return rows.map(
        (row): OrganizationMemberView => ({
          userId: row.userId,
          email: row.user.email,
          role: row.role as OrganizationMemberView["role"],
          status: row.status as OrganizationMemberView["status"],
          userStatus: row.user.status,
        }),
      );
    });
  }
}
