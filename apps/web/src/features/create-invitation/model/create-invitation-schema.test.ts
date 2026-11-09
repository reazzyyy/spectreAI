import { describe, expect, it } from "vitest";
import { createInvitationSchema } from "./create-invitation-schema";

describe("createInvitationSchema", () => {
  it("accepts valid admin invite", () => {
    const result = createInvitationSchema.safeParse({
      email: " new@example.com ",
      role: "admin",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("new@example.com");
      expect(result.data.role).toBe("admin");
    }
  });

  it("rejects owner role and empty email", () => {
    expect(
      createInvitationSchema.safeParse({ email: "", role: "member" }).success,
    ).toBe(false);
    expect(
      createInvitationSchema.safeParse({
        email: "a@b.co",
        role: "owner",
      }).success,
    ).toBe(false);
  });
});
