import {
  createPrismaClient,
  type PrismaClient,
  type PrismaTxClient,
} from "@spectre/db";
import { hashPassword } from "../auth/password.js";

/** Accepts typical emails and local-dev forms like `owner@localhost`. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 12;

export interface DevBootstrapInput {
  orgName: string;
  ownerEmail: string;
  ownerPassword: string;
}

export interface DevBootstrapResult {
  created: boolean;
  organizationId: string;
  organizationName: string;
  userId: string;
  email: string;
  role: "owner";
}

export interface DevBootstrapEnv {
  NODE_ENV?: string;
  BOOTSTRAP_DEV?: string;
  BOOTSTRAP_ORG_NAME?: string;
  BOOTSTRAP_OWNER_EMAIL?: string;
  BOOTSTRAP_OWNER_PASSWORD?: string;
}

/**
 * Dev-only first Organization + Owner (W-012). Not an HTTP endpoint.
 * Idempotent for the same org name + owner email; refuses a second owner on that org.
 */
export function assertDevBootstrapAllowed(env: DevBootstrapEnv = process.env): void {
  if (env.NODE_ENV === "production") {
    throw new Error("dev bootstrap refused: NODE_ENV=production (W-012)");
  }
  if (env.BOOTSTRAP_DEV !== "1") {
    throw new Error("dev bootstrap refused: set BOOTSTRAP_DEV=1 to run (W-012)");
  }
}

export function parseDevBootstrapInput(env: DevBootstrapEnv = process.env): DevBootstrapInput {
  const orgName = (env.BOOTSTRAP_ORG_NAME ?? "").trim();
  const ownerEmail = normalizeEmail(env.BOOTSTRAP_OWNER_EMAIL ?? "");
  const ownerPassword = env.BOOTSTRAP_OWNER_PASSWORD ?? "";

  if (orgName.length === 0 || orgName.length > 160) {
    throw new Error("BOOTSTRAP_ORG_NAME is required (1…160 chars)");
  }
  if (!EMAIL_RE.test(ownerEmail)) {
    throw new Error("BOOTSTRAP_OWNER_EMAIL must be a valid email");
  }
  if (ownerPassword.length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      `BOOTSTRAP_OWNER_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters`,
    );
  }

  return { orgName, ownerEmail, ownerPassword };
}

export async function runDevBootstrap(
  prisma: PrismaClient,
  input: DevBootstrapInput,
): Promise<DevBootstrapResult> {
  return prisma.$transaction(async (tx: PrismaTxClient) => {
    const existingOrg = await tx.organization.findFirst({
      where: { name: input.orgName },
    });

    if (existingOrg) {
      return ensureOwnerOnOrganization(tx, existingOrg.id, existingOrg.name, input);
    }

    const passwordHash = await hashPassword(input.ownerPassword);
    let user = await tx.user.findUnique({ where: { email: input.ownerEmail } });
    if (!user) {
      user = await tx.user.create({
        data: {
          email: input.ownerEmail,
          passwordHash,
          status: "active",
        },
      });
    }

    const ownerElsewhere = await tx.organizationMembership.findFirst({
      where: { userId: user.id, role: "owner", status: "active" },
      include: { organization: true },
    });
    if (ownerElsewhere) {
      // Requested org name is new, but this email already owns another org — do not silently retarget.
      throw new Error(
        `email ${input.ownerEmail} already owns organization "${ownerElsewhere.organization.name}"; refuse creating "${input.orgName}"`,
      );
    }

    await tx.user.update({
      where: { id: user.id },
      data: { passwordHash, status: "active" },
    });

    const organization = await tx.organization.create({
      data: { name: input.orgName, status: "active" },
    });

    await tx.organizationMembership.create({
      data: {
        organizationId: organization.id,
        userId: user.id,
        role: "owner",
        status: "active",
      },
    });

    return {
      created: true,
      organizationId: organization.id,
      organizationName: organization.name,
      userId: user.id,
      email: user.email,
      role: "owner",
    };
  });
}

type BootstrapDb = PrismaClient | PrismaTxClient;

async function ensureOwnerOnOrganization(
  db: BootstrapDb,
  organizationId: string,
  organizationName: string,
  input: DevBootstrapInput,
): Promise<DevBootstrapResult> {
  const owners = await db.organizationMembership.findMany({
    where: { organizationId, role: "owner", status: "active" },
    include: { user: true },
  });

  if (owners.length > 1) {
    throw new Error(
      `organization "${organizationName}" has multiple active owners; refuse bootstrap`,
    );
  }

  if (owners.length === 1) {
    const owner = owners[0]!;
    if (owner.user.email !== input.ownerEmail) {
      throw new Error(
        `organization "${organizationName}" already has owner ${owner.user.email}; refuse replacing with ${input.ownerEmail}`,
      );
    }
    // Refresh hash so re-bootstrap always matches current BOOTSTRAP_OWNER_PASSWORD (CI/e2e).
    const passwordHash = await hashPassword(input.ownerPassword);
    await db.user.update({
      where: { id: owner.userId },
      data: { passwordHash, status: "active" },
    });
    return {
      created: false,
      organizationId,
      organizationName,
      userId: owner.userId,
      email: owner.user.email,
      role: "owner",
    };
  }

  const passwordHash = await hashPassword(input.ownerPassword);
  let user = await db.user.findUnique({ where: { email: input.ownerEmail } });
  if (!user) {
    user = await db.user.create({
      data: {
        email: input.ownerEmail,
        passwordHash,
        status: "active",
      },
    });
  } else {
    const ownerElsewhere = await db.organizationMembership.findFirst({
      where: { userId: user.id, role: "owner", status: "active" },
      include: { organization: true },
    });
    if (ownerElsewhere && ownerElsewhere.organizationId !== organizationId) {
      throw new Error(
        `email ${input.ownerEmail} already owns organization "${ownerElsewhere.organization.name}"; refuse attaching to "${organizationName}"`,
      );
    }
    await db.user.update({
      where: { id: user.id },
      data: { passwordHash, status: "active" },
    });
  }

  await db.organizationMembership.create({
    data: {
      organizationId,
      userId: user.id,
      role: "owner",
      status: "active",
    },
  });

  return {
    created: true,
    organizationId,
    organizationName,
    userId: user.id,
    email: user.email,
    role: "owner",
  };
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** CLI entry: migrator Prisma, no password in stdout. */
export async function executeDevBootstrapFromEnv(
  env: DevBootstrapEnv = process.env,
): Promise<DevBootstrapResult> {
  assertDevBootstrapAllowed(env);
  const input = parseDevBootstrapInput(env);
  const prisma = createPrismaClient({ purpose: "migrator" });
  try {
    return await runDevBootstrap(prisma, input);
  } finally {
    await prisma.$disconnect();
  }
}
