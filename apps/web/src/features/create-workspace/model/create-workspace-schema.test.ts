import { describe, expect, it } from "vitest";
import { createWorkspaceSchema } from "./create-workspace-schema";

describe("createWorkspaceSchema", () => {
  it("accepts PERSONAL and TEAM", () => {
    expect(
      createWorkspaceSchema.safeParse({
        name: "Договор АО",
        visibility: "PERSONAL",
      }).success,
    ).toBe(true);
    expect(
      createWorkspaceSchema.safeParse({
        name: "Команда",
        visibility: "TEAM",
      }).success,
    ).toBe(true);
  });

  it("rejects empty name or bad visibility", () => {
    expect(
      createWorkspaceSchema.safeParse({
        name: "   ",
        visibility: "PERSONAL",
      }).success,
    ).toBe(false);
    expect(
      createWorkspaceSchema.safeParse({
        name: "X",
        visibility: "PUBLIC",
      }).success,
    ).toBe(false);
  });
});
