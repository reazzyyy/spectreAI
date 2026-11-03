import { createPrismaClient } from "@spectre/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  assertDevBootstrapAllowed,
  parseDevBootstrapInput,
  runDevBootstrap,
} from "../src/scripts/dev-bootstrap.js";

describe("dev bootstrap guards", () => {
  it("refuses production and missing BOOTSTRAP_DEV", () => {
    expect(() =>
      assertDevBootstrapAllowed({ NODE_ENV: "production", BOOTSTRAP_DEV: "1" }),
    ).toThrow(/production/);
    expect(() => assertDevBootstrapAllowed({ NODE_ENV: "development" })).toThrow(
      /BOOTSTRAP_DEV/,
    );
  });

  it("parses required env and rejects short passwords", () => {
    expect(() =>
      parseDevBootstrapInput({
        BOOTSTRAP_ORG_NAME: "Dev Org",
        BOOTSTRAP_OWNER_EMAIL: "Owner@LocalHost",
        BOOTSTRAP_OWNER_PASSWORD: "short",
      }),
    ).toThrow(/PASSWORD/);

    expect(
      parseDevBootstrapInput({
        BOOTSTRAP_ORG_NAME: " Dev Org ",
        BOOTSTRAP_OWNER_EMAIL: "Owner@LocalHost",
        BOOTSTRAP_OWNER_PASSWORD: "synthetic-bootstrap-password",
      }),
    ).toEqual({
      orgName: "Dev Org",
      ownerEmail: "owner@localhost",
      ownerPassword: "synthetic-bootstrap-password",
    });
  });
});

describe("runDevBootstrap (migrator DB)", () => {
  const prisma = createPrismaClient({ purpose: "migrator" });
  const orgName = `bootstrap-org-${randomUUID()}`;
  const email = `owner-${randomUUID()}@localhost`;
  const password = "synthetic-bootstrap-password";

  beforeAll(async () => {
    // Ensure clean slate for this unique org/email.
  });

  afterAll(async () => {
    const org = await prisma.organization.findFirst({ where: { name: orgName } });
    if (org) {
      await prisma.organizationMembership.deleteMany({
        where: { organizationId: org.id },
      });
      await prisma.organization.delete({ where: { id: org.id } });
    }
    await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
  });

  it("creates Org+Owner once, then is idempotent; refuses different owner email", async () => {
    const first = await runDevBootstrap(prisma, {
      orgName,
      ownerEmail: email,
      ownerPassword: password,
    });
    expect(first.created).toBe(true);
    expect(first.organizationName).toBe(orgName);
    expect(first.email).toBe(email);
    expect(first.role).toBe("owner");

    const second = await runDevBootstrap(prisma, {
      orgName,
      ownerEmail: email,
      ownerPassword: password,
    });
    expect(second.created).toBe(false);
    expect(second.organizationId).toBe(first.organizationId);
    expect(second.userId).toBe(first.userId);

    await expect(
      runDevBootstrap(prisma, {
        orgName,
        ownerEmail: `other-${randomUUID()}@localhost`,
        ownerPassword: password,
      }),
    ).rejects.toThrow(/already has owner/);
  });
});
