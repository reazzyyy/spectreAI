import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import type { Request } from "express";
import { SESSION_COOKIE_NAME } from "../auth/session-cookie.js";
import {
  csrfTokensMatch,
  isAllowedBrowserOrigin,
  isLoginPath,
  isSafeHttpMethod,
  loadAllowedOrigins,
  readCsrfCookie,
  readCsrfHeader,
  requestPath,
} from "./csrf.js";

/**
 * W-014: Origin allowlist + double-submit cookie for mutating requests.
 * Login skips token check (cookie issued on success). Safe methods skip entirely.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const method = req.method ?? "GET";

    if (isSafeHttpMethod(method)) {
      return true;
    }

    const path = requestPath(req);
    const allowedOrigins = loadAllowedOrigins();

    if (!isAllowedBrowserOrigin(req, allowedOrigins)) {
      throw csrfRejected();
    }

    if (isLoginPath(path)) {
      return true;
    }

    const sessionCookie = readSessionCookie(req);
    const csrfCookie = readCsrfCookie(req);
    if (!sessionCookie && !csrfCookie) {
      // Unauthenticated mutating routes (e.g. synthetic AI) — Origin gate only.
      return true;
    }

    const header = readCsrfHeader(req);
    if (!csrfCookie || !header || !csrfTokensMatch(csrfCookie, header)) {
      throw csrfRejected();
    }

    return true;
  }
}

function readSessionCookie(req: Request): string | undefined {
  const cookies = req.cookies as Record<string, string> | undefined;
  const value = cookies?.[SESSION_COOKIE_NAME];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function csrfRejected(): ForbiddenException {
  return new ForbiddenException({
    code: "CSRF_REJECTED",
    message: "CSRF validation failed",
  });
}
