import {
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import type { ActorContext } from "../auth/actor-context.js";
import { PrismaService } from "../db/prisma.service.js";
import type { AssignableOrgRole } from "./parse-org-member.js";

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
 * Org directory (SEC-01) + role patch (SEC-03 thin).
 * Nest authz: list = same org; role change = org owner only; never touch owner row / self.
 * Uses runtime RLS + GUC.
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

      return rows.map((row) => this.toView(row));
    });
  }

  /**
   * Owner sets admin|member on another active non-owner membership.
   * Ownership transfer and self-role change are out of scope.
   */
  async updateRole(
    actor: ActorContext,
    organizationId: string,
    userId: string,
    role: AssignableOrgRole,
  ): Promise<OrganizationMemberView> {
    if (actor.organizationId !== organizationId || actor.orgRole !== "owner") {
      throw new NotFoundException();
    }
    if (actor.userId === userId) {
      throw new UnprocessableEntityException();
    }

    return this.prisma.withActor(actor, async (tx) => {
      const existing = await tx.organizationMembership.findUnique({
        where: {
          organizationId_userId: { organizationId, userId },
        },
        include: {
          user: { select: { id: true, email: true, status: true } },
        },
      });

      if (!existing || existing.status !== "active") {
        throw new NotFoundException();
      }
      if (existing.role === "owner") {
        throw new UnprocessableEntityException();
      }

      const updated = (await tx.organizationMembership.update({
        where: { id: existing.id },
        data: { role },
        include: {
          user: { select: { id: true, email: true, status: true } },
        },
      })) as MembershipWithUser;

      return this.toView(updated);
    });
  }

  private toView(row: MembershipWithUser): OrganizationMemberView {
    return {
      userId: row.userId,
      email: row.user.email,
      role: row.role as OrganizationMemberView["role"],
      status: row.status as OrganizationMemberView["status"],
      userStatus: row.user.status,
    };
  }
}
