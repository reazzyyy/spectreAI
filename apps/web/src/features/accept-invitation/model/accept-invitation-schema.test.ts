import { describe, expect, it } from "vitest";
import { acceptInvitationSchema } from "./accept-invitation-schema";

describe("acceptInvitationSchema", () => {
  it("accepts token without password (existing session path)", () => {
    const result = acceptInvitationSchema.safeParse({
      token: "a".repeat(16),
      password: "",
    });
    expect(result.success).toBe(true);
  });

  it("requires password length >= 12 when provided", () => {
    expect(
      acceptInvitationSchema.safeParse({
        token: "a".repeat(16),
        password: "short",
      }).success,
    ).toBe(false);
    expect(
      acceptInvitationSchema.safeParse({
        token: "a".repeat(16),
        password: "synthetic-ok-12",
      }).success,
    ).toBe(true);
  });

  it("rejects short tokens", () => {
    expect(
      acceptInvitationSchema.safeParse({
        token: "short",
        password: "",
      }).success,
    ).toBe(false);
  });
});
