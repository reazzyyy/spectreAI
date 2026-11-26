import { describe, expect, it } from "vitest";
import { sessionCookieOptions } from "../src/auth/session-cookie.js";
import { assertWebOriginConfiguredForProduction, csrfCookieOptions } from "../src/http/csrf.js";
import { exposeInviteTokenInResponse } from "../src/invitations/invite-config.js";
import { isProductionApp } from "../src/config/app-env.js";

describe("APP_ENV (D-042)", () => {
  it("does not treat NODE_ENV=production as the production flag", () => {
    const env = { NODE_ENV: "production" };
    expect(isProductionApp(env)).toBe(false);
    expect(exposeInviteTokenInResponse(env)).toBe(true);
    expect(sessionCookieOptions(1000, env).secure).toBe(false);
    expect(csrfCookieOptions(1000, env).secure).toBe(false);
    expect(() => assertWebOriginConfiguredForProduction(env)).not.toThrow();
  });

  it("requires WEB_ORIGIN and a secure cookie only when APP_ENV=production", () => {
    const env = { APP_ENV: "production", NODE_ENV: "development" };
    expect(isProductionApp(env)).toBe(true);
    expect(exposeInviteTokenInResponse(env)).toBe(false);
    expect(sessionCookieOptions(1000, env).secure).toBe(true);
    expect(csrfCookieOptions(1000, env).secure).toBe(true);
    expect(() => assertWebOriginConfiguredForProduction(env)).toThrow(/WEB_ORIGIN/);
    expect(() =>
      assertWebOriginConfiguredForProduction({
        ...env,
        WEB_ORIGIN: "https://app.example",
      }),
    ).not.toThrow();
  });

  it("never returns a dev invite token for staging or preview", () => {
    for (const APP_ENV of ["staging", "preview"]) {
      expect(exposeInviteTokenInResponse({ APP_ENV, NODE_ENV: "development" })).toBe(false);
      expect(
        exposeInviteTokenInResponse({
          APP_ENV,
          INVITE_DEV_TOKEN_ENABLED: "1",
        }),
      ).toBe(false);
    }
  });

  it("ignores the dev-token flag in production", () => {
    expect(
      exposeInviteTokenInResponse({
        APP_ENV: "production",
        INVITE_DEV_TOKEN_ENABLED: "1",
        WEB_ORIGIN: "https://app.example",
      }),
    ).toBe(false);
  });

  it("keeps the dev token in a dev environment and when the flag is set outside a deploy", () => {
    expect(exposeInviteTokenInResponse({})).toBe(true);
    expect(exposeInviteTokenInResponse({ APP_ENV: "development" })).toBe(true);
    expect(exposeInviteTokenInResponse({ APP_ENV: "test" })).toBe(true);
    expect(
      exposeInviteTokenInResponse({
        APP_ENV: "qa",
        INVITE_DEV_TOKEN_ENABLED: "1",
      }),
    ).toBe(true);
    expect(exposeInviteTokenInResponse({ APP_ENV: "qa" })).toBe(false);
  });
});
