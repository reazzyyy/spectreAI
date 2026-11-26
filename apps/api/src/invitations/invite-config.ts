import { exposeInviteDevToken } from "../config/app-env.js";

/** Default scaffold TTL hours — configurable (D-028); not a hardcoded product constant. */
const DEFAULT_INVITE_TTL_HOURS = 72;
const MIN_HOURS = 1;
const MAX_HOURS = 24 * 30;

/**
 * Invitation lifetime from INVITE_TTL_HOURS (D-028).
 * Invalid or missing value falls back to the confirmed default of 72 hours.
 */
export function inviteTtlMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.INVITE_TTL_HOURS;
  const hours = raw === undefined || raw.trim() === "" ? DEFAULT_INVITE_TTL_HOURS : Number(raw);
  if (!Number.isFinite(hours) || hours < MIN_HOURS || hours > MAX_HOURS) {
    throw new Error(
      `INVITE_TTL_HOURS must be a number between ${MIN_HOURS} and ${MAX_HOURS}`,
    );
  }
  return Math.floor(hours * 60 * 60 * 1000);
}

/**
 * Expose the raw invite token in the API response (dev stand-in for email).
 * Gated by APP_ENV (D-042), not by NODE_ENV.
 */
export function exposeInviteTokenInResponse(env: NodeJS.ProcessEnv = process.env): boolean {
  return exposeInviteDevToken(env);
}
