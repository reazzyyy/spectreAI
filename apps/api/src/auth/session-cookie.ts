import type { CookieOptions } from "express";
import { secureCookieEnabled } from "../config/app-env.js";

/** HttpOnly session cookie; value is opaque, DB stores only SHA-256 hash. */
export const SESSION_COOKIE_NAME = "spectre_sid";

/** Scaffold absolute TTL (docs/12 proposed starter; not CONFIRMED in journal). */
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function sessionCookieOptions(
  maxAgeMs: number = SESSION_TTL_MS,
  env: NodeJS.ProcessEnv = process.env,
): CookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: secureCookieEnabled(env),
    maxAge: maxAgeMs,
  };
}

export function clearSessionCookieOptions(
  env: NodeJS.ProcessEnv = process.env,
): CookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: secureCookieEnabled(env),
    maxAge: 0,
  };
}
