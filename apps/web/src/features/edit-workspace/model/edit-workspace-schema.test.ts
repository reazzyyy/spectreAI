import { describe, expect, it } from "vitest";
import { editWorkspaceSchema } from "./edit-workspace-schema";

describe("editWorkspaceSchema", () => {
  it("accepts name and empty description", () => {
    const parsed = editWorkspaceSchema.safeParse({
      name: "Договор",
      description: "",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects blank name", () => {
    const parsed = editWorkspaceSchema.safeParse({
      name: "  ",
      description: "x",
    });
    expect(parsed.success).toBe(false);
  });
});
