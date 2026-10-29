import type { CookieOptions } from "express";

/** HttpOnly session cookie; value is opaque, DB stores only SHA-256 hash. */
export const SESSION_COOKIE_NAME = "spectre_sid";

/** Scaffold absolute TTL (docs/12 proposed starter; not CONFIRMED in journal). */
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function sessionCookieOptions(maxAgeMs: number = SESSION_TTL_MS): CookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: maxAgeMs,
  };
}

export function clearSessionCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
  };
}
