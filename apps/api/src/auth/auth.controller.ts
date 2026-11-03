import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UnprocessableEntityException,
  UseGuards,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { ActorGuard } from "./actor.guard.js";
import { parseLogin } from "./parse-login.js";
import { randomBytes } from "node:crypto";
import {
  clearCsrfCookieOptions,
  CSRF_COOKIE_NAME,
  csrfCookieOptions,
} from "../http/csrf.js";
import {
  clearSessionCookieOptions,
  SESSION_COOKIE_NAME,
  SESSION_TTL_MS,
  sessionCookieOptions,
} from "./session-cookie.js";
import { SessionService } from "./session.service.js";

@Controller("auth")
export class AuthController {
  constructor(@Inject(SessionService) private readonly sessions: SessionService) {}

  @Post("login")
  @HttpCode(200)
  async login(
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    const input = parseLogin(body);
    if (!input) {
      throw new UnprocessableEntityException();
    }

    const result = await this.sessions.login(
      input.email,
      input.password,
      input.organizationId,
    );
    if (!result) {
      // Uniform failure — do not reveal whether email or membership existed.
      throw new UnauthorizedException();
    }

    res.cookie(SESSION_COOKIE_NAME, result.rawToken, sessionCookieOptions());
    res.cookie(
      CSRF_COOKIE_NAME,
      randomBytes(32).toString("base64url"),
      csrfCookieOptions(SESSION_TTL_MS),
    );

    return {
      user: { id: result.profile.userId, email: result.profile.email },
      organization: {
        id: result.profile.organizationId,
        role: result.profile.orgRole,
      },
    };
  }

  @Post("logout")
  @HttpCode(200)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.sessions.logout(req);
    res.clearCookie(SESSION_COOKIE_NAME, clearSessionCookieOptions());
    res.clearCookie(CSRF_COOKIE_NAME, clearCsrfCookieOptions());
    return { ok: true };
  }

  @Get("me")
  @UseGuards(ActorGuard)
  async me(@Req() req: Request) {
    const profile = await this.sessions.resolveProfile(req);
    if (!profile) {
      throw new UnauthorizedException();
    }

    return {
      user: { id: profile.userId, email: profile.email },
      organization: { id: profile.organizationId, role: profile.orgRole },
    };
  }
}
