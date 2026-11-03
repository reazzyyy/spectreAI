import { timingSafeEqual } from "node:crypto";
import type { CookieOptions, Request } from "express";

/** Readable by JS for double-submit; not a session proof (W-014). */
export const CSRF_COOKIE_NAME = "spectre_csrf";

/** Browser sends the same value as the CSRF cookie. */
export const CSRF_HEADER_NAME = "x-csrf-token";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function isSafeHttpMethod(method: string): boolean {
  return SAFE_METHODS.has(method.toUpperCase());
}

/** Login establishes the session; CSRF cookie is issued on success, not required on the request. */
export function isLoginPath(path: string): boolean {
  const normalized = path.split("?")[0] ?? path;
  return normalized === "/api/v1/auth/login" || normalized.endsWith("/auth/login");
}

export function csrfCookieOptions(maxAgeMs: number): CookieOptions {
  return {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: maxAgeMs,
  };
}

export function clearCsrfCookieOptions(): CookieOptions {
  return {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
  };
}

/**
 * Parses WEB_ORIGIN (comma-separated). Empty → no browser origins allowed
 * when Origin/Referer is present (fail closed for forged Origin).
 */
export function loadAllowedOrigins(
  raw: string | undefined = process.env.WEB_ORIGIN,
): ReadonlySet<string> {
  if (!raw || raw.trim() === "") {
    return new Set();
  }
  return new Set(
    raw
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part.length > 0),
  );
}

export function requestPath(req: Request): string {
  const original = typeof req.originalUrl === "string" ? req.originalUrl : req.url;
  return (original ?? "").split("?")[0] ?? "";
}

/**
 * Browser Origin/Referer must match allowlist when present.
 * Missing both → non-browser tooling (e2e/curl); Origin gate skipped.
 */
export function isAllowedBrowserOrigin(
  req: Request,
  allowed: ReadonlySet<string>,
): boolean {
  const originHeader = headerValue(req.headers.origin);
  if (originHeader) {
    return allowed.has(originHeader);
  }

  const referer = headerValue(req.headers.referer);
  if (!referer) {
    return true;
  }

  try {
    return allowed.has(new URL(referer).origin);
  } catch {
    return false;
  }
}

export function readCsrfCookie(req: Request): string | undefined {
  const cookies = req.cookies as Record<string, string> | undefined;
  const value = cookies?.[CSRF_COOKIE_NAME];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function readCsrfHeader(req: Request): string | undefined {
  const value = headerValue(req.headers[CSRF_HEADER_NAME]);
  return value && value.length > 0 ? value : undefined;
}

/** Constant-time compare for equal-length UTF-8 strings. */
export function csrfTokensMatch(cookieValue: string, headerValue: string): boolean {
  const a = Buffer.from(cookieValue, "utf8");
  const b = Buffer.from(headerValue, "utf8");
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

function headerValue(value: string | string[] | undefined): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0];
  }
  return undefined;
}
