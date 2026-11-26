import { HttpException, HttpStatus } from "@nestjs/common";
import { Redis } from "ioredis";
import { isProductionApp } from "../config/app-env.js";
import { redisConnectionFromUrl } from "../queue/redis-connection.js";

/**
 * Redis fixed-window limiter (`INCR` + `EXPIRE`, W-019 technical caps; not tariffs / O-007).
 * Local and CI without Redis stay fail-open (D-040). `APP_ENV=production` refuses to
 * start without `REDIS_URL` and rejects a protected bucket when Redis errors
 * (`503 RATE_LIMIT_UNAVAILABLE`). That rejection is the incident signal: the log
 * line is the bucket name only, never the caller key.
 */

/** Boot failure when production has no Redis URL. `name` is what `main` logs. */
export class RedisUrlRequiredError extends Error {
  constructor() {
    super("REDIS_URL is required when APP_ENV=production (D-040)");
    this.name = "REDIS_URL_REQUIRED";
  }
}

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
let redisDisabled = false;

function getRedis(): Redis | null {
  if (redisDisabled) {
    return null;
  }
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
      enableOfflineQueue: false,
      enableReadyCheck: false,
      connectTimeout: 500,
      lazyConnect: true,
      retryStrategy: () => null,
    });
    redis.on("error", () => {
      // Suppress unhandled error spam when Redis is down.
    });
    return redis;
  } catch {
    redis = null;
    redisDisabled = true;
    return null;
  }
}

/**
 * Production must name a Redis URL before listen. A missing URL is not the
 * same as a later connection error: the process does not start.
 * `NODE_ENV` is not this flag (D-042).
 */
export function assertRedisConfiguredForProduction(
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (!isProductionApp(env)) {
    return;
  }
  if (!env.REDIS_URL?.trim()) {
    throw new RedisUrlRequiredError();
  }
}

function refuseClosed(bucket: RateLimitBucket): never {
  console.error(`RATE_LIMIT_UNAVAILABLE bucket=${bucket}`);
  throw new HttpException(
    { code: "RATE_LIMIT_UNAVAILABLE", message: "Rate limit is unavailable" },
    HttpStatus.SERVICE_UNAVAILABLE,
  );
}

export async function assertRateLimit(
  bucket: RateLimitBucket,
  key: string,
): Promise<void> {
  const client = getRedis();
  if (!client) {
    if (isProductionApp()) {
      refuseClosed(bucket);
    }
    return;
  }

  const { limit, windowSec } = DEFAULTS[bucket];
  const redisKey = `rl:${bucket}:${key}`;
  try {
    if (client.status !== "ready") {
      await Promise.race([
        client.connect(),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("RATE_LIMIT_REDIS_TIMEOUT")), 500);
        }),
      ]);
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
    if (isProductionApp()) {
      refuseClosed(bucket);
    }
    redisDisabled = true;
  }
}

/** Test helper — reset singleton between unit tests. */
export function resetRateLimitClientForTests(): void {
  if (redis) {
    void redis.quit().catch(() => undefined);
  }
  redis = undefined;
  redisDisabled = false;
}
