import { describe, expect, it } from "vitest";
import { createWorkspaceSchema } from "./create-workspace-schema";

describe("createWorkspaceSchema", () => {
  it("accepts a name-only payload", () => {
    const parsed = createWorkspaceSchema.safeParse({ name: "Договор АО" });
    expect(parsed.success).toBe(true);
  });

  it("rejects empty name", () => {
    const parsed = createWorkspaceSchema.safeParse({ name: "   " });
    expect(parsed.success).toBe(false);
  });
});
