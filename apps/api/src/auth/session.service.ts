import { Injectable } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import type { Request } from "express";
import { PrismaService } from "../db/prisma.service.js";
import type { ActorContext } from "./actor-context.js";
import { verifyPassword } from "./password.js";
import { SESSION_COOKIE_NAME, SESSION_TTL_MS } from "./session-cookie.js";

export interface SessionProfile extends ActorContext {
  email: string;
  role: "owner" | "admin" | "member";
}

const ACTOR_PROFILE_KEY = "spectre.actorProfile";

type RequestWithProfile = Request & {
  [ACTOR_PROFILE_KEY]?: SessionProfile | null;
};

/**
 * Server-side opaque sessions. Token plaintext lives only in the cookie;
 * Postgres stores SHA-256(tokenHash). Actor organization comes from Session,
 * never from client headers/body.
 */
@Injectable()
export class SessionService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates a session after credential + active membership checks.
   * Returns null on any auth failure (uniform caller response — no enumeration).
   */
  async login(
    email: string,
    password: string,
    organizationId: string,
  ): Promise<{ rawToken: string; profile: SessionProfile } | null> {
    const user = await this.prisma.client.user.findUnique({
      where: { email },
    });
    if (!user || user.status !== "active") {
      return null;
    }

    const passwordOk = await verifyPassword(user.passwordHash, password);
    if (!passwordOk) {
      return null;
    }

    const membership = await this.prisma.client.organizationMembership.findUnique({
      where: {
        organizationId_userId: { organizationId, userId: user.id },
      },
    });
    if (!membership || membership.status !== "active") {
      return null;
    }

    const rawToken = randomBytes(32).toString("base64url");
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    await this.prisma.client.session.create({
      data: {
        userId: user.id,
        organizationId,
        tokenHash,
        expiresAt,
      },
    });

    await this.prisma.client.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return {
      rawToken,
      profile: {
        userId: user.id,
        organizationId,
        email: user.email,
        role: membership.role,
      },
    };
  }

  /** Revokes the session identified by the cookie, if any. Idempotent. */
  async logout(req: Request): Promise<void> {
    const rawToken = readSessionCookie(req);
    if (!rawToken) {
      return;
    }

    await this.prisma.client.session.updateMany({
      where: {
        tokenHash: hashToken(rawToken),
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Resolves actor from cookie → Session → User active → Membership active.
   * Caches on the request object for /me and guards in the same cycle.
   */
  async resolveProfile(req: Request): Promise<SessionProfile | null> {
    const tagged = req as RequestWithProfile;
    if (ACTOR_PROFILE_KEY in tagged) {
      return tagged[ACTOR_PROFILE_KEY] ?? null;
    }

    const profile = await this.loadProfile(req);
    tagged[ACTOR_PROFILE_KEY] = profile;
    return profile;
  }

  async resolveActor(req: Request): Promise<ActorContext | null> {
    const profile = await this.resolveProfile(req);
    if (!profile) {
      return null;
    }
    return {
      userId: profile.userId,
      organizationId: profile.organizationId,
    };
  }

  private async loadProfile(req: Request): Promise<SessionProfile | null> {
    const rawToken = readSessionCookie(req);
    if (!rawToken) {
      return null;
    }

    const session = await this.prisma.client.session.findUnique({
      where: { tokenHash: hashToken(rawToken) },
    });
    if (!session || session.revokedAt !== null || session.expiresAt <= new Date()) {
      return null;
    }

    const user = await this.prisma.client.user.findUnique({
      where: { id: session.userId },
    });
    if (!user || user.status !== "active") {
      return null;
    }

    const membership = await this.prisma.client.organizationMembership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: session.organizationId,
          userId: session.userId,
        },
      },
    });
    if (!membership || membership.status !== "active") {
      return null;
    }

    return {
      userId: user.id,
      organizationId: session.organizationId,
      email: user.email,
      role: membership.role,
    };
  }
}

function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

function readSessionCookie(req: Request): string | undefined {
  const cookies = req.cookies as Record<string, string> | undefined;
  const value = cookies?.[SESSION_COOKIE_NAME];
  if (typeof value !== "string" || value.length === 0) {
    return undefined;
  }
  return value;
}
