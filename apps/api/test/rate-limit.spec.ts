import { HttpException } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertRateLimit,
  assertRedisConfiguredForProduction,
  RedisUrlRequiredError,
  resetRateLimitClientForTests,
} from "../src/http/rate-limit.js";

const ORIGINAL_APP_ENV = process.env.APP_ENV;
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_REDIS_URL = process.env.REDIS_URL;

function restoreEnv(): void {
  if (ORIGINAL_APP_ENV === undefined) {
    delete process.env.APP_ENV;
  } else {
    process.env.APP_ENV = ORIGINAL_APP_ENV;
  }
  if (ORIGINAL_NODE_ENV === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  }
  if (ORIGINAL_REDIS_URL === undefined) {
    delete process.env.REDIS_URL;
  } else {
    process.env.REDIS_URL = ORIGINAL_REDIS_URL;
  }
  resetRateLimitClientForTests();
}

afterEach(() => {
  restoreEnv();
  vi.restoreAllMocks();
});

describe("production Redis requirement (D-040)", () => {
  it("starts without REDIS_URL when APP_ENV is not production", () => {
    delete process.env.REDIS_URL;
    delete process.env.APP_ENV;
    process.env.NODE_ENV = "production";
    expect(() => assertRedisConfiguredForProduction()).not.toThrow();
  });

  it("refuses to start in production without REDIS_URL", () => {
    delete process.env.REDIS_URL;
    process.env.APP_ENV = "production";
    expect(() => assertRedisConfiguredForProduction()).toThrow(RedisUrlRequiredError);
    try {
      assertRedisConfiguredForProduction();
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).name).toBe("REDIS_URL_REQUIRED");
    }
  });

  it("starts in production when REDIS_URL is set", () => {
    process.env.APP_ENV = "production";
    process.env.REDIS_URL = "redis://127.0.0.1:6379";
    expect(() => assertRedisConfiguredForProduction()).not.toThrow();
  });
});

describe("protected buckets when Redis is down (D-040)", () => {
  it("stays fail-open outside production when Redis is unset", async () => {
    delete process.env.APP_ENV;
    delete process.env.REDIS_URL;
    await expect(assertRateLimit("auth_login", "person@example.test")).resolves.toBeUndefined();
  });

  it("rejects a protected bucket in production when Redis is unset", async () => {
    process.env.APP_ENV = "production";
    delete process.env.REDIS_URL;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(assertRateLimit("auth_login", "person@example.test")).rejects.toMatchObject({
      status: 503,
    });
    expect(errorSpy).toHaveBeenCalledWith("RATE_LIMIT_UNAVAILABLE bucket=auth_login");
    expect(errorSpy.mock.calls.flat().join(" ")).not.toContain("person@example.test");
  });

  it("rejects a protected bucket in production when Redis refuses the connection", async () => {
    process.env.APP_ENV = "production";
    process.env.REDIS_URL = "redis://127.0.0.1:1";
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await assertRateLimit("document_upload", "org:user");
      throw new Error("expected rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(503);
      const body = (error as HttpException).getResponse();
      expect(body).toMatchObject({ code: "RATE_LIMIT_UNAVAILABLE" });
    }
    expect(errorSpy.mock.calls.flat().join(" ")).not.toContain("org:user");
  });

  it("stays fail-open outside production when Redis refuses the connection", async () => {
    delete process.env.APP_ENV;
    process.env.REDIS_URL = "redis://127.0.0.1:1";
    await expect(assertRateLimit("ai_generate", "actor")).resolves.toBeUndefined();
    await expect(assertRateLimit("ai_generate", "actor")).resolves.toBeUndefined();
  });
});
