import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function mintInviteToken(): { rawToken: string; tokenHash: string } {
  const rawToken = randomBytes(32).toString("base64url");
  return { rawToken, tokenHash: hashInviteToken(rawToken) };
}

export function hashInviteToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

export function inviteTokensMatch(rawToken: string, tokenHash: string): boolean {
  const a = Buffer.from(hashInviteToken(rawToken), "utf8");
  const b = Buffer.from(tokenHash, "utf8");
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}
