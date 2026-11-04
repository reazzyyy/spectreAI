/** Default scaffold TTL hours — configurable (O-011); not a CONFIRMED product constant. */
const DEFAULT_INVITE_TTL_HOURS = 72;
const MIN_HOURS = 1;
const MAX_HOURS = 24 * 30;

/**
 * Invitation lifetime from INVITE_TTL_HOURS (O-011).
 * Invalid/missing → scaffold default 72h (documented as config, not journal CONFIRMED).
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

/** Expose raw token in API only outside production (dev outbox substitute). */
export function exposeInviteTokenInResponse(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV !== "production";
}
