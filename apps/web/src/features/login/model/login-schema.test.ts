import { describe, expect, it } from "vitest";
import { loginSchema } from "./login-schema";

describe("loginSchema", () => {
  it("accepts a valid payload", () => {
    const parsed = loginSchema.safeParse({
      email: "user@example.com",
      password: "secret",
      organizationId: "11111111-1111-4111-8111-111111111111",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects invalid email and organization id", () => {
    const parsed = loginSchema.safeParse({
      email: "not-an-email",
      password: "",
      organizationId: "bad",
    });
    expect(parsed.success).toBe(false);
  });
});
