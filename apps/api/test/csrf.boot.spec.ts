import { describe, expect, it } from "vitest";
import { assertWebOriginConfiguredForProduction } from "../src/http/csrf.js";

describe("assertWebOriginConfiguredForProduction", () => {
  it("allows empty WEB_ORIGIN outside production", () => {
    expect(() =>
      assertWebOriginConfiguredForProduction({ NODE_ENV: "development" }),
    ).not.toThrow();
  });

  it("fails closed in production without WEB_ORIGIN", () => {
    expect(() =>
      assertWebOriginConfiguredForProduction({ NODE_ENV: "production" }),
    ).toThrow(/WEB_ORIGIN/);
  });

  it("accepts a non-empty WEB_ORIGIN in production", () => {
    expect(() =>
      assertWebOriginConfiguredForProduction({
        NODE_ENV: "production",
        WEB_ORIGIN: "https://app.example",
      }),
    ).not.toThrow();
  });
});
