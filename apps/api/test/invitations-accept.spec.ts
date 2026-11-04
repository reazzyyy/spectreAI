import { NotFoundException } from "@nestjs/common";
import { createPrismaClient } from "@spectre/db";
import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { InvitationsService } from "../src/invitations/invitations.service.js";
import { mintInviteToken } from "../src/invitations/invite-token.js";
import { hashPassword } from "../src/auth/password.js";
import { PrismaService } from "../src/db/prisma.service.js";

describe("InvitationsService.accept concurrency", () => {
  const prisma = createPrismaClient({ purpose: "migrator" });
  const orgId = randomUUID();
  const ownerId = randomUUID();
  const inviteEmail = `parallel-${randomUUID()}@localhost`;
  let rawToken = "";

  afterAll(async () => {
    await prisma.organizationInvitation.deleteMany({ where: { organizationId: orgId } });
    await prisma.organizationMembership.deleteMany({ where: { organizationId: orgId } });
    await prisma.user.deleteMany({
      where: { OR: [{ id: ownerId }, { email: inviteEmail }] },
    });
    await prisma.organization.deleteMany({ where: { id: orgId } });
    await prisma.$disconnect();
  });

  it("allows only one of two parallel accepts to succeed", async () => {
    await prisma.organization.create({
      data: { id: orgId, name: `invite-org-${orgId}`, status: "active" },
    });
    await prisma.user.create({
      data: {
        id: ownerId,
        email: `owner-${orgId}@localhost`,
        passwordHash: await hashPassword("synthetic-owner-password"),
        status: "active",
      },
    });
    await prisma.organizationMembership.create({
      data: {
        organizationId: orgId,
        userId: ownerId,
        role: "owner",
        status: "active",
      },
    });

    const minted = mintInviteToken();
    rawToken = minted.rawToken;
    await prisma.organizationInvitation.create({
      data: {
        organizationId: orgId,
        emailNormalized: inviteEmail,
        role: "member",
        tokenHash: minted.tokenHash,
        invitedByUserId: ownerId,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        lastSentAt: new Date(),
        sendCount: 1,
      },
    });

    const service = new InvitationsService({
      migrator: prisma,
    } as unknown as PrismaService);

    const results = await Promise.allSettled([
      service.accept(null, { token: rawToken, password: "synthetic-invitee-password" }),
      service.accept(null, { token: rawToken, password: "synthetic-invitee-password" }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toMatchObject({
      status: "rejected",
      reason: expect.any(NotFoundException),
    });

    const members = await prisma.organizationMembership.findMany({
      where: { organizationId: orgId, role: "member", status: "active" },
    });
    expect(members).toHaveLength(1);
  });
});
