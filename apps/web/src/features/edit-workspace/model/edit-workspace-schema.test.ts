import { describe, expect, it } from "vitest";
import { editWorkspaceSchema } from "./edit-workspace-schema";

describe("editWorkspaceSchema", () => {
  it("accepts name, empty description and empty client", () => {
    const parsed = editWorkspaceSchema.safeParse({
      name: "Договор",
      description: "",
      clientId: "",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects blank name", () => {
    const parsed = editWorkspaceSchema.safeParse({
      name: "  ",
      description: "x",
      clientId: "",
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts client UUID", () => {
    const parsed = editWorkspaceSchema.safeParse({
      name: "Договор",
      description: "",
      clientId: "11111111-1111-4111-8111-111111111111",
    });
    expect(parsed.success).toBe(true);
  });
});
