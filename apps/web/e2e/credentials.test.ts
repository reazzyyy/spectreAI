import { describe, expect, it } from "vitest";
import { readSmokeCredentials } from "./credentials";

describe("readSmokeCredentials", () => {
  it("returns null when organization id is missing", () => {
    expect(
      readSmokeCredentials({
        BOOTSTRAP_OWNER_EMAIL: "owner@example.com",
        BOOTSTRAP_OWNER_PASSWORD: "long-enough-secret",
      }),
    ).toBeNull();
  });

  it("prefers E2E_* over BOOTSTRAP_*", () => {
    expect(
      readSmokeCredentials({
        BOOTSTRAP_OWNER_EMAIL: "boot@example.com",
        BOOTSTRAP_OWNER_PASSWORD: "bootstrap-secret",
        E2E_EMAIL: "e2e@example.com",
        E2E_PASSWORD: "e2e-secret-12",
        E2E_ORGANIZATION_ID: "0b88c370-8d00-4816-bbe4-d32aeb9aab3a",
      }),
    ).toEqual({
      email: "e2e@example.com",
      password: "e2e-secret-12",
      organizationId: "0b88c370-8d00-4816-bbe4-d32aeb9aab3a",
    });
  });
});
