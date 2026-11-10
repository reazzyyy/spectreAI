import { HttpException, HttpStatus } from "@nestjs/common";
import { Redis } from "ioredis";
import { redisConnectionFromUrl } from "../queue/redis-connection.js";

/**
 * Redis sliding-window rate limiter (W-019 technical caps; not product tariffs / O-007).
 * Fail-open if Redis is unavailable so local scaffold without Redis still boots;
 * production should monitor Redis and treat fail-open as an incident.
 */

export type RateLimitBucket =
  | "auth_login"
  | "invite_accept"
  | "document_upload"
  | "ai_generate";

const DEFAULTS: Record<RateLimitBucket, { limit: number; windowSec: number }> = {
  auth_login: { limit: 20, windowSec: 60 },
  invite_accept: { limit: 30, windowSec: 60 },
  document_upload: { limit: 30, windowSec: 60 },
  ai_generate: { limit: 60, windowSec: 60 },
};

let redis: Redis | null | undefined;

function getRedis(): Redis | null {
  if (redis !== undefined) {
    return redis;
  }
  const url = process.env.REDIS_URL?.trim();
  if (!url) {
    redis = null;
    return redis;
  }
  try {
    const opts = redisConnectionFromUrl(url);
    redis = new Redis({
      host: opts.host,
      port: opts.port,
      username: opts.username,
      password: opts.password,
      ...(opts.tls ? { tls: opts.tls } : {}),
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
      lazyConnect: true,
    });
    return redis;
  } catch {
    redis = null;
    return redis;
  }
}

export async function assertRateLimit(
  bucket: RateLimitBucket,
  key: string,
): Promise<void> {
  const client = getRedis();
  if (!client) {
    return;
  }

  const { limit, windowSec } = DEFAULTS[bucket];
  const redisKey = `rl:${bucket}:${key}`;
  try {
    if (client.status !== "ready") {
      await client.connect();
    }
    const count = await client.incr(redisKey);
    if (count === 1) {
      await client.expire(redisKey, windowSec);
    }
    if (count > limit) {
      throw new HttpException(
        { code: "RATE_LIMITED", message: "Too many requests" },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  } catch (error) {
    if (error instanceof HttpException) {
      throw error;
    }
    // fail-open on Redis errors
  }
}

/** Test helper — reset singleton between unit tests. */
export function resetRateLimitClientForTests(): void {
  if (redis) {
    void redis.quit().catch(() => undefined);
  }
  redis = undefined;
}
