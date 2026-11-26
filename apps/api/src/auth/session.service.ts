import { Inject, Injectable } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import type { Request } from "express";
import { PrismaService } from "../db/prisma.service.js";
import type { ActorContext, ActorOrgRole } from "./actor-context.js";
import { verifyPassword } from "./password.js";
import { SESSION_COOKIE_NAME, SESSION_TTL_MS } from "./session-cookie.js";

export interface SessionProfile extends ActorContext {
  email: string;
  /** Organization display name for shell chrome (not an access claim). */
  organizationName: string;
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
  /** Explicit @Inject: tsx ESM does not emit constructor metadata for Nest DI. */
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

/**
   * Login and session resolve use the auth role (D-036).
   * The migrator client stays for bootstrap, outbox, and workers.
   */
  private get authDb() {
    return this.prisma.auth;
  }

  /**
   * Creates a session after credential + active membership checks.
   * Returns null on any auth failure (uniform caller response — no enumeration).
   */
  async login(
    email: string,
    password: string,
    organizationId: string,
  ): Promise<{ rawToken: string; profile: SessionProfile } | null> {
    const rows = await this.authDb.$queryRaw<LoginLookupRow[]>`
      SELECT
        user_id,
        password_hash,
        user_status,
        email,
        membership_role,
        membership_status,
        organization_name
      FROM auth_lookup_login(${email}, ${organizationId})
    `;
    const user = rows[0];
    if (!user || user.user_status !== "active") {
      return null;
    }

    const passwordOk = await verifyPassword(user.password_hash, password);
    if (!passwordOk) {
      return null;
    }

    const orgRole = asOrgRole(user.membership_role);
    if (!orgRole || user.membership_status !== "active") {
      return null;
    }

    const rawToken = randomBytes(32).toString("base64url");
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    const created = await this.authDb.$queryRaw<Array<{ created: boolean }>>`
      SELECT auth_create_session(
        ${user.user_id},
        ${organizationId},
        ${tokenHash},
        ${expiresAt}
      ) AS created
    `;
    if (created[0]?.created !== true) {
      return null;
    }

    return {
      rawToken,
      profile: {
        userId: user.user_id,
        organizationId,
        orgRole,
        email: user.email,
        organizationName: user.organization_name ?? organizationId,
      },
    };
  }

  /** Revokes the session identified by the cookie, if any. Idempotent. */
  async logout(req: Request): Promise<void> {
    const rawToken = readSessionCookie(req);
    if (!rawToken) {
      return;
    }

    const tokenHash = hashToken(rawToken);
    await this.authDb.$queryRaw`
      SELECT auth_revoke_session(${tokenHash}) AS revoked
    `;
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
      orgRole: profile.orgRole,
    };
  }

  private async loadProfile(req: Request): Promise<SessionProfile | null> {
    const rawToken = readSessionCookie(req);
    if (!rawToken) {
      return null;
    }

    const rows = await this.authDb.$queryRaw<SessionLookupRow[]>`
      SELECT
        user_id,
        organization_id,
        email,
        user_status,
        membership_role,
        membership_status,
        organization_name,
        expires_at,
        revoked_at
      FROM auth_resolve_session(${hashToken(rawToken)})
    `;
    const session = rows[0];
    const orgRole = session ? asOrgRole(session.membership_role) : null;
    if (
      !session ||
      !orgRole ||
      session.revoked_at !== null ||
      session.expires_at <= new Date() ||
      session.user_status !== "active" ||
      session.membership_status !== "active" ||
      session.organization_name === null
    ) {
      return null;
    }

    return {
      userId: session.user_id,
      organizationId: session.organization_id,
      orgRole,
      email: session.email,
      organizationName: session.organization_name,
    };
  }
}

interface LoginLookupRow {
  user_id: string;
  password_hash: string;
  user_status: string;
  email: string;
  membership_role: string | null;
  membership_status: string | null;
  organization_name: string | null;
}

interface SessionLookupRow {
  user_id: string;
  organization_id: string;
  email: string;
  user_status: string;
  membership_role: string | null;
  membership_status: string | null;
  organization_name: string | null;
  expires_at: Date;
  revoked_at: Date | null;
}

function asOrgRole(value: string | null): ActorOrgRole | null {
  if (value === "owner" || value === "admin" || value === "member") {
    return value;
  }
  return null;
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
